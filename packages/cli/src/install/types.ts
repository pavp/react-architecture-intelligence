export const SUPPORTED_PLATFORM_IDS = ["opencode", "claude-code", "codex", "copilot"] as const;

export type McpConfigShape =
  | { kind: "flat-mcp" }
  | { kind: "claude-project" }
  | { kind: "claude-home"; projectRoot: string };

export type InstallPlatformId = typeof SUPPORTED_PLATFORM_IDS[number];
export type SchemaConfidence = "low" | "medium" | "high";
export type InstallPlanStatus = "ok" | "error";
export type InstallOperationKind = "mcp-config" | "instructions";
export type InstallOperationMode = "merge-json" | "replace-toml-section" | "replace-marker-block";

export interface InstallPlatformTarget {
  id: InstallPlatformId;
  mcpConfigPath: string;
  instructionPath: string;
  schemaConfidence: SchemaConfidence;
  detected: boolean;
}

export interface McpServerCommand {
  command: string;
  args: string[];
}

export interface InstallOperation {
  platform: InstallPlatformId;
  kind: InstallOperationKind;
  path: string;
  mode: InstallOperationMode;
  dryRun: boolean;
  description: string;
  mcpServer?: McpServerCommand;
  mcpConfigShape?: McpConfigShape;
}

export interface InstallPlanWarning {
  code: string;
  message: string;
  platform?: InstallPlatformId;
}

export interface InstallPlanError {
  code: string;
  message: string;
  supportedPlatforms: InstallPlatformId[];
}

export interface InstallPlan {
  status: InstallPlanStatus;
  projectRoot: string;
  detectedPlatforms: InstallPlatformTarget[];
  selectedPlatforms: InstallPlatformId[];
  mcpCommand: McpServerCommand;
  operations: InstallOperation[];
  warnings: InstallPlanWarning[];
  errors: InstallPlanError[];
}

export interface InstallPlanningContext {
  projectRoot: string;
  homeDir: string;
  configDir: string;
}

export interface BuildInstallPlanInput extends InstallPlanningContext {
  platformOverrides?: string[];
  dryRun?: boolean;
  includeInstructions?: boolean;
}
