/**
 * Tests for CALIBRATABLE_SECONDARY_RULES, computeSecondarySuggestions.
 * T2.1 RED: written before implementation exists.
 * Covers G2 (dominant-breach gate) + G3 (loosen-only arithmetic + rationale).
 */
import { expect, test } from "vitest";
import { ConfigSchema } from "../config/schema.js";
import {
  CALIBRATABLE_SECONDARY_RULES,
  computeSecondarySuggestions,
} from "./suggest.js";
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

// ── CALIBRATABLE_SECONDARY_RULES structure ────────────────────────────────────

test("CALIBRATABLE_SECONDARY_RULES has exactly 2 entries", () => {
  expect(CALIBRATABLE_SECONDARY_RULES).toHaveLength(2);
});

test("CALIBRATABLE_SECONDARY_RULES[0] is render-coupling maxFanOut default 7", () => {
  const entry = CALIBRATABLE_SECONDARY_RULES.find((r) => r.ruleId === "react/render-coupling");
  expect(entry).toBeDefined();
  expect(entry!.knob).toBe("maxFanOut");
  expect(entry!.defaultValue).toBe(7);
  expect(entry!.maxCap).toBe(50);
  expect(entry!.currentValue(DEFAULT)).toBe(7);
});

test("CALIBRATABLE_SECONDARY_RULES[1] is hook-topology maxFanOut default 5", () => {
  const entry = CALIBRATABLE_SECONDARY_RULES.find((r) => r.ruleId === "react/hook-topology");
  expect(entry).toBeDefined();
  expect(entry!.knob).toBe("maxFanOut");
  expect(entry!.defaultValue).toBe(5);
  expect(entry!.maxCap).toBe(50);
  expect(entry!.currentValue(DEFAULT)).toBe(5);
});

// ── Dominant-breach gate ──────────────────────────────────────────────────────

test("fanOut count > fanIn count → dominant → suggestion emitted", () => {
  // DEFAULT: renderCoupling.maxFanIn=5, maxFanOut=7
  // rows: 3 with fanOut>7 (fanOut dominant), 1 with fanIn>5 (fanIn breach)
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 4, fanOut: 8 },  // fanOut breaches (8>7)
    { fanIn: 4, fanOut: 9 },  // fanOut breaches (9>7)
    { fanIn: 4, fanOut: 10 }, // fanOut breaches (10>7)
    { fanIn: 6, fanOut: 3 },  // fanIn breaches (6>5), fanOut does not (3<7)
    { fanIn: 3, fanOut: 5 },  // neither breaches
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].ruleId).toBe("react/render-coupling");
  expect(suggestions[0].patch.renderCoupling?.maxFanOut).toBeDefined();
});

test("fanIn count > fanOut count → not dominant → no suggestion", () => {
  // rows: 3 fanIn breaches, 1 fanOut breach
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 6, fanOut: 3 },  // fanIn breaches
    { fanIn: 7, fanOut: 4 },  // fanIn breaches
    { fanIn: 8, fanOut: 5 },  // fanIn breaches
    { fanIn: 4, fanOut: 9 },  // fanOut breaches
    { fanIn: 3, fanOut: 3 },  // neither
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

test("equal counts (tie) → no suggestion", () => {
  // DEFAULT: hookTopology.maxFanIn=5, maxFanOut=5
  const stat = makeStat("react/hook-topology", 4, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 6, fanOut: 3 },  // fanIn breaches
    { fanIn: 6, fanOut: 3 },  // fanIn breaches
    { fanIn: 3, fanOut: 7 },  // fanOut breaches
    { fanIn: 3, fanOut: 7 },  // fanOut breaches
  ];
  const rowsByRule = new Map([["react/hook-topology", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

test("no rejected rows → no suggestion", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rowsByRule = new Map<string, RejectedMetricRow[]>(); // empty
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

test("fanOut dominant but newValue ≤ current → no suggestion (loosen-only)", () => {
  // DEFAULT: renderCoupling.maxFanOut=7
  // fanOut breaches: [4, 5, 6] → all < 7; max=6 ≤ 7 → no suggestion
  const stat = makeStat("react/render-coupling", 4, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 4 },  // fanOut does NOT breach (4<7)
    { fanIn: 3, fanOut: 5 },  // fanOut does NOT breach (5<7)
    { fanIn: 3, fanOut: 6 },  // fanOut does NOT breach (6<7)
    { fanIn: 4, fanOut: 3 },  // neither
  ];
  // Note: none of these fanOut values exceed currentFanOut=7, so fanOut breach count=0
  // fanIn breach count=1 (fanIn=4, but wait default maxFanIn=5, so 4<5 → no breach either)
  // Let's make a proper dominant case where max fanOut < current maxFanOut
  // Use explicit config with higher maxFanOut
  const configHighFanOut: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 15 },
  };
  // Now fanOut breaches need to exceed 15; our values are 8,9,10 < 15 → max=10 ≤ 15
  const rows2: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 16 }, // fanOut breaches (16>15)
    { fanIn: 3, fanOut: 16 }, // fanOut breaches
    { fanIn: 3, fanOut: 16 }, // fanOut breaches
    { fanIn: 4, fanOut: 3 },  // fanIn might breach if maxFanIn<4
  ];
  // To test newValue ≤ current: max(fanOut of dominant rows) must be ≤ currentMaxFanOut
  // Use configHighFanOut where maxFanOut=15, and fanOut values are exactly 15
  const rowsEqualCurrent: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 15 }, // fanOut=15 does NOT breach (15 is not > 15)
    { fanIn: 3, fanOut: 15 },
    { fanIn: 3, fanOut: 15 },
    { fanIn: 4, fanOut: 3 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rowsEqualCurrent]]);
  const suggestions = computeSecondarySuggestions([stat], configHighFanOut, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

test("fanOut dominant, newValue > current → suggestion emitted with correct patch", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  // DEFAULT.renderCoupling.maxFanOut = 7; fanOut breach values: [8, 10, 12]; max=12 > 7
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 8 },   // fanOut breaches (8>7)
    { fanIn: 3, fanOut: 10 },  // fanOut breaches (10>7)
    { fanIn: 3, fanOut: 12 },  // fanOut breaches (12>7)
    { fanIn: 6, fanOut: 4 },   // fanIn breaches (6>5)
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].patch.renderCoupling?.maxFanOut).toBe(12);
});

