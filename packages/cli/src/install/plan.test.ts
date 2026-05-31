import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildInstallPlan, parsePlatformOverrides } from "./plan.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parsePlatformOverrides", () => {
  test("normalizes repeated and comma-separated platform override values", () => {
    expect(parsePlatformOverrides(["opencode,codex", "copilot"])).toEqual(["opencode", "codex", "copilot"]);
  });

  test("drops empty platform override entries", () => {
    expect(parsePlatformOverrides(["opencode,", "", " codex "])).toEqual(["opencode", "codex"]);
  });
});

describe("buildInstallPlan", () => {
  test("selects every detected supported platform when no override is provided", () => {
    const { projectRoot, homeDir, configDir } = fixture();
    file(projectRoot, "opencode.json", "{}\n");
    file(projectRoot, ".mcp.json", "{}\n");

    const plan = buildInstallPlan({ projectRoot, homeDir, configDir, dryRun: true });

    expect(plan.status).toBe("ok");
    expect(plan.detectedPlatforms.map((platform) => platform.id)).toEqual(["opencode", "claude-code"]);
    expect(plan.selectedPlatforms).toEqual(["opencode", "claude-code"]);
    expect(plan.errors).toEqual([]);
  });

  test("targets explicit platforms even when no platform is auto-detected", () => {
    const { projectRoot, homeDir, configDir } = fixture();

    const plan = buildInstallPlan({
      projectRoot,
      homeDir,
      configDir,
      dryRun: true,
      platformOverrides: ["opencode,codex", "copilot"],
    });

    expect(plan.status).toBe("ok");
    expect(plan.detectedPlatforms).toEqual([]);
    expect(plan.selectedPlatforms).toEqual(["opencode", "codex", "copilot"]);
    expect(plan.operations.map((operation) => operation.platform)).toEqual(["opencode", "opencode", "codex", "codex", "copilot", "copilot"]);
  });

  test("fails with supported ids when nothing is detected or selected", () => {
    const { projectRoot, homeDir, configDir } = fixture();

    const plan = buildInstallPlan({ projectRoot, homeDir, configDir, dryRun: true });

    expect(plan.status).toBe("error");
    expect(plan.selectedPlatforms).toEqual([]);
    expect(plan.operations).toEqual([]);
    expect(plan.errors).toEqual([
      {
        code: "NO_SUPPORTED_PLATFORM_SELECTED",
        message: "No supported install platform was detected or selected.",
        supportedPlatforms: ["opencode", "claude-code", "codex", "copilot"],
      },
    ]);
  });

  test("fails before operations when an unknown platform is requested", () => {
    const { projectRoot, homeDir, configDir } = fixture();

    const plan = buildInstallPlan({ projectRoot, homeDir, configDir, dryRun: true, platformOverrides: ["opencode,unknown"] });

    expect(plan.status).toBe("error");
    expect(plan.operations).toEqual([]);
    expect(plan.errors).toEqual([
      {
        code: "UNKNOWN_PLATFORM",
        message: "Unsupported install platform: unknown.",
        supportedPlatforms: ["opencode", "claude-code", "codex", "copilot"],
      },
    ]);
  });

  test("models dry-run MCP config and instruction operations without writing files", () => {
    const { projectRoot, homeDir, configDir } = fixture();
    file(projectRoot, "opencode.json", "{}\n");

    const plan = buildInstallPlan({ projectRoot, homeDir, configDir, dryRun: true });

    expect(plan.status).toBe("ok");
    expect(plan.operations).toEqual([
      expect.objectContaining({ platform: "opencode", kind: "mcp-config", mode: "merge-json", dryRun: true }),
      expect.objectContaining({ platform: "opencode", kind: "instructions", mode: "replace-marker-block", dryRun: true }),
    ]);
    expect(plan.operations.map((operation) => operation.path)).toEqual([join(projectRoot, "opencode.json"), join(projectRoot, "AGENTS.md")]);
    expect(plan.operations[0]).toMatchObject({ mcpServer: { command: "rai", args: ["mcp", projectRoot] } });
    expect(plan.operations[0]?.mcpServer?.args.at(-1)).not.toMatch(/\/src$/);
    expect(plan.warnings).toEqual([
      expect.objectContaining({ code: "DRY_RUN_READ_ONLY", message: "Dry run only: no files will be created or changed." }),
    ]);
  });
});

function fixture(): { projectRoot: string; homeDir: string; configDir: string } {
  const root = mkdtempSync(join(tmpdir(), "rai-install-plan-"));
  dirs.push(root);
  const projectRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const configDir = join(root, "config");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  return { projectRoot, homeDir, configDir };
}

function file(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content);
}
