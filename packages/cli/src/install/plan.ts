import { detectInstallPlatforms, normalizeContext } from "./detect.js";
import { defaultPlatformTarget, isSupportedPlatformId, platformOperationMode, supportedPlatformIds } from "./platforms.js";
import type { BuildInstallPlanInput, InstallOperation, InstallPlan, InstallPlanError, InstallPlanWarning, InstallPlatformId, InstallPlatformTarget, McpServerCommand } from "./types.js";

export function parsePlatformOverrides(values: string[] = []): string[] {
  return values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter((value) => value.length > 0);
}

export function buildInstallPlan(input: BuildInstallPlanInput): InstallPlan {
  const context = normalizeContext(input);
  const dryRun = input.dryRun ?? false;
  const includeInstructions = input.includeInstructions ?? true;
  const supportedPlatforms = supportedPlatformIds();
  const detectedPlatforms = detectInstallPlatforms(context);
  const overrideValues = parsePlatformOverrides(input.platformOverrides);
  const mcpCommand = buildMcpCommand(context.projectRoot);
  const errors = validateOverrides(overrideValues, supportedPlatforms);
  const warnings: InstallPlanWarning[] = [];

  if (errors.length > 0) return emptyPlan({ projectRoot: context.projectRoot, detectedPlatforms, mcpCommand, errors });

  const selectedPlatforms = selectPlatforms(overrideValues, detectedPlatforms);
  if (selectedPlatforms.length === 0) {
    return emptyPlan({
      projectRoot: context.projectRoot,
      detectedPlatforms,
      mcpCommand,
      errors: [{
        code: "NO_SUPPORTED_PLATFORM_SELECTED",
        message: "No supported install platform was detected or selected.",
        supportedPlatforms,
      }],
    });
  }

  if (dryRun) warnings.push({ code: "DRY_RUN_READ_ONLY", message: "Dry run only: no files will be created or changed." });

  const targets = resolveTargets(selectedPlatforms, detectedPlatforms, context);
  const operations = targets.flatMap((target) => buildOperations(target, mcpCommand, dryRun, includeInstructions));

  return {
    status: "ok",
    projectRoot: context.projectRoot,
    detectedPlatforms,
    selectedPlatforms,
    mcpCommand,
    operations,
    warnings,
    errors: [],
  };
}

function validateOverrides(values: string[], supportedPlatforms: InstallPlatformId[]): InstallPlanError[] {
  const unknown = values.filter((value) => !isSupportedPlatformId(value));
  return unknown.map((platform) => ({
    code: "UNKNOWN_PLATFORM",
    message: `Unsupported install platform: ${platform}.`,
    supportedPlatforms,
  }));
}

function selectPlatforms(overrideValues: string[], detectedPlatforms: InstallPlatformTarget[]): InstallPlatformId[] {
  if (overrideValues.length === 0) return detectedPlatforms.map((platform) => platform.id);
  return unique(overrideValues.filter(isSupportedPlatformId));
}

function resolveTargets(selectedPlatforms: InstallPlatformId[], detectedPlatforms: InstallPlatformTarget[], context: BuildInstallPlanInput): InstallPlatformTarget[] {
  return selectedPlatforms.map((id) => detectedPlatforms.find((platform) => platform.id === id) ?? defaultPlatformTarget(id, context));
}

function buildOperations(target: InstallPlatformTarget, mcpCommand: McpServerCommand, dryRun: boolean, includeInstructions: boolean): InstallOperation[] {
  const operations: InstallOperation[] = [
    {
      platform: target.id,
      kind: "mcp-config",
      path: target.mcpConfigPath,
      mode: platformOperationMode(target.id),
      dryRun,
      description: `Install RAI MCP server entry for ${target.id}.`,
      mcpServer: mcpCommand,
    },
  ];

  if (includeInstructions) {
    operations.push({
      platform: target.id,
      kind: "instructions",
      path: target.instructionPath,
      mode: "replace-marker-block",
      dryRun,
      description: `Install bounded RAI routing instructions for ${target.id}.`,
    });
  }

  return operations;
}

function buildMcpCommand(projectRoot: string): McpServerCommand {
  const targetRoot = projectRoot.replace(/\/$/, "");
  return { command: "rai", args: ["mcp", targetRoot] };
}

function emptyPlan(input: { projectRoot: string; detectedPlatforms: InstallPlatformTarget[]; mcpCommand: McpServerCommand; errors: InstallPlanError[] }): InstallPlan {
  return {
    status: "error",
    projectRoot: input.projectRoot,
    detectedPlatforms: input.detectedPlatforms,
    selectedPlatforms: [],
    mcpCommand: input.mcpCommand,
    operations: [],
    warnings: [],
    errors: input.errors,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
