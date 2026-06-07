/**
 * Pure merge helper for P13-S3: folds CalibrationSuggestion patches onto a raw RaiConfigInput.
 *
 * Rules (ADR D1/D2):
 * - Spread existing keys first (preserves unrelated user config).
 * - Apply each suggestion's group patch via shallow group-spread.
 * - Calibratable groups appear in CALIBRATABLE_RULES order in the result.
 * - Non-calibratable group patches (e.g. memory/severity-downgrade) follow existing key order.
 * - Pure: no fs, no validation, no defaults. The CLI caller owns schema validation and writes.
 */
import type { RaiConfigInput } from "../config/schema.js";
import type { CalibrationSuggestion } from "./suggest.js";
import { CALIBRATABLE_RULES } from "./suggest.js";

/**
 * Merge calibration suggestions onto the raw on-disk config input.
 *
 * @param existing - The raw `RaiConfigInput` as returned by `loadProjectConfig` (may be `{}`).
 * @param suggestions - Array of calibration suggestions; each carries a single-group patch.
 * @returns A new `RaiConfigInput` with existing keys preserved and suggestion patches applied.
 *          Key order: existing keys first (insertion order), then new calibratable group
 *          keys in CALIBRATABLE_RULES order, then other new patch groups.
 */
export function mergeSuggestionsIntoConfig(
  existing: RaiConfigInput,
  suggestions: CalibrationSuggestion[],
): RaiConfigInput {
  if (suggestions.length === 0) {
    return { ...existing };
  }

  // Collect all group patches from suggestions.
  // Multiple suggestions for the same group are merged together (shallow spread).
  const patchByGroup = new Map<string, Record<string, unknown>>();
  for (const suggestion of suggestions) {
    const patch = suggestion.patch as Record<string, unknown>;
    for (const [group, groupPatch] of Object.entries(patch)) {
      const existing_group = patchByGroup.get(group) ?? {};
      patchByGroup.set(group, { ...existing_group, ...(groupPatch as Record<string, unknown>) });
    }
  }

  // Start with a shallow copy of existing (preserves all user keys, insertion order).
  const result: RaiConfigInput = { ...existing };

  // Apply calibratable groups first in CALIBRATABLE_RULES order (deterministic ordering).
  for (const rule of CALIBRATABLE_RULES) {
    const groupPatch = patchByGroup.get(rule.group);
    if (groupPatch === undefined) continue;
    patchByGroup.delete(rule.group); // mark handled

    const existingGroup = (existing as Record<string, unknown>)[rule.group] as Record<string, unknown> | undefined;
    (result as Record<string, unknown>)[rule.group] = existingGroup
      ? { ...existingGroup, ...groupPatch }
      : groupPatch;
  }

  // Apply any remaining (non-calibratable) group patches (e.g. memory from severity downgrade).
  for (const [group, groupPatch] of patchByGroup) {
    const existingGroup = (existing as Record<string, unknown>)[group] as Record<string, unknown> | undefined;
    (result as Record<string, unknown>)[group] = existingGroup
      ? { ...existingGroup, ...groupPatch }
      : groupPatch;
  }

  return result;
}
