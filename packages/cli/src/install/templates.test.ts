import { describe, expect, test } from "vitest";
import { instructionMarkerBlock } from "./templates.js";
import type { InstallPlatformId } from "./types.js";

describe("instructionMarkerBlock", () => {
  test.each<InstallPlatformId>(["opencode", "claude-code", "codex", "copilot"])("builds bounded routing guidance for %s", (platform) => {
    const block = instructionMarkerBlock(platform);

    expect(block).toContain("<!-- RAI:BEGIN -->");
    expect(block).toContain("Use RAI when investigating React architecture findings, drift, evidence, explanations, or refactor insight for this repo.");
    expect(block).toContain("Do not use RAI for general file reads, generic dependency graph work, non-React questions, or changes without explicit human direction.");
    expect(block).toContain("call analyze_repo first");
    expect(block).toContain("get_drift and record_feedback do not need analyze_repo first");
    expect(block).toContain("Graph queries: query_architecture, get_node, raw_graph_query");
    expect(block).toContain("find_proposals");
    expect(block).toContain("record_feedback, close_session");
    expect(block).toContain("<!-- RAI:END -->");
  });
});
