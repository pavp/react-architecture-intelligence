import { describe, expect, test } from "vitest";
import { instructionMarkerBlock } from "./templates.js";
import type { InstallPlatformId } from "./types.js";

describe("instructionMarkerBlock", () => {
  test.each<InstallPlatformId>(["opencode", "claude-code", "codex", "copilot"])("builds bounded routing guidance for %s", (platform) => {
    const block = instructionMarkerBlock(platform);

    expect(block).toContain("<!-- RAI:BEGIN -->");
    expect(block).toContain("Use RAI when investigating React architecture findings, drift, evidence, explanations, or refactor insight for this repo.");
    expect(block).toContain("Do not use RAI for general file reads, generic dependency graph work, non-React questions, or changes without explicit human direction.");
    expect(block).toContain("<!-- RAI:END -->");
  });
});
