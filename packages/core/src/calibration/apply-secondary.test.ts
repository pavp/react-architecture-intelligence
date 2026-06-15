/**
 * Tests for computeApplicableSecondarySuggestions — the apply-safe secondary pass.
 * T4.1 RED: written before implementation exists.
 * Structurally identical to computeSecondarySuggestions but named for the apply path.
 * No fallback: when newValue ≤ current or no rows, emits nothing.
 */
import { expect, test } from "vitest";
import { ConfigSchema } from "../config/schema.js";
import { computeApplicableSecondarySuggestions, computeApplicableSuggestions } from "./suggest.js";
import type { RuleFeedbackStats } from "../memory/feedback-aggregate.js";
import type { RaiConfig } from "../config/resolve.js";
import type { RejectedMetricRow } from "./evidence-lookup.js";

const DEFAULT = ConfigSchema.parse({}) as RaiConfig;

function makeStat(
  ruleId: string,
  totalEvents: number,
  negativeRate: number,
): RuleFeedbackStats {
  const negCount = Math.round(totalEvents * negativeRate);
  const posCount = totalEvents - negCount;
  return {
    ruleId,
    totalEvents,
    distinctFingerprints: totalEvents,
    byVerdict: {
      reject: negCount,
      wontfix: 0,
      dismiss: 0,
      accept: posCount,
      confirm: 0,
    },
    negativeRate,
  };
}

// ── Genuine headroom: fanOut dominant, newValue > current → emit suggestion ───

test("fanOut dominant, newValue > current → suggestion emitted (same as suggest path)", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  // DEFAULT.renderCoupling.maxFanOut = 7
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 8 },   // fanOut breaches (8>7)
    { fanIn: 3, fanOut: 10 },  // fanOut breaches
    { fanIn: 3, fanOut: 12 },  // fanOut breaches
    { fanIn: 6, fanOut: 4 },   // fanIn breaches
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeApplicableSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].ruleId).toBe("react/render-coupling");
  expect(suggestions[0].patch.renderCoupling?.maxFanOut).toBe(12);
});

// ── No fallback: newValue ≤ current → NO suggestion ──────────────────────────

test("fanOut dominant, newValue ≤ current (config at cap, capped = current) → NO suggestion", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const configFanOut50: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 50 },
  };
  // max(dominant) = 63 → capped to 50 = current(50) → no emission
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 63 },
    { fanIn: 3, fanOut: 55 },
    { fanIn: 3, fanOut: 52 },
    { fanIn: 6, fanOut: 4 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeApplicableSecondarySuggestions([stat], configFanOut50, rowsByRule);
  // NO fallback to defaultValue+1 — secondary apply path is strict loosen-only
  expect(suggestions).toHaveLength(0);
});

// ── No rows → NO suggestion (no fallback) ────────────────────────────────────

test("no rows → NO suggestion", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rowsByRule = new Map<string, RejectedMetricRow[]>();
  const suggestions = computeApplicableSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

// ── Tie → NO suggestion ───────────────────────────────────────────────────────

test("tie (fanOut count = fanIn count) → NO suggestion", () => {
  const stat = makeStat("react/hook-topology", 4, 1.0);
  // DEFAULT: hookTopology.maxFanIn=5, maxFanOut=5
  const rows: RejectedMetricRow[] = [
    { fanIn: 6, fanOut: 3 },  // fanIn breaches
    { fanIn: 6, fanOut: 3 },  // fanIn breaches
    { fanIn: 3, fanOut: 7 },  // fanOut breaches
    { fanIn: 3, fanOut: 7 },  // fanOut breaches
  ];
  const rowsByRule = new Map([["react/hook-topology", rows]]);
  const suggestions = computeApplicableSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

// ── Dual suggestions: primary (maxFanIn) + secondary (maxFanOut) are independent ──

test("both primary (maxFanIn via computeApplicableSuggestions) and secondary (maxFanOut) can coexist", () => {
  // This test verifies the TWO objects are distinct when both conditions met.
  // We call both computeApplicableSuggestions and computeApplicableSecondarySuggestions
  // and confirm both produce suggestions for the same ruleId.
  const stat = makeStat("react/render-coupling", 5, 1.0);
  // Primary: fanIn evidence with max > current maxFanIn (default=5)
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const primarySuggestions = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);

  // Secondary: fanOut dominant with max > current maxFanOut (default=7)
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 8 },
    { fanIn: 3, fanOut: 10 },
    { fanIn: 3, fanOut: 12 },
    { fanIn: 6, fanOut: 4 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const secondarySuggestions = computeApplicableSecondarySuggestions([stat], DEFAULT, rowsByRule);

  expect(primarySuggestions).toHaveLength(1);
  expect(secondarySuggestions).toHaveLength(1);

  // They are distinct objects
  const primary = primarySuggestions[0];
  const secondary = secondarySuggestions[0];
  expect(primary.ruleId).toBe("react/render-coupling");
  expect(secondary.ruleId).toBe("react/render-coupling");
  expect(primary.patch.renderCoupling?.maxFanIn).toBeDefined();
  expect(secondary.patch.renderCoupling?.maxFanOut).toBeDefined();
  // They patch different knobs
  expect(primary.patch).not.toEqual(secondary.patch);
});
