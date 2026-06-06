import { expect, test } from "vitest";
import { ConfigSchema } from "../config/schema.js";
import { computeSuggestions, CALIBRATABLE_RULES, MIN_EVENTS, MIN_NEGATIVE_RATE } from "./suggest.js";
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

// ── Trigger guard tests ──────────────────────────────────────────────────────

test("no suggestions when totalEvents < MIN_EVENTS (floor miss)", () => {
  const stat = makeStat("react/shared-extraction", MIN_EVENTS - 1, 1.0);
  const suggestions = computeSuggestions([stat], DEFAULT);
  expect(suggestions).toHaveLength(0);
});

test("no suggestions when negativeRate < MIN_NEGATIVE_RATE (rate miss)", () => {
  const stat = makeStat("react/shared-extraction", MIN_EVENTS, MIN_NEGATIVE_RATE - 0.01);
  const suggestions = computeSuggestions([stat], DEFAULT);
  expect(suggestions).toHaveLength(0);
});

test("boundary: totalEvents=3, negativeRate=0.5 TRIGGERS suggestion (inclusive >=)", () => {
  const stat = makeStat("react/shared-extraction", MIN_EVENTS, MIN_NEGATIVE_RATE);
  const suggestions = computeSuggestions([stat], DEFAULT);
  expect(suggestions.length).toBeGreaterThan(0);
});

test("trigger met: totalEvents > MIN_EVENTS and negativeRate > MIN_NEGATIVE_RATE", () => {
  const stat = makeStat("react/shared-extraction", 10, 0.8);
  const suggestions = computeSuggestions([stat], DEFAULT);
  expect(suggestions.length).toBeGreaterThan(0);
});

// ── Core-rule threshold suggestions (D0, allowlist) ──────────────────────────

test("react/shared-extraction → raises shared.minInstances by 1", () => {
  const stat = makeStat("react/shared-extraction", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  expect(sug.ruleId).toBe("react/shared-extraction");
  expect(sug.reason).toMatch(/threshold/i);
  const patch = sug.patch;
  expect(patch.shared?.minInstances).toBe(DEFAULT.shared.minInstances + 1);
});

test("react/render-coupling → raises renderCoupling.maxFanIn by 1", () => {
  const stat = makeStat("react/render-coupling", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  expect(sug.patch.renderCoupling?.maxFanIn).toBe(DEFAULT.renderCoupling.maxFanIn + 1);
});

test("react/over-abstraction → raises overAbstraction.maxProps by 1", () => {
  const stat = makeStat("react/over-abstraction", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  expect(sug.patch.overAbstraction?.maxProps).toBe(DEFAULT.overAbstraction.maxProps + 1);
});

test("react/hook-topology → raises hookTopology.maxFanIn by 1", () => {
  const stat = makeStat("react/hook-topology", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  expect(sug.patch.hookTopology?.maxFanIn).toBe(DEFAULT.hookTopology.maxFanIn + 1);
});

// ── CALIBRATABLE_RULES allowlist (D0 — NOT prefix test) ──────────────────────

test("react/container-presenter-role-drift → NOT in allowlist → severity downgrade (not threshold)", () => {
  const stat = makeStat("react/container-presenter-role-drift", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  // adapter rule — should use severity downgrade, not threshold raise
  expect(sug.patch.memory?.severityMap).toBeDefined();
  expect(sug.patch.shared?.minInstances).toBeUndefined();
});

test("CALIBRATABLE_RULES contains exactly the 4 core rules", () => {
  expect(CALIBRATABLE_RULES.map((r) => r.ruleId).sort()).toEqual([
    "react/hook-topology",
    "react/over-abstraction",
    "react/render-coupling",
    "react/shared-extraction",
  ]);
});

// ── Adapter / unknown rules → severity downgrade ──────────────────────────────

test("unknown rule → memory.severityMap downgrade patch", () => {
  const stat = makeStat("some/unknown-rule", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  expect(sug.patch.memory?.severityMap).toEqual({ error: "warn", warn: "info" });
});

test("adapter rule reason mentions adapter (not threshold-calibratable)", () => {
  const stat = makeStat("react/context-value-drift", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  expect(sug.reason).toMatch(/severity/i);
});

// ── Core rule at cap → severity downgrade fallback ───────────────────────────

test("core rule at max (50) → severity downgrade fallback instead of threshold raise", () => {
  // Create config with shared.minInstances already at 50
  const cappedConfig = ConfigSchema.parse({ shared: { minInstances: 50 } }) as RaiConfig;
  const stat = makeStat("react/shared-extraction", 5, 0.8);
  const [sug] = computeSuggestions([stat], cappedConfig);
  expect(sug.patch.memory?.severityMap).toEqual({ error: "warn", warn: "info" });
  expect(sug.patch.shared?.minInstances).toBeUndefined();
});

// ── Patch validation ──────────────────────────────────────────────────────────

test("every generated patch is ConfigSchema.partial().safeParse valid", () => {
  const ruleIds = [
    "react/shared-extraction",
    "react/render-coupling",
    "react/over-abstraction",
    "react/hook-topology",
    "react/container-presenter-role-drift",
    "some/unknown-rule",
  ];
  for (const ruleId of ruleIds) {
    const stat = makeStat(ruleId, 10, 0.9);
    const suggestions = computeSuggestions([stat], DEFAULT);
    for (const sug of suggestions) {
      const result = ConfigSchema.partial().safeParse(sug.patch);
      expect(result.success, `patch invalid for ${ruleId}: ${JSON.stringify(result)}`).toBe(true);
    }
  }
});

// ── Determinism + sort ────────────────────────────────────────────────────────

test("results are sorted by ruleId (deterministic)", () => {
  const stats = [
    makeStat("react/shared-extraction", 5, 0.8),
    makeStat("react/hook-topology", 5, 0.8),
    makeStat("react/render-coupling", 5, 0.8),
    makeStat("react/over-abstraction", 5, 0.8),
  ];
  const suggestions = computeSuggestions(stats, DEFAULT);
  const ruleIds = suggestions.map((s) => s.ruleId);
  expect(ruleIds).toEqual([...ruleIds].sort());
});

test("computeSuggestions is deterministic — same input same output", () => {
  const stats = [makeStat("react/shared-extraction", 5, 0.8)];
  const a = computeSuggestions(stats, DEFAULT);
  const b = computeSuggestions(stats, DEFAULT);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

// ── Minimal patch ─────────────────────────────────────────────────────────────

test("core rule patch only touches its own group, not other groups", () => {
  const stat = makeStat("react/shared-extraction", 5, 0.8);
  const [sug] = computeSuggestions([stat], DEFAULT);
  // Only shared group should be present in patch
  expect(Object.keys(sug.patch)).toEqual(["shared"]);
});

test("no suggestion generated for rule not meeting trigger", () => {
  const stats = [
    makeStat("react/shared-extraction", 1, 0.9), // below MIN_EVENTS
    makeStat("react/render-coupling", 5, 0.1),    // below MIN_NEGATIVE_RATE
  ];
  expect(computeSuggestions(stats, DEFAULT)).toHaveLength(0);
});
