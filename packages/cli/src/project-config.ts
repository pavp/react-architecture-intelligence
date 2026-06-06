import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigSchema } from "@rai/core";
import type { RaiConfigInput } from "@rai/core";

export const PROJECT_CONFIG_FILENAME = "rai.config.json";

export class ProjectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectConfigError";
  }
}

/**
 * Load the project-level rai.config.json from `dir`.
 * - Absent file → return {} (silent, backward-compatible).
 * - Present file → parse JSON, validate shape via ConfigSchema.partial(), return raw input.
 * - Malformed JSON or invalid shape → throw ProjectConfigError with actionable message.
 *
 * READ-ONLY: uses existsSync + readFileSync only. Never writes.
 */
export function loadProjectConfig(dir: string): RaiConfigInput {
  const configPath = join(dir, PROJECT_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return {};
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (err) {
    throw new ProjectConfigError(
      `Failed to read ${PROJECT_CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ProjectConfigError(
      `${PROJECT_CONFIG_FILENAME} contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Validate shape via ConfigSchema.partial() for a clear error message
  const result = ConfigSchema.partial().safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ProjectConfigError(
      `${PROJECT_CONFIG_FILENAME} has invalid configuration: ${issues}`,
    );
  }

  // Return raw parsed object (not result.data) so resolveConfig fills nested .default({})
  return parsed as RaiConfigInput;
}
