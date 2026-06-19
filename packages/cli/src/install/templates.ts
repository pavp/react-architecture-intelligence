import type { InstallPlatformId } from "./types.js";

export const RAI_INSTRUCTIONS_BEGIN = "<!-- RAI:BEGIN -->";
export const RAI_INSTRUCTIONS_END = "<!-- RAI:END -->";

export function instructionMarkerBlock(_platform: InstallPlatformId): string {
  return [
    RAI_INSTRUCTIONS_BEGIN,
    "## React Architecture Intelligence",
    "",
    "Use RAI when investigating React architecture findings, drift, evidence, explanations, or refactor insight for this repo.",
    "Do not use RAI for general file reads, generic dependency graph work, non-React questions, or changes without explicit human direction.",
    "",
    "Workflow: call analyze_repo first to populate the current analysis, then use the other tools against it (get_drift and record_feedback do not need analyze_repo first).",
    "",
    "Tools by purpose:",
    "- Graph queries: query_architecture, get_node, raw_graph_query — answer bounded questions about the latest analyzed graph.",
    "- Finding explanation: explain_finding — return raw evidence plus a bounded deterministic explanation.",
    "- Proposal discovery and refactor: find_proposals, find_shared_opportunities, propose_refactor, apply_refactor — list actionable findings and inspect or apply gated refactor proposals.",
    "- Feedback: record_feedback, close_session — the only memory write paths; record a verdict or close the session with explicit decisions.",
    RAI_INSTRUCTIONS_END,
  ].join("\n");
}
