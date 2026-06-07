/**
 * Tests for computeSuggestionsWithEvidence (S2 evidence-correlated suggestions).
 * B1 RED: written before implementation exists.
 * S1 computeSuggestions tests remain in suggest.test.ts (unmodified).
 */
import { expect, test } from "vitest";
import { ConfigSchema } from "../config/schema.js";
import { computeSuggestionsWithEvidence } from "./suggest.js";
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

// ── B1a: render-coupling ceiling — max(fanIn) over rejected = 12 ──────────────

test("render-coupling: uses max(fanIn)=12, not current+1", () => {
  const stat = makeStat("react/render-coupling", 4, 1.0);
  // Default renderCoupling.maxFanIn = 5; max(6,7,9,12)=12 > 5 → correlated
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.ruleId).toBe("react/render-coupling");
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(12);
});

// ── B1b: over-abstraction ceiling — max(propCount) over rejected = 14 ─────────

test("over-abstraction: uses max(propCount)=14", () => {
  const stat = makeStat("react/over-abstraction", 3, 1.0);
  // Default overAbstraction.maxProps = 10; max(9,11,14)=14 > 10 → correlated
  const evidenceByRule = new Map([["react/over-abstraction", [9, 11, 14]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.overAbstraction?.maxProps).toBe(14);
});

// ── B1c: hook-topology ceiling — max(fanIn) over rejected = 10 ───────────────

test("hook-topology: uses max(fanIn)=10", () => {
  const stat = makeStat("react/hook-topology", 3, 1.0);
  // Default hookTopology.maxFanIn = 5; max(4,8,10)=10 > 5 → correlated
  const evidenceByRule = new Map([["react/hook-topology", [4, 8, 10]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.hookTopology?.maxFanIn).toBe(10);
});

// ── B1d: shared-extraction floor (inverted) — max(instances.length)+1 = 7 ────

test("shared-extraction: uses max(instances.length)+1=7 (inverted floor)", () => {
  const stat = makeStat("react/shared-extraction", 3, 1.0);
  // Default shared.minInstances = 3; max(3,4,6)+1=7 > 3 → correlated (inverted floor)
  const evidenceByRule = new Map([["react/shared-extraction", [3, 4, 6]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.shared?.minInstances).toBe(7);
});

// ── B1e: cap at 50 ────────────────────────────────────────────────────────────

test("cap at 50 when observed max > 50", () => {
  const stat = makeStat("react/render-coupling", 3, 1.0);
  const evidenceByRule = new Map([["react/render-coupling", [73]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(50);
});

// ── B1f: fallback when no evidence — generic current+1 ───────────────────────

test("no evidence → generic current+1 fallback", () => {
  const stat = makeStat("react/render-coupling", 5, 0.8);
  const evidenceByRule = new Map<string, number[]>(); // empty map (no key)
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  // Fallback to S1 behavior: current+1 = 5+1=6
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(DEFAULT.renderCoupling.maxFanIn + 1);
});

// ── B1g: fallback when newValue == current — NOT a no-op ─────────────────────

test("max(evidence) == current → fallback to current+1, not no-op", () => {
  const stat = makeStat("react/render-coupling", 4, 1.0);
  // Default maxFanIn=5; max(evidence)=5 → newValue=5 which is NOT > current(5) → fallback
  const evidenceByRule = new Map([["react/render-coupling", [5]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  // Fallback: current+1 = 6 (not 5, not no-op)
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(6);
});

// ── B1h: fallback when newValue < current — generic current+1 ────────────────

test("max(evidence) < current → fallback to current+1", () => {
  const stat = makeStat("react/render-coupling", 4, 1.0);
  // Default maxFanIn=5; evidence max=3 → 3 < 5 → fallback
  const evidenceByRule = new Map([["react/render-coupling", [3, 2, 1]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(DEFAULT.renderCoupling.maxFanIn + 1);
});

// ── B1i: partial evidence (subset resolved) uses max of subset ───────────────

test("partial evidence (subset resolved) uses max of subset", () => {
  const stat = makeStat("react/render-coupling", 4, 1.0);
  // Two were resolved (7,9), two were null-skipped by lookupRejectedEvidence
  const evidenceByRule = new Map([["react/render-coupling", [7, 9]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(9);
});

// ── B1j: rationale cites observed max and rejected count ─────────────────────

test("rationale cites observed max (12) and rejected count (4)", () => {
  const stat = makeStat("react/render-coupling", 4, 1.0);
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.reason).toMatch(/12/);
  expect(sug.reason).toMatch(/4/);
});

// ── B1j2: floor-rule rationale cites observed metric, not the suggested value ─

test("shared-extraction rationale cites observed max instances (6), not minInstances (7)", () => {
  const stat = makeStat("react/shared-extraction", 3, 1.0);
  const evidenceByRule = new Map([["react/shared-extraction", [3, 4, 6]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  // suggested minInstances = max+1 = 7, but observed max metric = 6
  expect(sug.patch.shared?.minInstances).toBe(7);
  expect(sug.reason).toMatch(/observed max instances: 6/);
  expect(sug.reason).toMatch(/3 rejected findings/);
});

// ── B1j3: capped rationale cites pre-cap observed max, not the clamped value ──

test("capped rationale cites observed max (73), not the clamped newValue (50)", () => {
  const stat = makeStat("react/render-coupling", 3, 1.0);
  const evidenceByRule = new Map([["react/render-coupling", [73]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(50);
  expect(sug.reason).toMatch(/observed max fanIn: 73/);
  expect(sug.reason).toMatch(/maxFanIn: 50/);
});

// ── B1k: determinism ──────────────────────────────────────────────────────────

test("deterministic — same input same output", () => {
  const stats = [makeStat("react/render-coupling", 4, 1.0)];
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const a = computeSuggestionsWithEvidence(stats, DEFAULT, evidenceByRule);
  const b = computeSuggestionsWithEvidence(stats, DEFAULT, evidenceByRule);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

// ── B1l: correlated patch is schema-valid ────────────────────────────────────

test("correlated patch is ConfigSchema.partial() valid", () => {
  const stat = makeStat("react/render-coupling", 4, 1.0);
  const evidenceByRule = new Map([["react/render-coupling", [6, 7, 9, 12]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  const result = ConfigSchema.partial().safeParse(sug.patch);
  expect(result.success).toBe(true);
});

// ── B1m: adapter rule still gets severity downgrade even with evidence ────────

test("adapter rule still gets severity downgrade even with evidence in map", () => {
  const stat = makeStat("react/container-presenter-role-drift", 5, 0.8);
  const evidenceByRule = new Map([["react/container-presenter-role-drift", [10, 20]]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.memory?.severityMap).toBeDefined();
});

// ── B1n: empty evidence array → fallback ─────────────────────────────────────

test("empty evidence array (key present, empty []) → fallback to current+1", () => {
  const stat = makeStat("react/render-coupling", 5, 0.8);
  const evidenceByRule = new Map([["react/render-coupling", []]]);
  const [sug] = computeSuggestionsWithEvidence([stat], DEFAULT, evidenceByRule);
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(DEFAULT.renderCoupling.maxFanIn + 1);
});

// ── B1o: sorted by ruleId ─────────────────────────────────────────────────────

test("results sorted by ruleId (byte order)", () => {
  const stats = [
    makeStat("react/shared-extraction", 3, 1.0),
    makeStat("react/hook-topology", 3, 1.0),
    makeStat("react/render-coupling", 3, 1.0),
  ];
  const evidenceByRule = new Map([
    ["react/shared-extraction", [5, 6, 7]],
    ["react/hook-topology", [6, 8]],
    ["react/render-coupling", [6, 7, 9, 12]],
  ]);
  const suggestions = computeSuggestionsWithEvidence(stats, DEFAULT, evidenceByRule);
  const ruleIds = suggestions.map((s) => s.ruleId);
  expect(ruleIds).toEqual([...ruleIds].sort());
});
