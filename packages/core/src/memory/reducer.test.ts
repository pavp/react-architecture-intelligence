import { expect, test } from "vitest";
import { reduceWeight } from "./reducer.js";
import type { FeedbackEvent } from "../types.js";

const DAY = 86_400_000;
function ev(over: Partial<FeedbackEvent>): FeedbackEvent {
  return {
    id: "e", fingerprint: "S", ruleId: "r", verdict: "reject", source: "human",
    originRunId: null, weightHint: null, reason: null, commitSha: null, createdAt: 0, ...over,
  };
}
const opts = { asOf: 0, configVersion: "1", halfLifeDays: 180 };

test("no events -> neutral zero weight", () => {
  const w = reduceWeight([], "S", "r", opts);
  expect(w.value).toBe(0);
  expect(w.confidence).toBe(0);
});

test("a human reject -> negative value", () => {
  const w = reduceWeight([ev({ verdict: "reject" })], "S", "r", opts);
  expect(w.value).toBeLessThan(0);
});

test("a human accept -> positive value", () => {
  const w = reduceWeight([ev({ verdict: "accept" })], "S", "r", opts);
  expect(w.value).toBeGreaterThan(0);
});

test("opposing equal signals cancel to ~0 but confidence > 0 (contested, not absent)", () => {
  const w = reduceWeight(
    [ev({ id: "a", verdict: "accept" }), ev({ id: "b", verdict: "reject" })], "S", "r", opts,
  );
  expect(Math.abs(w.value)).toBeLessThan(1e-9);
  expect(w.confidence).toBeGreaterThan(0);
});

test("human outweighs agent (1.0 vs 0.3)", () => {
  const w = reduceWeight(
    [ev({ id: "h", verdict: "reject", source: "human" }), ev({ id: "a", verdict: "accept", source: "agent" })],
    "S", "r", opts,
  );
  expect(w.value).toBeLessThan(0); // human reject wins
});

test("old feedback decays (asOf far in the future weakens it)", () => {
  const recent = reduceWeight([ev({ verdict: "reject", createdAt: 0 })], "S", "r", { ...opts, asOf: 0 });
  const old = reduceWeight([ev({ verdict: "reject", createdAt: 0 })], "S", "r", { ...opts, asOf: 360 * DAY });
  expect(old.confidence).toBeLessThan(recent.confidence); // 2 half-lives -> weaker
});

test("value stays bounded in [-1, 1] under many events", () => {
  const evs = Array.from({ length: 100 }, (_, i) => ev({ id: "e" + i, verdict: "reject" }));
  const w = reduceWeight(evs, "S", "r", opts);
  expect(w.value).toBeGreaterThanOrEqual(-1);
  expect(w.value).toBeLessThanOrEqual(1);
});
