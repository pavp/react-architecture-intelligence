import { ConfigSchema } from "../config/schema.js";
import type { RaiConfig, RaiConfigInput } from "../config/schema.js";
import type { RuleFeedbackStats } from "../memory/feedback-aggregate.js";

// Floor rule (raise to max+1 so the threshold clears all observed clusters).
// All other calibratable rules are ceiling rules (raise to max of observed breach values).
const FLOOR_RULE_IDS = new Set(["react/shared-extraction"]);

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
  /** Name of the observed breach metric this rule's evidence reports, used in the rationale. */
  metricLabel: string;
}> = [
  {
    ruleId: "react/shared-extraction",
    group: "shared",
    knob: "minInstances",
    currentValue: (cfg) => cfg.shared.minInstances,
    maxCap: 50,
    buildPatch: (v) => ({ shared: { minInstances: v } }),
    metricLabel: "instances",
  },
  {
    ruleId: "react/render-coupling",
    group: "renderCoupling",
    knob: "maxFanIn",
    currentValue: (cfg) => cfg.renderCoupling.maxFanIn,
    maxCap: 50,
    buildPatch: (v) => ({ renderCoupling: { maxFanIn: v } }),
    metricLabel: "fanIn",
  },
  {
    ruleId: "react/over-abstraction",
    group: "overAbstraction",
    knob: "maxProps",
    currentValue: (cfg) => cfg.overAbstraction.maxProps,
    maxCap: 50,
    buildPatch: (v) => ({ overAbstraction: { maxProps: v } }),
    metricLabel: "propCount",
  },
  {
    ruleId: "react/hook-topology",
    group: "hookTopology",
    knob: "maxFanIn",
    currentValue: (cfg) => cfg.hookTopology.maxFanIn,
    maxCap: 50,
    buildPatch: (v) => ({ hookTopology: { maxFanIn: v } }),
    metricLabel: "fanIn",
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
 * Private helper: build the generic (S1) suggestion for a calibratable rule —
 * raises threshold by 1 if below cap, otherwise severity downgrade.
 * Also handles non-calibratable rules (severity downgrade).
 * Extracted to be shared between computeSuggestions (S1) and computeSuggestionsWithEvidence (S2).
 */
function buildGenericSuggestion(
  stat: RuleFeedbackStats,
  currentConfig: RaiConfig,
): CalibrationSuggestion {
  const calibratable = CALIBRATABLE_RULES.find((r) => r.ruleId === stat.ruleId);

  if (calibratable) {
    const current = calibratable.currentValue(currentConfig);
    if (current < calibratable.maxCap) {
      const patch = calibratable.buildPatch(current + 1);
      const validated = ConfigSchema.partial().safeParse(patch);
      if (validated.success) {
        return {
          ruleId: stat.ruleId,
          reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) over ${stat.totalEvents} events — raise threshold to reduce noise`,
          patch,
        };
      }
    }
    // At cap or invalid — severity downgrade
    return {
      ruleId: stat.ruleId,
      reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) — threshold is at cap, suggest severity downgrade to reduce noise`,
      patch: SEVERITY_DOWNGRADE_PATCH,
    };
  }

  // Adapter or unknown rule — not threshold-calibratable
  return {
    ruleId: stat.ruleId,
    reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) over ${stat.totalEvents} events — suggest severity downgrade (rule is not threshold-calibratable)`,
    patch: SEVERITY_DOWNGRADE_PATCH,
  };
}

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
    suggestions.push(buildGenericSuggestion(stat, currentConfig));
  }

  // Sort by ruleId (byte order)
  return suggestions.sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  );
}

/**
 * Shared correlated-evidence computation for a calibratable rule.
 * Returns the correlated CalibrationSuggestion if newValue > current, or null if not.
 * Does NOT fall back to generic: caller decides what to do when null is returned.
 */
function buildCorrelatedSuggestion(
  stat: RuleFeedbackStats,
  calibratable: (typeof CALIBRATABLE_RULES)[number],
  values: number[],
  currentConfig: RaiConfig,
): CalibrationSuggestion | null {
  if (!values || values.length === 0) return null;

  const maxObserved = Math.max(...values);
  const isFloor = FLOOR_RULE_IDS.has(stat.ruleId);
  const newValue = isFloor
    ? Math.min(maxObserved + 1, calibratable.maxCap)
    : Math.min(maxObserved, calibratable.maxCap);

  const current = calibratable.currentValue(currentConfig);
  if (newValue <= current) return null;

  const patch = calibratable.buildPatch(newValue);
  const validated = ConfigSchema.partial().safeParse(patch);
  if (!validated.success) return null;

  return {
    ruleId: stat.ruleId,
    reason: `High negative feedback rate (${(stat.negativeRate * 100).toFixed(0)}%) — observed max ${calibratable.metricLabel}: ${maxObserved} across ${values.length} rejected findings — suggest ${calibratable.knob}: ${newValue} to clear all rejected findings`,
    patch,
  };
}

/**
 * Evidence-correlated calibration suggestions (S2).
 * Pure deterministic function: given aggregated stats, current config, and a pre-fetched
 * map of rejected evidence metrics (from lookupRejectedEvidence), returns calibration
 * suggestions that use observed breach values instead of the blind current+1 formula.
 *
 * For calibratable rules with evidence:
 *   - Ceiling rules (render-coupling, over-abstraction, hook-topology): newValue = min(max(values), 50)
 *   - Floor rule (shared-extraction): newValue = min(max(values)+1, 50)
 *   - If newValue > current → correlated suggestion with rationale citing observed max + count
 *   - Otherwise (newValue <= current, or no/empty evidence) → generic current+1 fallback
 *
 * Non-calibratable (adapter/unknown) rules → severity downgrade (evidence not entered).
 */
export function computeSuggestionsWithEvidence(
  stats: RuleFeedbackStats[],
  currentConfig: RaiConfig,
  evidenceByRule: Map<string, number[]>,
): CalibrationSuggestion[] {
  const suggestions: CalibrationSuggestion[] = [];

  for (const stat of stats) {
    // Trigger check (both conditions, both inclusive)
    if (stat.totalEvents < MIN_EVENTS || stat.negativeRate < MIN_NEGATIVE_RATE) continue;

    const calibratable = CALIBRATABLE_RULES.find((r) => r.ruleId === stat.ruleId);

    if (calibratable) {
      const values = evidenceByRule.get(stat.ruleId);
      const correlated = buildCorrelatedSuggestion(stat, calibratable, values ?? [], currentConfig);
      if (correlated) {
        suggestions.push(correlated);
        continue;
      }
      // Fallback: absent/empty evidence, or newValue <= current → generic current+1
      suggestions.push(buildGenericSuggestion(stat, currentConfig));
    } else {
      // Non-calibratable (adapter/unknown) → severity downgrade; evidence path not entered
      suggestions.push(buildGenericSuggestion(stat, currentConfig));
    }
  }

  // Sort by ruleId (byte order)
  return suggestions.sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  );
}

/**
 * Apply-safe evidence-correlated suggestions (idempotent --apply fix).
 * Pure deterministic function with the same signature as computeSuggestionsWithEvidence.
 *
 * Behavioural difference: for calibratable rules, NEVER falls back to generic current+1.
 * When evidence is absent, empty, or newValue <= current, emits NO suggestion for that rule.
 * This makes --apply --yes idempotent: once the config already covers the evidence,
 * there is nothing genuine to apply and the suggestion is suppressed entirely.
 *
 * Non-calibratable (adapter/unknown) rules → severity downgrade (idempotent: applying
 * the same severityMap patch twice is a byte-level no-op, so these never diverge).
 */
export function computeApplicableSuggestions(
  stats: RuleFeedbackStats[],
  currentConfig: RaiConfig,
  evidenceByRule: Map<string, number[]>,
): CalibrationSuggestion[] {
  const suggestions: CalibrationSuggestion[] = [];

  for (const stat of stats) {
    // Trigger check (both conditions, both inclusive)
    if (stat.totalEvents < MIN_EVENTS || stat.negativeRate < MIN_NEGATIVE_RATE) continue;

    const calibratable = CALIBRATABLE_RULES.find((r) => r.ruleId === stat.ruleId);

    if (calibratable) {
      const values = evidenceByRule.get(stat.ruleId);
      const correlated = buildCorrelatedSuggestion(stat, calibratable, values ?? [], currentConfig);
      if (correlated) {
        suggestions.push(correlated);
      }
      // No fallback: if no genuine headroom, emit nothing for this calibratable rule.
    } else {
      // Non-calibratable (adapter/unknown) → severity downgrade (idempotent)
      suggestions.push(buildGenericSuggestion(stat, currentConfig));
    }
  }

  // Sort by ruleId (byte order)
  return suggestions.sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  );
}
