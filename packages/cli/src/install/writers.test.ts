import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyInstallPlan } from "./writers.js";
import type { InstallPlan } from "./types.js";

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

function plan(input: { projectRoot: string; homeDir: string; configDir: string; path: string; mode?: "merge-json" | "replace-toml-section" | "replace-marker-block"; kind?: "mcp-config" | "instructions"; extraInstructionPath?: string }): InstallPlan {
  const operations: InstallPlan["operations"] = [{
    platform: "opencode",
    kind: input.kind ?? "mcp-config",
    path: input.path,
    mode: input.mode ?? "merge-json",
    dryRun: false,
    description: "Test operation",
    mcpServer: { command: "rai", args: ["mcp", input.projectRoot] },
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