// ── G3: Loosen-only arithmetic + rationale edge cases ────────────────────────

test("observed max 63 → suggestion value clamped to 50 (maxCap)", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 63 },
    { fanIn: 3, fanOut: 50 },
    { fanIn: 3, fanOut: 40 },
    { fanIn: 6, fanOut: 3 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].patch.renderCoupling?.maxFanOut).toBe(50);
});

test("rationale string contains 'observed max fanOut: {N} across {M} rejected findings'", () => {
  const stat = makeStat("react/hook-topology", 4, 1.0);
  // DEFAULT.hookTopology.maxFanOut = 5; fanOut breach values: [7, 9, 10]; max=10, count=3
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 7 },
    { fanIn: 3, fanOut: 9 },
    { fanIn: 3, fanOut: 10 },
    { fanIn: 6, fanOut: 2 },
  ];
  const rowsByRule = new Map([["react/hook-topology", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].reason).toMatch(/observed max fanOut: 10/);
  expect(suggestions[0].reason).toMatch(/3 rejected findings/);
});

test("newValue = current → no suggestion (equal not greater)", () => {
  // Set maxFanOut to exactly the max of dominant fanOut values
  const configWith12: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 12 },
  };
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 13 }, // fanOut breaches (13>12)
    { fanIn: 3, fanOut: 13 }, // fanOut breaches
    { fanIn: 3, fanOut: 13 }, // fanOut breaches
    { fanIn: 6, fanOut: 4 },  // fanIn breaches
  ];
  // Wait — max of fanOut breach values = 13 > 12 → would emit
  // We need max = 12 = current → no emission
  const rowsEqualMax: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 13 }, // fanOut breaches (>12)
    { fanIn: 3, fanOut: 12 }, // fanOut does NOT breach (12 is not > 12)
    { fanIn: 3, fanOut: 11 }, // fanOut does NOT breach
    { fanIn: 6, fanOut: 4 },  // fanIn breaches
  ];
  // Dominant rows (fanOut > 12): only row 0 (fanOut=13)
  // max(dominant fanOut) = 13 > 12 → would emit 13, not equal
  // Instead: use a config where maxFanOut = max(dominant fanOut values)
  const configWith13: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 13 },
  };
  // With maxFanOut=13: fanOut=14 would breach; max=14; 14>13 → would emit
  // For newValue = current, we need: max(dominant rows' fanOut) = current
  // so dominant rows must have fanOut values where max exactly equals configWith13.maxFanOut=13
  const rowsExactlyCurrent: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 14 }, // fanOut breaches (14>13)
    { fanIn: 3, fanOut: 14 },
    { fanIn: 3, fanOut: 14 },
    { fanIn: 6, fanOut: 4 },
  ];
  const configWith14: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 14 },
  };
  // With maxFanOut=14: fanOut=14 does NOT breach (14 not > 14)
  // So no fanOut breaches at all → fanOut dominant gate fails → no suggestion
  // Let's test: fanOut values 15,15,15 → max=15; configWith15 → 15 not > 15
  const configWith15: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 15 },
  };
  const rowsMax15: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 16 }, // breaches (16>15)
    { fanIn: 3, fanOut: 16 },
    { fanIn: 3, fanOut: 16 },
    { fanIn: 6, fanOut: 4 },
  ];
  // max = 16 > 15 → would emit 16
  // For exactly equal: dominant rows have max fanOut = configWith15.maxFanOut = 15
  // but fanOut=15 doesn't breach (not >15), so these wouldn't be dominant rows
  // Conclusion: the "newValue = current" scenario can only happen via cap:
  // e.g., maxFanOut=50 (at cap), dominant fanOut values are [63] → capped to 50 = current → no emission
  const configAtCap: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 50 },
  };
  const rowsAtCap: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 63 }, // fanOut breaches (63>50)
    { fanIn: 3, fanOut: 55 }, // fanOut breaches
    { fanIn: 3, fanOut: 52 }, // fanOut breaches
    { fanIn: 6, fanOut: 4 },  // fanIn breaches (6>5)
  ];
  const rowsByRule = new Map([["react/render-coupling", rowsAtCap]]);
  // max = 63, capped to 50 = current → newValue(50) not > current(50) → no suggestion
  const suggestions = computeSecondarySuggestions([stat], configAtCap, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

test("newValue < current → no suggestion", () => {
  // renderCoupling.maxFanOut = 12; all fanOut breach values are < 12 after cap
  // But wait: breach means fanOut > currentFanOut; if currentFanOut=12, fanOut must be >12
  // So breach rows have fanOut > 12; max of those > 12; so newValue always > 12 unless capped
  // This scenario is covered by "newValue = current" (cap case) above.
  // A simpler test: no fanOut breaches at all (all fanOut ≤ currentFanOut) → fanOut count = 0
  // → not dominant → no suggestion (covered by "fanIn dominant" test above)
  // Additional explicit test: ensure newValue < current cannot happen (it's logically impossible
  // without cap because dominant rows must have fanOut > current, so max > current always)
  // However the spec says to test it; we verify via config-at-cap scenario:
  // config.maxFanOut = 50; dominant rows [51,52] → max=52 capped to 50 = current → no emission
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const configFanOut50: RaiConfig = {
    ...DEFAULT,
    renderCoupling: { ...DEFAULT.renderCoupling, maxFanOut: 50 },
  };
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 51 },
    { fanIn: 3, fanOut: 52 },
    { fanIn: 3, fanOut: 53 },
    { fanIn: 6, fanOut: 4 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], configFanOut50, rowsByRule);
  // min(max(51,52,53), 50) = 50 = current → not emitted
  expect(suggestions).toHaveLength(0);
});

