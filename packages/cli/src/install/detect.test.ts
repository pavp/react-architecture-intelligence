import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { detectInstallPlatforms } from "./detect.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("detectInstallPlatforms", () => {
  test("detects supported platform config targets from injected fixture directories", () => {
    const { projectRoot, homeDir, configDir } = fixture();
    file(projectRoot, "opencode.json", "{}\n");
    file(projectRoot, ".mcp.json", "{}\n");
    file(homeDir, ".codex/config.toml", "\n");
    file(projectRoot, ".vscode/mcp.json", "{}\n");
    file(projectRoot, "unsupported-agent.json", "{}\n");

    const detected = detectInstallPlatforms({ projectRoot, homeDir, configDir });

    expect(detected.map((platform) => platform.id)).toEqual(["opencode", "claude-code", "codex", "copilot"]);
    expect(detected.map((platform) => platform.id)).not.toContain("unsupported-agent");
  });

  test("uses injected config directory for OpenCode without reading the real home", () => {
    const { projectRoot, homeDir, configDir } = fixture();
    file(configDir, "opencode/opencode.json", "{}\n");

    const detected = detectInstallPlatforms({ projectRoot, homeDir, configDir });

    expect(detected).toEqual([
      expect.objectContaining({
        id: "opencode",
        mcpConfigPath: join(configDir, "opencode", "opencode.json"),
      }),
    ]);
  });

  test("returns no platforms when fixture directories contain no supported targets", () => {
    const { projectRoot, homeDir, configDir } = fixture();
    file(projectRoot, "package.json", "{}\n");

    expect(detectInstallPlatforms({ projectRoot, homeDir, configDir })).toEqual([]);
  });
});

function fixture(): { projectRoot: string; homeDir: string; configDir: string } {
  const root = mkdtempSync(join(tmpdir(), "rai-install-detect-"));
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
