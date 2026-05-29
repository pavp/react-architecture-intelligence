import { ConfigSchema, type RaiConfig, type RaiConfigInput } from "./schema.js";

export const DEFAULT_CONFIG: RaiConfig = ConfigSchema.parse({});

export function resolveConfig(input: RaiConfigInput): RaiConfig {
  return ConfigSchema.parse(input);
}

export type { RaiConfig, RaiConfigInput };
