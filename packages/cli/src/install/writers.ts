import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { instructionMarkerBlock, RAI_INSTRUCTIONS_BEGIN, RAI_INSTRUCTIONS_END } from "./templates.js";
import type { InstallOperation, InstallPlan } from "./types.js";

export type InstallWriteAction = "created" | "updated" | "skipped";
export type InstallWriteStatus = "ok" | "error";

export interface InstallWriteOperationResult {
  path: string;
  platform: string;
  kind: InstallOperation["kind"];
  action: InstallWriteAction;
  status: InstallWriteStatus;
  error?: string;
}

export interface InstallWriteResult {
  status: InstallWriteStatus;
  operations: InstallWriteOperationResult[];
}

export async function applyInstallPlan(plan: InstallPlan): Promise<InstallWriteResult> {
  if (plan.status !== "ok") {
    return { status: "error", operations: [] };
  }

  const operations: InstallWriteOperationResult[] = [];
  for (const operation of plan.operations) {
    const result = await applyOperation(operation);
    operations.push(result);
    if (result.status === "error") return { status: "error", operations };
  }

  return { status: "ok", operations };
}

async function applyOperation(operation: InstallOperation): Promise<InstallWriteOperationResult> {
  if (operation.dryRun) return operationResult(operation, "skipped", "ok");

  try {
    const current = await readOptional(operation.path);
    const next = renderOperation(operation, current);
    await atomicWrite(operation.path, next);
    return operationResult(operation, current === null ? "created" : "updated", "ok");
  } catch (error) {
    return operationResult(operation, "skipped", "error", error instanceof Error ? error.message : String(error));
  }
}

function renderOperation(operation: InstallOperation, current: string | null): string {
  switch (operation.mode) {
    case "merge-json":
      return mergeJsonMcpConfig(current, operation);
    case "replace-toml-section":
      return replaceTomlMcpSection(current, operation);
    case "replace-marker-block":
      return replaceMarkerBlock(current, instructionMarkerBlock(operation.platform));
  }
}

function mergeJsonMcpConfig(current: string | null, operation: InstallOperation): string {
  let parsed: Record<string, unknown>;
  if (current === null || current.trim().length === 0) {
    parsed = {};
  } else {
    try {
      parsed = JSON.parse(current) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Invalid JSON in ${operation.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const mcp = isRecord(parsed.mcp) ? parsed.mcp : {};
  parsed.mcp = { ...mcp, rai: operation.mcpServer ?? { command: "rai", args: ["mcp"] } };
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function replaceTomlMcpSection(current: string | null, operation: InstallOperation): string {
  const withoutRai = removeTomlSection(current ?? "", "mcp_servers.rai").trimEnd();
  const command = operation.mcpServer?.command ?? "rai";
  const args = operation.mcpServer?.args ?? [];
  const section = [`[mcp_servers.rai]`, `command = ${tomlString(command)}`, `args = [${args.map(tomlString).join(", ")}]`].join("\n");
  return `${withoutRai ? `${withoutRai}\n\n` : ""}${section}\n`;
}

function removeTomlSection(content: string, sectionName: string): string {
  const lines = content.split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (header) skipping = header[1] === sectionName;
    if (!skipping) kept.push(line);
  }
  return kept.join("\n");
}

function replaceMarkerBlock(current: string | null, block: string): string {
  if (current === null || current.length === 0) return `${block}\n`;
  const start = current.indexOf(RAI_INSTRUCTIONS_BEGIN);
  const end = current.indexOf(RAI_INSTRUCTIONS_END);
  if (start >= 0 && end >= start) {
    const endIndex = end + RAI_INSTRUCTIONS_END.length;
    return `${current.slice(0, start)}${block}${current.slice(endIndex)}`;
  }
  const separator = current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${separator}${block}\n`;
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function atomicWrite(path: string, content: string): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, path);
}

function operationResult(operation: InstallOperation, action: InstallWriteAction, status: InstallWriteStatus, error?: string): InstallWriteOperationResult {
  return { path: operation.path, platform: operation.platform, kind: operation.kind, action, status, ...(error ? { error } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