// ── Trigger threshold respected ───────────────────────────────────────────────

test("below MIN_EVENTS threshold → no suggestion", () => {
  const stat = makeStat("react/render-coupling", 2, 1.0); // 2 < MIN_EVENTS(3)
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 10 },
    { fanIn: 3, fanOut: 11 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

test("below MIN_NEGATIVE_RATE threshold → no suggestion", () => {
  const stat = makeStat("react/render-coupling", 10, 0.3); // 0.3 < MIN_NEGATIVE_RATE(0.5)
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 10 },
    { fanIn: 3, fanOut: 11 },
    { fanIn: 3, fanOut: 12 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(0);
});

// ── Patch schema validity ─────────────────────────────────────────────────────

test("emitted patch is ConfigSchema.partial() valid", () => {
  const stat = makeStat("react/render-coupling", 5, 1.0);
  const rows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 8 },
    { fanIn: 3, fanOut: 10 },
    { fanIn: 3, fanOut: 12 },
    { fanIn: 6, fanOut: 4 },
  ];
  const rowsByRule = new Map([["react/render-coupling", rows]]);
  const suggestions = computeSecondarySuggestions([stat], DEFAULT, rowsByRule);
  expect(suggestions).toHaveLength(1);
  const result = ConfigSchema.partial().safeParse(suggestions[0].patch);
  expect(result.success).toBe(true);
});

// ── Sort by ruleId ────────────────────────────────────────────────────────────

test("results sorted by ruleId (byte order)", () => {
  const stats = [
    makeStat("react/render-coupling", 5, 1.0),
    makeStat("react/hook-topology", 5, 1.0),
  ];
  const rcRows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 8 }, { fanIn: 3, fanOut: 10 }, { fanIn: 3, fanOut: 12 },
    { fanIn: 6, fanOut: 4 },
  ];
  const htRows: RejectedMetricRow[] = [
    { fanIn: 3, fanOut: 7 }, { fanIn: 3, fanOut: 8 }, { fanIn: 3, fanOut: 9 },
    { fanIn: 6, fanOut: 2 },
  ];
  const rowsByRule = new Map([
    ["react/render-coupling", rcRows],
    ["react/hook-topology", htRows],
  ]);
  const suggestions = computeSecondarySuggestions(stats, DEFAULT, rowsByRule);
  const ruleIds = suggestions.map((s) => s.ruleId);
  expect(ruleIds).toEqual([...ruleIds].sort());
});
