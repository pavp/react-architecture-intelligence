import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyInstallPlan } from "./writers.js";
import type { InstallOperation, InstallPlan } from "./types.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("applyInstallPlan", () => {
  test("merges a RAI MCP JSON entry while preserving user config", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, "opencode.json");
    writeFileSync(mcpPath, JSON.stringify({ theme: "dark", mcp: { existing: { command: "keep", args: ["serve"] } } }, null, 2));

    const result = await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: mcpPath }));

    expect(result.status).toBe("ok");
    expect(result.operations).toEqual([expect.objectContaining({ path: mcpPath, action: "updated", status: "ok" })]);
    const written = JSON.parse(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    expect(written).toMatchObject({
      theme: "dark",
      mcp: {
        existing: { command: "keep", args: ["serve"] },
        rai: { command: "rai", args: ["mcp", projectRoot] },
      },
    });
  });

  test("replaces only the RAI marker-owned instruction block", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const instructionPath = join(projectRoot, "AGENTS.md");
    writeFileSync(instructionPath, "# Team Notes\n\nKeep this.\n\n<!-- RAI:BEGIN -->\nold rai block\n<!-- RAI:END -->\n\nUser tail.\n");

    await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: instructionPath, mode: "replace-marker-block", kind: "instructions" }));

    expect(readFileSync(instructionPath, "utf8")).toBe("# Team Notes\n\nKeep this.\n\n<!-- RAI:BEGIN -->\n## React Architecture Intelligence\n\nUse RAI when investigating React architecture findings, drift, evidence, explanations, or refactor insight for this repo.\nDo not use RAI for general file reads, generic dependency graph work, non-React questions, or changes without explicit human direction.\n<!-- RAI:END -->\n\nUser tail.\n");
  });

  test("replaces only the Codex RAI TOML section while preserving user settings", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const tomlPath = join(homeDir, ".codex", "config.toml");
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    writeFileSync(tomlPath, "model = \"gpt-5\"\n\n[mcp_servers.old]\ncommand = \"keep\"\n\n[mcp_servers.rai]\ncommand = \"old\"\nargs = [\"old\"]\n\n[profiles.dev]\nfast = true\n");

    await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: tomlPath, mode: "replace-toml-section" }));

    expect(readFileSync(tomlPath, "utf8")).toBe("model = \"gpt-5\"\n\n[mcp_servers.old]\ncommand = \"keep\"\n\n[profiles.dev]\nfast = true\n\n[mcp_servers.rai]\ncommand = \"rai\"\nargs = [\"mcp\", \"" + projectRoot.replaceAll("\\", "\\\\") + "\"]\n");
  });

  test("fails on broken JSON before applying later operations", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, "opencode.json");
    const instructionPath = join(projectRoot, "AGENTS.md");
    writeFileSync(mcpPath, "{ broken json");
    writeFileSync(instructionPath, "User content.\n");

    const result = await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: mcpPath, extraInstructionPath: instructionPath }));

    expect(result.status).toBe("error");
    expect(result.operations).toEqual([expect.objectContaining({ path: mcpPath, status: "error", error: expect.stringContaining("Invalid JSON") })]);
    expect(readFileSync(mcpPath, "utf8")).toBe("{ broken json");
    expect(readFileSync(instructionPath, "utf8")).toBe("User content.\n");
  });
});

// Task 1.1 RED: claude-code project-level write uses mcpServers.rai, not mcp.rai
describe("mergeJsonMcpConfig — claude-code project-level", () => {
  test("writes entry at mcpServers.rai, not mcp.rai, preserving pre-existing keys", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, ".mcp.json");
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { existing: { command: "keep", args: [] } } }, null, 2));

    const result = await applyInstallPlan(plan({
      projectRoot, homeDir, configDir, path: mcpPath,
      platform: "claude-code",
      mcpConfigShape: { kind: "claude-project" },
    }));

    expect(result.status).toBe("ok");
    const written = JSON.parse(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    expect(written).toMatchObject({
      mcpServers: {
        existing: { command: "keep", args: [] },
        rai: { command: "rai", args: ["mcp", projectRoot] },
      },
    });
    expect((written as Record<string, unknown>).mcp).toBeUndefined();
  });
});

// Task 1.2 RED: claude-code home-level write uses projects[absRoot].mcpServers.rai
describe("mergeJsonMcpConfig — claude-code home-level", () => {
  test("writes entry at projects[absRoot].mcpServers.rai, preserving other projects and top-level keys", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const claudeJsonPath = join(homeDir, ".claude.json");
    const otherRoot = "/other/project";
    writeFileSync(claudeJsonPath, JSON.stringify({
      autoUpdaterStatus: "enabled",
      projects: {
        [otherRoot]: { mcpServers: { other: { command: "other", args: [] } } },
      },
    }, null, 2));

    const result = await applyInstallPlan(plan({
      projectRoot, homeDir, configDir, path: claudeJsonPath,
      platform: "claude-code",
      mcpConfigShape: { kind: "claude-home", projectRoot },
    }));

    expect(result.status).toBe("ok");
    const written = JSON.parse(readFileSync(claudeJsonPath, "utf8")) as Record<string, unknown>;
    expect(written).toMatchObject({
      autoUpdaterStatus: "enabled",
      projects: {
        [otherRoot]: { mcpServers: { other: { command: "other", args: [] } } },
        [projectRoot]: { mcpServers: { rai: { command: "rai", args: ["mcp", projectRoot] } } },
      },
    });
    expect((written as Record<string, unknown>).mcp).toBeUndefined();
  });
});

