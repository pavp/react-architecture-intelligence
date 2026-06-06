import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { aggregateFeedback } from "./feedback-aggregate.js";
import type { Verdict } from "../types.js";

function seedRow(
  db: ReturnType<typeof openDb>,
  ruleId: string,
  verdict: Verdict,
  fingerprint = "FP1",
  id?: string,
) {
  db.prepare(
    `INSERT INTO feedback_event (id, fingerprint, rule_id, verdict, source, origin_run_id,
      weight_hint, reason, commit_sha, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id ?? `${ruleId}-${verdict}-${Math.random()}`,
    fingerprint,
    ruleId,
    verdict,
    "human",
    null,
    null,
    null,
    null,
    Date.now(),
  );
}

test("empty DB returns empty array", () => {
  const db = openDb(":memory:");
  expect(aggregateFeedback(db)).toEqual([]);
});

test("single rule single verdict yields correct stats", () => {
  const db = openDb(":memory:");
  seedRow(db, "react/shared-extraction", "reject");
  const [stat] = aggregateFeedback(db);
  expect(stat.ruleId).toBe("react/shared-extraction");
  expect(stat.totalEvents).toBe(1);
  expect(stat.byVerdict.reject).toBe(1);
  expect(stat.byVerdict.accept).toBe(0);
  expect(stat.byVerdict.confirm).toBe(0);
  expect(stat.byVerdict.wontfix).toBe(0);
  expect(stat.byVerdict.dismiss).toBe(0);
  // negativeRate = (reject+wontfix+dismiss)/total = 1/1 = 1
  expect(stat.negativeRate).toBe(1);
});

test("negativeRate = (reject + wontfix + dismiss) / total — D7", () => {
  const db = openDb(":memory:");
  // 2 reject, 1 wontfix, 1 dismiss (negative=4), 1 accept, 1 confirm (positive=2) => total=6
  seedRow(db, "r1", "reject", "FP1", "id1");
  seedRow(db, "r1", "reject", "FP2", "id2");
  seedRow(db, "r1", "wontfix", "FP3", "id3");
  seedRow(db, "r1", "dismiss", "FP4", "id4");
  seedRow(db, "r1", "accept", "FP5", "id5");
  seedRow(db, "r1", "confirm", "FP6", "id6");
  const [stat] = aggregateFeedback(db);
  expect(stat.totalEvents).toBe(6);
  expect(stat.negativeRate).toBeCloseTo(4 / 6);
});

test("dismiss counts FULLY as negative (not 0.5) — D7", () => {
  const db = openDb(":memory:");
  // 3 dismiss only => negativeRate = 1.0
  seedRow(db, "r2", "dismiss", "FP1", "d1");
  seedRow(db, "r2", "dismiss", "FP2", "d2");
  seedRow(db, "r2", "dismiss", "FP3", "d3");
  const [stat] = aggregateFeedback(db);
  expect(stat.negativeRate).toBe(1);
});

test("distinctFingerprints de-duplicates same fingerprint across verdicts", () => {
  const db = openDb(":memory:");
  // Same fingerprint FP1, 3 events
  seedRow(db, "r3", "reject", "FP1", "e1");
  seedRow(db, "r3", "accept", "FP1", "e2");
  seedRow(db, "r3", "confirm", "FP1", "e3");
  // Different fingerprint FP2, 1 event
  seedRow(db, "r3", "reject", "FP2", "e4");
  const [stat] = aggregateFeedback(db);
  expect(stat.distinctFingerprints).toBe(2);
  expect(stat.totalEvents).toBe(4);
});

test("multiple rules — result sorted by ruleId (byte order)", () => {
  const db = openDb(":memory:");
  seedRow(db, "react/z-rule", "accept", "FP1", "z1");
  seedRow(db, "react/a-rule", "accept", "FP2", "a1");
  seedRow(db, "react/m-rule", "accept", "FP3", "m1");
  const stats = aggregateFeedback(db);
  expect(stats.map((s) => s.ruleId)).toEqual(["react/a-rule", "react/m-rule", "react/z-rule"]);
});

test("zero-fill all 5 verdict buckets for each rule", () => {
  const db = openDb(":memory:");
  seedRow(db, "r4", "accept");
  const [stat] = aggregateFeedback(db);
  expect(Object.keys(stat.byVerdict).sort()).toEqual(
    ["accept", "confirm", "dismiss", "reject", "wontfix"].sort(),
  );
  expect(stat.byVerdict.accept).toBe(1);
  expect(stat.byVerdict.reject).toBe(0);
  expect(stat.byVerdict.wontfix).toBe(0);
  expect(stat.byVerdict.dismiss).toBe(0);
  expect(stat.byVerdict.confirm).toBe(0);
});

test("two rules do not bleed into each other", () => {
  const db = openDb(":memory:");
  seedRow(db, "r5", "reject", "FP1", "x1");
  seedRow(db, "r6", "accept", "FP2", "x2");
  const stats = aggregateFeedback(db);
  expect(stats).toHaveLength(2);
  const r5 = stats.find((s) => s.ruleId === "r5")!;
  const r6 = stats.find((s) => s.ruleId === "r6")!;
  expect(r5.byVerdict.reject).toBe(1);
  expect(r5.byVerdict.accept).toBe(0);
  expect(r6.byVerdict.accept).toBe(1);
  expect(r6.byVerdict.reject).toBe(0);
});
