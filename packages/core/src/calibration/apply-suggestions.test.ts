/**
 * Tests for computeApplicableSuggestions — the apply-safe variant of
 * computeSuggestionsWithEvidence that suppresses current+1 fallback for
 * calibratable rules, making --apply --yes idempotent.
 *
 * RED before GREEN (strict TDD). Written before the function exists.
 *
 * Key behavioural difference from computeSuggestionsWithEvidence:
 *   - calibratable rule, newValue > current → emit correlated suggestion (SAME)
 *   - calibratable rule, newValue <= current (incl. exact equality) → emit NOTHING (DIFFERENT from S2)
 *   - calibratable rule, no/empty evidence → emit NOTHING (DIFFERENT from S2)
 *   - non-calibratable (adapter) rule past trigger → still emit severity-downgrade (SAME as S2)
 */
import { expect, test } from "vitest";
import { ConfigSchema } from "../config/schema.js";
import { computeApplicableSuggestions } from "./suggest.js";
import type { RuleFeedbackStats } from "../memory/feedback-aggregate.js";
import type { RaiConfig } from "../config/resolve.js";

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

// ── Genuine headroom: evidence max > current → emit correlated suggestion ──────

test("calibratable: evidence max=12 > current=5 → emits correlated suggestion {maxFanIn:12}", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  // Default renderCoupling.maxFanIn=5; max(evidence)=12 > 5 → genuine headroom
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const suggestions = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].patch.renderCoupling?.maxFanIn).toBe(12);
});

// ── THE KEY CONVERGENCE TEST: evidence max == current → emit NOTHING ──────────

test("calibratable: evidence max=12 == current=12 → emits NOTHING (no current+1 fallback)", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  // config already has maxFanIn=12; evidence max=12 → newValue=12, not > 12 → suppress
  const configWithMax12 = { ...DEFAULT, renderCoupling: { maxFanIn: 12 } } as RaiConfig;
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const suggestions = computeApplicableSuggestions([stat], configWithMax12, evidenceByRule);
  expect(suggestions).toHaveLength(0); // NO current+1 fallback
});

// ── Evidence max < current (already above) → emit NOTHING ────────────────────

test("calibratable: evidence max=12 < current=20 → emits NOTHING", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const configAbove = { ...DEFAULT, renderCoupling: { maxFanIn: 20 } } as RaiConfig;
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const suggestions = computeApplicableSuggestions([stat], configAbove, evidenceByRule);
  expect(suggestions).toHaveLength(0);
});

// ── Floor rule: shared-extraction, evidence max+1 == current → emit NOTHING ──

test("floor: shared-extraction, evidence max=6 → newValue=7 == current=7 → emits NOTHING", () => {
  const stat = makeStat("react/shared-extraction", 5, 1.0);
  // minInstances=7 (max+1=6+1=7 is NOT > 7) → suppress
  const configWithMin7 = { ...DEFAULT, shared: { minInstances: 7 } } as RaiConfig;
  const evidenceByRule = new Map([["react/shared-extraction", [3, 4, 6]]]);
  const suggestions = computeApplicableSuggestions([stat], configWithMin7, evidenceByRule);
  expect(suggestions).toHaveLength(0);
});

// ── No evidence for calibratable rule → emit NOTHING (no fallback) ───────────

test("calibratable: no evidence (key absent) → emits NOTHING", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const evidenceByRule = new Map<string, number[]>(); // no entry for render-coupling
  const suggestions = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);
  expect(suggestions).toHaveLength(0);
});

// ── No evidence: empty array → emit NOTHING ──────────────────────────────────

test("calibratable: empty evidence array → emits NOTHING", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const evidenceByRule = new Map([["react/render-coupling", []]]);
  const suggestions = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);
  expect(suggestions).toHaveLength(0);
});

// ── Non-calibratable (adapter) rule → STILL emits severity-downgrade ─────────

test("non-calibratable adapter rule → still emits severity-downgrade suggestion", () => {
  const stat = makeStat("react/container-presenter-role-drift", 5, 0.8);
  const evidenceByRule = new Map<string, number[]>();
  const suggestions = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].patch.memory?.severityMap).toBeDefined();
});

// ── Determinism: same input → same output ────────────────────────────────────

test("deterministic — same input produces identical output", () => {
  const stats = [makeStat("react/render-coupling", 5, 1.0)];
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const a = computeApplicableSuggestions(stats, DEFAULT, evidenceByRule);
  const b = computeApplicableSuggestions(stats, DEFAULT, evidenceByRule);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

// ── Sorted by ruleId ─────────────────────────────────────────────────────────

test("results sorted by ruleId (byte order)", () => {
  // Only hook-topology and over-abstraction have genuine headroom; render-coupling is at default 5
  const stats = [
    makeStat("react/render-coupling", 5, 1.0),
    makeStat("react/hook-topology", 5, 1.0),
    makeStat("react/over-abstraction", 5, 1.0),
  ];
  const evidenceByRule = new Map([
    ["react/render-coupling", [6, 7, 9, 12]], // max=12 > current=5 → emit
    ["react/hook-topology", [6, 8, 10]], // max=10 > current=5 → emit
    ["react/over-abstraction", [9, 11, 14]], // max=14 > current=10 → emit
  ]);
  const suggestions = computeApplicableSuggestions(stats, DEFAULT, evidenceByRule);
  const ruleIds = suggestions.map((s) => s.ruleId);
  expect(ruleIds).toEqual([...ruleIds].sort());
  expect(suggestions.length).toBeGreaterThan(0);
});

// ── Patch schema-valid ────────────────────────────────────────────────────────

test("correlated patch is ConfigSchema.partial() valid", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const [sug] = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);
  const result = ConfigSchema.partial().safeParse(sug.patch);
  expect(result.success).toBe(true);
});

// ── Trigger check: below threshold → no suggestion ───────────────────────────

test("rule below trigger (totalEvents < MIN_EVENTS) → no suggestion", () => {
  const stat = makeStat("react/render-coupling", 2, 1.0); // totalEvents=2 < MIN_EVENTS=3
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const suggestions = computeApplicableSuggestions([stat], DEFAULT, evidenceByRule);
  expect(suggestions).toHaveLength(0);
});
