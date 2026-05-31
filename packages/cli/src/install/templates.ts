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
    RAI_INSTRUCTIONS_END,
  ].join("\n");
}
