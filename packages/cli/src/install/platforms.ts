import { join } from "node:path";
import { SUPPORTED_PLATFORM_IDS, type InstallOperationMode, type InstallPlatformId, type InstallPlatformTarget, type InstallPlanningContext, type SchemaConfidence } from "./types.js";

interface PlatformDefinition {
  id: InstallPlatformId;
  schemaConfidence: SchemaConfidence;
  mcpOperationMode: InstallOperationMode;
  projectMcpCandidates(context: InstallPlanningContext): string[];
  homeMcpCandidates(context: InstallPlanningContext): string[];
  defaultMcpPath(context: InstallPlanningContext): string;
  defaultInstructionPath(context: InstallPlanningContext): string;
}

export const PLATFORM_DEFINITIONS: readonly PlatformDefinition[] = [
  {
    id: "opencode",
    schemaConfidence: "medium",
    mcpOperationMode: "merge-json",
    projectMcpCandidates: ({ projectRoot }) => [join(projectRoot, "opencode.json"), join(projectRoot, "opencode.jsonc")],
    homeMcpCandidates: ({ configDir }) => [join(configDir, "opencode", "opencode.json"), join(configDir, "opencode", "opencode.jsonc")],
    defaultMcpPath: ({ projectRoot }) => join(projectRoot, "opencode.json"),
    defaultInstructionPath: ({ projectRoot }) => join(projectRoot, "AGENTS.md"),
  },
  {
    id: "claude-code",
    schemaConfidence: "medium",
    mcpOperationMode: "merge-json",
    projectMcpCandidates: ({ projectRoot }) => [join(projectRoot, ".mcp.json")],
    homeMcpCandidates: ({ homeDir }) => [join(homeDir, ".claude.json")],
    defaultMcpPath: ({ projectRoot }) => join(projectRoot, ".mcp.json"),
    defaultInstructionPath: ({ projectRoot }) => join(projectRoot, "CLAUDE.md"),
  },
  {
    id: "codex",
    schemaConfidence: "medium",
    mcpOperationMode: "replace-toml-section",
    projectMcpCandidates: () => [],
    homeMcpCandidates: ({ homeDir }) => [join(homeDir, ".codex", "config.toml")],
    defaultMcpPath: ({ homeDir }) => join(homeDir, ".codex", "config.toml"),
    defaultInstructionPath: ({ projectRoot }) => join(projectRoot, "AGENTS.md"),
  },
  {
    id: "copilot",
    schemaConfidence: "medium",
    mcpOperationMode: "merge-json",
    projectMcpCandidates: ({ projectRoot }) => [join(projectRoot, ".vscode", "mcp.json")],
    homeMcpCandidates: () => [],
    defaultMcpPath: ({ projectRoot }) => join(projectRoot, ".vscode", "mcp.json"),
    defaultInstructionPath: ({ projectRoot }) => join(projectRoot, ".github", "copilot-instructions.md"),
  },
] as const;

export function supportedPlatformIds(): InstallPlatformId[] {
  return [...SUPPORTED_PLATFORM_IDS];
}

export function isSupportedPlatformId(value: string): value is InstallPlatformId {
  return (SUPPORTED_PLATFORM_IDS as readonly string[]).includes(value);
}

export function platformDefinition(id: InstallPlatformId): PlatformDefinition {
  const definition = PLATFORM_DEFINITIONS.find((platform) => platform.id === id);
  if (!definition) throw new Error(`Unsupported install platform: ${id}`);
  return definition;
}

export function defaultPlatformTarget(id: InstallPlatformId, context: InstallPlanningContext): InstallPlatformTarget {
  const definition = platformDefinition(id);
  return {
    id,
    mcpConfigPath: definition.defaultMcpPath(context),
    instructionPath: definition.defaultInstructionPath(context),
    schemaConfidence: definition.schemaConfidence,
    detected: false,
  };
}

export function platformOperationMode(id: InstallPlatformId): InstallOperationMode {
  return platformDefinition(id).mcpOperationMode;
}