// Task 1.3 RED: idempotent re-run produces no duplicates
describe("mergeJsonMcpConfig — idempotent", () => {
  test("second run does not duplicate or corrupt the entry", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, ".mcp.json");

    const planInput = { projectRoot, homeDir, configDir, path: mcpPath, platform: "claude-code" as const, mcpConfigShape: { kind: "claude-project" as const } };
    await applyInstallPlan(plan(planInput));
    await applyInstallPlan(plan(planInput));

    const written = JSON.parse(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    const mcpServers = (written as { mcpServers: Record<string, unknown> }).mcpServers;
    expect(Object.keys(mcpServers)).toEqual(["rai"]);
    expect(mcpServers["rai"]).toEqual({ command: "rai", args: ["mcp", projectRoot] });
  });
});

// Task 1.4 RED: platform dispatch is exhaustive — all platforms reach correct key path
describe("mergeJsonMcpConfig — platform dispatch exhaustive", () => {
  test("opencode writes to mcp.rai", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, "opencode.json");

    await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: mcpPath, platform: "opencode", mcpConfigShape: { kind: "flat-mcp" } }));

    const written = JSON.parse(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    expect((written as Record<string, unknown>).mcp).toBeDefined();
    expect((written as { mcp: Record<string, unknown> }).mcp["rai"]).toBeDefined();
    expect((written as Record<string, unknown>).mcpServers).toBeUndefined();
  });

  test("copilot writes to mcp.rai", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, ".vscode", "mcp.json");
    mkdirSync(join(projectRoot, ".vscode"), { recursive: true });

    await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: mcpPath, platform: "copilot", mcpConfigShape: { kind: "flat-mcp" } }));

    const written = JSON.parse(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    expect((written as Record<string, unknown>).mcp).toBeDefined();
    expect((written as { mcp: Record<string, unknown> }).mcp["rai"]).toBeDefined();
    expect((written as Record<string, unknown>).mcpServers).toBeUndefined();
  });

  test("claude-code project writes to mcpServers.rai", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const mcpPath = join(projectRoot, ".mcp.json");

    await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: mcpPath, platform: "claude-code", mcpConfigShape: { kind: "claude-project" } }));

    const written = JSON.parse(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    expect((written as Record<string, unknown>).mcpServers).toBeDefined();
    expect((written as { mcpServers: Record<string, unknown> }).mcpServers["rai"]).toBeDefined();
    expect((written as Record<string, unknown>).mcp).toBeUndefined();
  });

  test("claude-code home writes to projects[root].mcpServers.rai", async () => {
    const { projectRoot, homeDir, configDir } = fixture();
    const claudeJsonPath = join(homeDir, ".claude.json");

    await applyInstallPlan(plan({ projectRoot, homeDir, configDir, path: claudeJsonPath, platform: "claude-code", mcpConfigShape: { kind: "claude-home", projectRoot } }));

    const written = JSON.parse(readFileSync(claudeJsonPath, "utf8")) as Record<string, unknown>;
    const projects = (written as { projects: Record<string, unknown> }).projects;
    expect(projects).toBeDefined();
    expect(projects[projectRoot]).toBeDefined();
    const projectEntry = projects[projectRoot] as { mcpServers: Record<string, unknown> };
    expect(projectEntry.mcpServers["rai"]).toBeDefined();
    expect((written as Record<string, unknown>).mcp).toBeUndefined();
  });
});

function fixture(): { projectRoot: string; homeDir: string; configDir: string } {
  const root = mkdtempSync(join(tmpdir(), "rai-install-writers-"));
  dirs.push(root);
  const projectRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const configDir = join(root, "config");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  return { projectRoot, homeDir, configDir };
}

function plan(input: { projectRoot: string; homeDir: string; configDir: string; path: string; mode?: "merge-json" | "replace-toml-section" | "replace-marker-block"; kind?: "mcp-config" | "instructions"; extraInstructionPath?: string; platform?: InstallOperation["platform"]; mcpConfigShape?: InstallOperation["mcpConfigShape"] }): InstallPlan {
  const operations: InstallPlan["operations"] = [{
    platform: input.platform ?? "opencode",
    kind: input.kind ?? "mcp-config",
    path: input.path,
    mode: input.mode ?? "merge-json",
    dryRun: false,
    description: "Test operation",
    mcpServer: { command: "rai", args: ["mcp", input.projectRoot] },
    ...(input.mcpConfigShape !== undefined ? { mcpConfigShape: input.mcpConfigShape } : {}),
  }];
  if (input.extraInstructionPath) {
    operations.push({
      platform: "opencode",
      kind: "instructions",
      path: input.extraInstructionPath,
      mode: "replace-marker-block",
      dryRun: false,
      description: "Test instruction operation",
    });
  }
  return {
    status: "ok",
    projectRoot: input.projectRoot,
    detectedPlatforms: [],
    selectedPlatforms: ["opencode"],
    mcpCommand: { command: "rai", args: ["mcp", input.projectRoot] },
    operations,
    warnings: [],
    errors: [],
  };
}
