import { ConfigSchema } from "../config/schema.js";
import type { RaiConfig, RaiConfigInput } from "../config/schema.js";
import type { RuleFeedbackStats } from "../memory/feedback-aggregate.js";

// Named constants for trigger thresholds
export const MIN_EVENTS = 3;
export const MIN_NEGATIVE_RATE = 0.5;

// The 4 calibratable core rules — explicit allowlist (D0: NOT a react/ prefix test).
// Each entry maps to the group/knob to raise and the integer max cap.
export const CALIBRATABLE_RULES: Array<{
  ruleId: string;
  group: keyof RaiConfig;
  knob: string;
  currentValue: (config: RaiConfig) => number;
  maxCap: number;
  buildPatch: (newValue: number) => Partial<RaiConfigInput>;
}> = [
  {
    ruleId: "react/shared-extraction",
    group: "shared",
    knob: "minInstances",
    currentValue: (cfg) => cfg.shared.minInstances,
    maxCap: 50,
    buildPatch: (v) => ({ shared: { minInstances: v } }),
  },
  {
    ruleId: "react/render-coupling",
    group: "renderCoupling",
    knob: "maxFanIn",
    currentValue: (cfg) => cfg.renderCoupling.maxFanIn,
    maxCap: 50,
    buildPatch: (v) => ({ renderCoupling: { maxFanIn: v } }),
  },
  {
    ruleId: "react/over-abstraction",
    group: "overAbstraction",
    knob: "maxProps",
    currentValue: (cfg) => cfg.overAbstraction.maxProps,
    maxCap: 50,
    buildPatch: (v) => ({ overAbstraction: { maxProps: v } }),
  },
  {
    ruleId: "react/hook-topology",
    group: "hookTopology",
    knob: "maxFanIn",
    currentValue: (cfg) => cfg.hookTopology.maxFanIn,
    maxCap: 50,
    buildPatch: (v) => ({ hookTopology: { maxFanIn: v } }),
  },
];

export interface CalibrationSuggestion {
  ruleId: string;
  reason: string;
  patch: Partial<RaiConfigInput>;
}

/** Severity downgrade patch — used for adapter/unknown rules and core-at-cap fallback. */
const SEVERITY_DOWNGRADE_PATCH: Partial<RaiConfigInput> = {
  memory: { severityMap: { error: "warn", warn: "info" } },
};

/**
 * Pure deterministic function: given per-rule aggregated stats and the current resolved config,
 * return a list of CalibrationSuggestion sorted by ruleId (byte order).
 * No IO, no clock, no randomness. PURE.
 */
export function computeSuggestions(
  stats: RuleFeedbackStats[],
  currentConfig: RaiConfig,
): CalibrationSuggestion[] {
  const suggestions: CalibrationSuggestion[] = [];

  for (const stat of stats) {
    // Trigger check (both conditions, both inclusive)
    if (stat.totalEvents < MIN_EVENTS || stat.negativeRate < MIN_NEGATIVE_RATE) continue;

    // Check if this is a calibratable core rule
    const calibratable = CALIBRATABLE_RULES.find((r) => r.ruleId === stat.ruleId);

    if (calibratable) {
      const current = calibratable.currentValue(currentConfig);
      if (current < calibratable.maxCap) {
        // Raise threshold by 1 (least-disruptive)
        const patch = calibratable.buildPatch(current + 1);
        // Validate patch is schema-valid (hard gate)
        const validated = ConfigSchema.partial().safeParse(patch);
        if (validated.success) {
          suggestions.push({
            ruleId: stat.ruleId,
            reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) over ${stat.totalEvents} events — raise threshold to reduce noise`,
            patch,
          });
          continue;
        }
      }
      // At cap or invalid — fall through to severity downgrade
      suggestions.push({
        ruleId: stat.ruleId,
        reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) — threshold is at cap, suggest severity downgrade to reduce noise`,
        patch: SEVERITY_DOWNGRADE_PATCH,
      });
    } else {
      // Adapter or unknown rule — not threshold-calibratable, suggest severity downgrade
      suggestions.push({
        ruleId: stat.ruleId,
        reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) over ${stat.totalEvents} events — suggest severity downgrade (rule is not threshold-calibratable)`,
        patch: SEVERITY_DOWNGRADE_PATCH,
      });
    }
  }

  // Sort by ruleId (byte order)
  return suggestions.sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  );
}
