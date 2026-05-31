import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { formatDoctorReport, runDoctor } from "./doctor.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("doctor reports a healthy temp project with valid native, MCP, and config checks", async () => {
  const fixture = doctorFixture({ mcpConfig: { mcp: { rai: { command: "rai", args: ["mcp", "__ROOT__"] } } } });

  const report = await runDoctor({
    projectRoot: fixture.projectRoot,
    homeDir: fixture.homeDir,
    configDir: fixture.configDir,
    nodeVersion: "22.7.0",
    cliEntryPath: join(fixture.projectRoot, "packages", "cli", "dist", "index.js"),
    nativeProbe: () => ({ sqlite: true, vector: true, version: "0.1.6" }),
  });

  expect(report.status).toBe("pass");
  expect(report.checks.map((check) => [check.category, check.name, check.status])).toEqual(expect.arrayContaining([
    ["runtime", "Node >=22", "pass"],
    ["project", "Project root", "pass"],
    ["runtime", "CLI build", "pass"],
    ["storage", "SQLite/vector native dependencies", "pass"],
    ["mcp", "MCP config", "pass"],
    ["mcp", "MCP server construction", "pass"],
    ["filesystem", "Config write suitability", "pass"],
  ]));
});

test("doctor reports blocking failures with actionable remediation", async () => {
  const fixture = doctorFixture({ mcpConfig: "{ broken" });

  const report = await runDoctor({
    projectRoot: fixture.projectRoot,
    homeDir: fixture.homeDir,
    configDir: fixture.configDir,
    nodeVersion: "20.11.0",
    cliEntryPath: join(fixture.projectRoot, "missing-dist.js"),
    nativeProbe: () => { throw new Error("sqlite-vec failed to load"); },
  });

  expect(report.status).toBe("fail");
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ category: "runtime", name: "Node >=22", status: "fail", remediation: "Install Node.js 22 or newer." }),
    expect.objectContaining({ category: "storage", name: "SQLite/vector native dependencies", status: "fail", remediation: "Reinstall dependencies with pnpm install and verify better-sqlite3 native build output." }),
    expect.objectContaining({ category: "mcp", name: "MCP config", status: "fail", remediation: "Fix invalid JSON before running rai install again." }),
  ]));
});

test("doctor text formatter is human-readable and keeps status lines stable", async () => {
  const fixture = doctorFixture({ mcpConfig: undefined });
  const report = await runDoctor({
    projectRoot: fixture.projectRoot,
    homeDir: fixture.homeDir,
    configDir: fixture.configDir,
    nodeVersion: "22.7.0",
    cliEntryPath: join(fixture.projectRoot, "missing-dist.js"),
    nativeProbe: () => ({ sqlite: true, vector: true, version: "0.1.6" }),
  });

  expect(formatDoctorReport(report)).toContain("RAI doctor: warn");
  expect(formatDoctorReport(report)).toContain("[warn] runtime / CLI build");
  expect(formatDoctorReport(report)).toContain("[warn] mcp / MCP config");
});

function doctorFixture(input: { mcpConfig?: unknown }): { projectRoot: string; homeDir: string; configDir: string } {
  const projectRoot = mkdtempSync(join(tmpdir(), "rai-doctor-project-"));
  const homeDir = mkdtempSync(join(tmpdir(), "rai-doctor-home-"));
  const configDir = join(homeDir, ".config");
  dirs.push(projectRoot, homeDir);
  mkdirSync(join(projectRoot, "packages", "cli", "dist"), { recursive: true });
  writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ name: "fixture" }));
  writeFileSync(join(projectRoot, "packages", "cli", "dist", "index.js"), "#!/usr/bin/env node\n");
  if (input.mcpConfig !== undefined) {
    const content = typeof input.mcpConfig === "string" ? input.mcpConfig : JSON.stringify(replaceRoot(input.mcpConfig, projectRoot));
    writeFileSync(join(projectRoot, "opencode.json"), content);
  }
  return { projectRoot, homeDir, configDir };
}

function replaceRoot(value: unknown, root: string): unknown {
  if (typeof value === "string") return value === "__ROOT__" ? root : value;
  if (Array.isArray(value)) return value.map((entry) => replaceRoot(entry, root));
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceRoot(entry, root)]));
  return value;
}
