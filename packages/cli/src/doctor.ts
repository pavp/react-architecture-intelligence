import { AnalyzerRegistry, buildMcpServer, resolveConfig } from "@rai/core";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectInstallPlatforms } from "./install/detect.js";
import type { InstallPlanningContext } from "./install/types.js";

export type DoctorStatus = "pass" | "warn" | "fail";
export type DoctorCategory = "runtime" | "project" | "storage" | "mcp" | "filesystem";

export interface DoctorCheck {
  category: DoctorCategory;
  name: string;
  status: DoctorStatus;
  message: string;
  remediation?: string;
  blocking: boolean;
}

export interface DoctorReport {
  status: DoctorStatus;
  projectRoot: string;
  checks: DoctorCheck[];
}

export interface NativeProbeResult { sqlite: boolean; vector: boolean; version?: string }

export interface RunDoctorInput extends Partial<InstallPlanningContext> {
  nodeVersion?: string;
  cliEntryPath?: string;
  nativeProbe?: () => NativeProbeResult;
}

export async function runDoctor(input: RunDoctorInput = {}): Promise<DoctorReport> {
  const projectRoot = resolve(input.projectRoot ?? process.cwd());
  const homeDir = resolve(input.homeDir ?? process.env.HOME ?? projectRoot);
  const configDir = resolve(input.configDir ?? process.env.XDG_CONFIG_HOME ?? join(homeDir, ".config"));
  const cliEntryPath = input.cliEntryPath ?? defaultCliEntryPath(projectRoot);
  const context = { projectRoot, homeDir, configDir };
  const checks: DoctorCheck[] = [
    checkNodeVersion(input.nodeVersion ?? process.versions.node),
    checkProjectRoot(projectRoot),
    checkCliBuild(cliEntryPath),
    checkNativeDependencies(input.nativeProbe ?? defaultNativeProbe),
    checkMcpConfig(context),
    checkMcpConstruction(projectRoot),
    checkFilesystemSuitability(context),
  ];

  return { status: summarize(checks), projectRoot, checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [`RAI doctor: ${report.status}`, `Project: ${report.projectRoot}`];
  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.category} / ${check.name}: ${check.message}`);
    if (check.remediation) lines.push(`  fix: ${check.remediation}`);
  }
  return `${lines.join("\n")}\n`;
}

function checkNodeVersion(version: string): DoctorCheck {
  const major = Number(version.split(".")[0] ?? "0");
  if (major >= 22) return pass("runtime", "Node >=22", `Node ${version} satisfies runtime requirement.`);
  return fail("runtime", "Node >=22", `Node ${version} is below required major 22.`, "Install Node.js 22 or newer.");
}

function checkProjectRoot(projectRoot: string): DoctorCheck {
  if (!existsSync(projectRoot)) return fail("project", "Project root", `${projectRoot} does not exist.`, "Run rai doctor from an existing project root or pass a valid dir.");
  if (existsSync(join(projectRoot, "package.json")) || existsSync(join(projectRoot, ".git"))) return pass("project", "Project root", "Project root is detectable.");
  return warn("project", "Project root", "No package.json or .git directory found.", "Run from a repository root for best results.");
}

function checkCliBuild(cliEntryPath: string): DoctorCheck {
  if (existsSync(cliEntryPath)) return pass("runtime", "CLI build", `CLI entry exists at ${cliEntryPath}.`);
  return warn("runtime", "CLI build", `CLI entry not found at ${cliEntryPath}.`, "Run pnpm build before smoke-testing the packaged CLI.");
}

function checkNativeDependencies(probe: () => NativeProbeResult): DoctorCheck {
  try {
    const result = probe();
    if (result.sqlite && result.vector) return pass("storage", "SQLite/vector native dependencies", `better-sqlite3 and sqlite-vec are ready${result.version ? ` (${result.version})` : ""}.`);
    return fail("storage", "SQLite/vector native dependencies", "SQLite or vector extension probe failed.", "Reinstall dependencies with pnpm install and verify better-sqlite3 native build output.");
  } catch (error) {
    return fail("storage", "SQLite/vector native dependencies", error instanceof Error ? error.message : String(error), "Reinstall dependencies with pnpm install and verify better-sqlite3 native build output.");
  }
}

function checkMcpConfig(context: InstallPlanningContext): DoctorCheck {
  const detected = detectInstallPlatforms(context);
  if (detected.length === 0) return warn("mcp", "MCP config", "No supported platform MCP config was detected.", "Run rai install --dry-run to preview config setup.");
  const invalid = detected.flatMap((target) => {
    const result = parseJsonConfig(target.mcpConfigPath);
    return result ? [result] : [];
  }).find((result) => result.status === "fail");
  if (invalid) return invalid;
  const platforms = detected.map((target) => target.id).join(", ");
  return pass("mcp", "MCP config", `Detected valid MCP config for ${platforms}.`);
}

function parseJsonConfig(path: string): DoctorCheck | null {
  if (!/\.jsonc?$/.test(path)) return null;
  try {
    JSON.parse(readFileSync(path, "utf8"));
    return null;
  } catch (error) {
    return fail("mcp", "MCP config", `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`, "Fix invalid JSON before running rai install again.");
  }
}

function checkMcpConstruction(projectRoot: string): DoctorCheck {
  try {
    const built = buildMcpServer({ config: resolveConfig({}), rootDir: projectRoot, registryFactory: () => new AnalyzerRegistry() });
    return pass("mcp", "MCP server construction", `MCP server constructs with ${built.toolNames.length} tools.`);
  } catch (error) {
    return fail("mcp", "MCP server construction", error instanceof Error ? error.message : String(error), "Check native dependencies and project path readability.");
  }
}

function checkFilesystemSuitability(context: InstallPlanningContext): DoctorCheck {
  const targets = detectInstallPlatforms(context).map((target) => dirname(target.mcpConfigPath));
  const dirs = targets.length > 0 ? targets : [context.projectRoot];
  try {
    for (const dir of dirs) mkdirSync(dir, { recursive: true });
    return pass("filesystem", "Config write suitability", "Potential config directories are reachable.");
  } catch (error) {
    return fail("filesystem", "Config write suitability", error instanceof Error ? error.message : String(error), "Fix directory permissions or choose a writable project config target.");
  }
}

function defaultNativeProbe(): NativeProbeResult {
  // Existing MCP/session construction opens an in-memory DB, loads better-sqlite3, loads sqlite-vec, and migrates schema.
  buildMcpServer({ config: resolveConfig({}), rootDir: process.cwd(), registryFactory: () => new AnalyzerRegistry() });
  return { sqlite: true, vector: true };
}

function summarize(checks: DoctorCheck[]): DoctorStatus {
  if (checks.some((check) => check.status === "fail" && check.blocking)) return "fail";
  if (checks.some((check) => check.status !== "pass")) return "warn";
  return "pass";
}

function pass(category: DoctorCategory, name: string, message: string): DoctorCheck {
  return { category, name, status: "pass", message, blocking: false };
}

function warn(category: DoctorCategory, name: string, message: string, remediation: string): DoctorCheck {
  return { category, name, status: "warn", message, remediation, blocking: false };
}

function fail(category: DoctorCategory, name: string, message: string, remediation: string): DoctorCheck {
  return { category, name, status: "fail", message, remediation, blocking: true };
}

function defaultCliEntryPath(projectRoot: string): string {
  const projectBuild = join(projectRoot, "packages", "cli", "dist", "index.js");
  if (existsSync(projectBuild)) return projectBuild;
  return join(dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
}
