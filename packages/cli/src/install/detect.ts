import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PLATFORM_DEFINITIONS } from "./platforms.js";
import type { InstallPlatformTarget, InstallPlanningContext } from "./types.js";

export function detectInstallPlatforms(input: InstallPlanningContext): InstallPlatformTarget[] {
  const context = normalizeContext(input);
  const detected: InstallPlatformTarget[] = [];

  for (const platform of PLATFORM_DEFINITIONS) {
    const mcpConfigPath = [...platform.projectMcpCandidates(context), ...platform.homeMcpCandidates(context)].find((candidate) => existsSync(candidate));
    if (!mcpConfigPath) continue;

    detected.push({
      id: platform.id,
      mcpConfigPath,
      instructionPath: platform.defaultInstructionPath(context),
      schemaConfidence: platform.schemaConfidence,
      detected: true,
    });
  }

  return detected;
}

export function normalizeContext(input: InstallPlanningContext): InstallPlanningContext {
  return {
    projectRoot: resolve(input.projectRoot),
    homeDir: resolve(input.homeDir),
    configDir: resolve(input.configDir),
  };
}
