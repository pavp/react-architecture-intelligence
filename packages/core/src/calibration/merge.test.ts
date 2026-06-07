/**
 * Tests for mergeSuggestionsIntoConfig — pure merge helper (P13-S3).
 * Covers: empty base + single suggestion writes ONLY that group (CRITICAL #1),
 * unrelated keys preserved, multi-suggestion collision-free spread,
 * deterministic CALIBRATABLE_RULES ordering.
 */
import { expect, test } from "vitest";
import { mergeSuggestionsIntoConfig } from "./merge.js";
import { CALIBRATABLE_RULES } from "./suggest.js";
import type { CalibrationSuggestion } from "./suggest.js";
import type { RaiConfigInput } from "../config/schema.js";

// ── CRITICAL #1: empty base + single suggestion writes ONLY the group, NO default tree ──

test("empty base + renderCoupling suggestion → result has ONLY renderCoupling, no default tree", () => {
  const existing: RaiConfigInput = {};
  const suggestions: CalibrationSuggestion[] = [
    {
      ruleId: "react/render-coupling",
      reason: "test",
      patch: { renderCoupling: { maxFanIn: 12 } },
    },
  ];
  const result = mergeSuggestionsIntoConfig(existing, suggestions);

  // MUST have renderCoupling with suggested value
  expect(result.renderCoupling).toEqual({ maxFanIn: 12 });

  // MUST NOT have any other default keys (no shared, overAbstraction, hookTopology, etc.)
  expect(result.shared).toBeUndefined();
  expect(result.overAbstraction).toBeUndefined();
  expect(result.hookTopology).toBeUndefined();
  expect(result.reconcile).toBeUndefined();
  expect(result.memory).toBeUndefined();
  expect(result.excludeGlobs).toBeUndefined();
  expect(result.boundaries).toBeUndefined();
  expect(result.conventions).toBeUndefined();
  expect(result.configVersion).toBeUndefined();

  // Result should only have renderCoupling
  expect(Object.keys(result)).toEqual(["renderCoupling"]);
});

// ── Unrelated keys preserved ──────────────────────────────────────────────────

test("unrelated keys (excludeGlobs, boundaries, conventions, reconcile) are preserved after merge", () => {
  const existing: RaiConfigInput = {
    excludeGlobs: ["**/*.test.*", "**/vendor/**"],
    boundaries: [{ from: "features/*", to: "shared/*", reason: "no upward deps" }],
    conventions: [{ id: "no-ui-in-logic", edgeKind: "renders", from: {}, to: {}, policy: "forbid", severity: "warn", reason: "keep logic clean" }],
    reconcile: { tSame: 0.95, tDiv: 0.80 },
  };
  const suggestions: CalibrationSuggestion[] = [
    {
      ruleId: "react/render-coupling",
      reason: "test",
      patch: { renderCoupling: { maxFanIn: 12 } },
    },
  ];
  const result = mergeSuggestionsIntoConfig(existing, suggestions);

  expect(result.excludeGlobs).toEqual(["**/*.test.*", "**/vendor/**"]);
  expect(result.boundaries).toEqual([{ from: "features/*", to: "shared/*", reason: "no upward deps" }]);
  expect(result.conventions).toEqual(existing.conventions);
  expect(result.reconcile).toEqual({ tSame: 0.95, tDiv: 0.80 });
  expect(result.renderCoupling).toEqual({ maxFanIn: 12 });
});

test("existing group values are preserved for keys not in the patch", () => {
  const existing: RaiConfigInput = {
    renderCoupling: { maxFanIn: 3, maxFanOut: 9 },
  };
  const suggestions: CalibrationSuggestion[] = [
    {
      ruleId: "react/render-coupling",
      reason: "test",
      patch: { renderCoupling: { maxFanIn: 12 } },
    },
  ];
  const result = mergeSuggestionsIntoConfig(existing, suggestions);

  // maxFanIn updated; maxFanOut preserved
  expect(result.renderCoupling).toEqual({ maxFanIn: 12, maxFanOut: 9 });
});

// ── Multi-suggestion collision-free group spread ───────────────────────────────

test("multiple suggestions from different groups are all applied without collision", () => {
  const existing: RaiConfigInput = {};
  const suggestions: CalibrationSuggestion[] = [
    {
      ruleId: "react/shared-extraction",
      reason: "test",
      patch: { shared: { minInstances: 7 } },
    },
    {
      ruleId: "react/render-coupling",
      reason: "test",
      patch: { renderCoupling: { maxFanIn: 12 } },
    },
    {
      ruleId: "react/over-abstraction",
      reason: "test",
      patch: { overAbstraction: { maxProps: 15 } },
    },
    {
      ruleId: "react/hook-topology",
      reason: "test",
      patch: { hookTopology: { maxFanIn: 8 } },
    },
  ];
  const result = mergeSuggestionsIntoConfig(existing, suggestions);

  expect(result.shared).toEqual({ minInstances: 7 });
  expect(result.renderCoupling).toEqual({ maxFanIn: 12 });
  expect(result.overAbstraction).toEqual({ maxProps: 15 });
  expect(result.hookTopology).toEqual({ maxFanIn: 8 });
});

// ── Deterministic CALIBRATABLE_RULES ordering ─────────────────────────────────

test("result keys for calibratable groups appear in CALIBRATABLE_RULES order", () => {
  const existing: RaiConfigInput = {};
  // Add suggestions in reverse CALIBRATABLE_RULES order
  const reversedSuggestions: CalibrationSuggestion[] = CALIBRATABLE_RULES.slice().reverse().map((rule) => ({
    ruleId: rule.ruleId,
    reason: "test",
    patch: rule.buildPatch(10),
  }));
  const result = mergeSuggestionsIntoConfig(existing, reversedSuggestions);

  // Extract the order of calibratable group keys in the result
  const calibratableGroups = CALIBRATABLE_RULES.map((r) => r.group);
  const resultGroupKeys = Object.keys(result).filter((k) => calibratableGroups.includes(k as never));

  // They should appear in CALIBRATABLE_RULES order, not reversed input order
  const expectedOrder = calibratableGroups; // ["shared", "renderCoupling", "overAbstraction", "hookTopology"]
  expect(resultGroupKeys).toEqual(expectedOrder);
});

// ── Zero suggestions ───────────────────────────────────────────────────────────

test("zero suggestions returns shallow copy of existing input", () => {
  const existing: RaiConfigInput = {
    excludeGlobs: ["**/*.test.*"],
    renderCoupling: { maxFanIn: 5 },
  };
  const result = mergeSuggestionsIntoConfig(existing, []);

  expect(result).toEqual(existing);
  // Shallow copy, not same reference
  expect(result).not.toBe(existing);
});

// ── Empty suggestions on empty base ─────────────────────────────────────────────

test("empty base + empty suggestions → empty object", () => {
  const result = mergeSuggestionsIntoConfig({}, []);
  expect(result).toEqual({});
  expect(Object.keys(result)).toHaveLength(0);
});
