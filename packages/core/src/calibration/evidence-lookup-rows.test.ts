/**
 * Tests for lookupRejectedEvidenceRows.
 * T1.1 RED: written before implementation exists.
 */
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../db/db.js";
import type { Db } from "../db/db.js";
import { lookupRejectedEvidenceRows } from "./evidence-lookup.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTmpDb(): { db: Db; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "rai-ev-rows-test-"));
  dirs.push(dir);
  const dbPath = join(dir, "rai.sqlite");
  const db = openDb(dbPath);
  return { db, dbPath };
}

function seedFinding(
  db: Db,
  fingerprint: string,
  ruleId: string,
  evidenceJson: string,
): void {
  db.prepare(
    `INSERT INTO finding (id, fingerprint, rule_id, type, analysis_version, fp_algo_version,
      producing_run_id, commit_sha, severity_raw, evidence_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `finding-${fingerprint}-${ruleId}`,
    fingerprint,
    ruleId,
    "opportunity",
    1,
    1,
    "run-1",
    "abc123",
    "warn",
    evidenceJson,
    Date.now(),
  );
}

function seedFeedback(
  db: Db,
  fingerprint: string,
  ruleId: string,
  verdict: string,
): void {
  db.prepare(
    `INSERT INTO feedback_event (id, fingerprint, rule_id, verdict, source, origin_run_id,
      weight_hint, reason, commit_sha, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `fb-${fingerprint}-${ruleId}-${verdict}-${Math.random()}`,
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

// ── render-coupling: returns paired { fanIn, fanOut } rows ────────────────────

test("render-coupling: returns paired {fanIn, fanOut} rows for rejected findings", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";
  const fps = ["FP0", "FP1", "FP2"];
  const data = [
    { fanIn: 6, fanOut: 8 },
    { fanIn: 7, fanOut: 10 },
    { fanIn: 9, fanOut: 14 },
  ];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "render-coupling",
      component: { name: `Comp${i}`, span: { start: 0, end: 0 }, fingerprint: fps[i] },
      fanIn: data[i].fanIn,
      fanOut: data[i].fanOut,
      directChildren: 1,
      reachableDepth: 1,
    }));
    seedFeedback(db, fps[i], ruleId, "reject");
  }

  const result = lookupRejectedEvidenceRows(db, ruleId);
  db.close();

  expect(result).toHaveLength(3);
  const sorted = [...result].sort((a, b) => a.fanIn - b.fanIn);
  expect(sorted[0]).toEqual({ fanIn: 6, fanOut: 8 });
  expect(sorted[1]).toEqual({ fanIn: 7, fanOut: 10 });
  expect(sorted[2]).toEqual({ fanIn: 9, fanOut: 14 });
});

// ── hook-topology: returns paired { fanIn, fanOut } rows ──────────────────────

test("hook-topology: returns paired {fanIn, fanOut} rows for rejected findings", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/hook-topology";
  const fps = ["FP0", "FP1"];
  const data = [
    { fanIn: 4, fanOut: 5 },
    { fanIn: 8, fanOut: 11 },
  ];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "hook-topology",
      hook: { name: `useHook${i}`, span: { start: 0, end: 0 }, fingerprint: fps[i] },
      fanIn: data[i].fanIn,
      fanOut: data[i].fanOut,
      directDependencies: 1,
      reachableDepth: 1,
    }));
    seedFeedback(db, fps[i], ruleId, "reject");
  }

  const result = lookupRejectedEvidenceRows(db, ruleId);
  db.close();

  expect(result).toHaveLength(2);
  const sorted = [...result].sort((a, b) => a.fanIn - b.fanIn);
  expect(sorted[0]).toEqual({ fanIn: 4, fanOut: 5 });
  expect(sorted[1]).toEqual({ fanIn: 8, fanOut: 11 });
});

// ── unknown ruleId returns [] ─────────────────────────────────────────────────

test("unknown ruleId returns []", () => {
  const { db } = makeTmpDb();
  const result = lookupRejectedEvidenceRows(db, "react/unknown-rule");
  db.close();
  expect(result).toEqual([]);
});

// ── kind mismatch (over-abstraction kind) returns [] ─────────────────────────

test("over-abstraction ruleId returns [] (not a paired-extractor rule)", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/over-abstraction";

  seedFinding(db, "FP0", ruleId, JSON.stringify({
    kind: "over-abstraction",
    component: { name: "Comp", span: { start: 0, end: 0 }, fingerprint: "FP0" },
    propCount: 15,
    hookCount: 3,
    childCount: 2,
    compositionMarkerCount: 0,
    conditionalBranchCount: 0,
  }));
  seedFeedback(db, "FP0", ruleId, "reject");

  const result = lookupRejectedEvidenceRows(db, ruleId);
  db.close();

  expect(result).toEqual([]);
});

// ── null finding (unresolvable fingerprint) is skipped, not zeroed ────────────

test("null finding (unresolvable fingerprint) is skipped, not zeroed", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";

  // Valid finding + feedback
  seedFinding(db, "FP0", ruleId, JSON.stringify({
    kind: "render-coupling",
    component: { name: "A", span: { start: 0, end: 0 }, fingerprint: "FP0" },
    fanIn: 8,
    fanOut: 10,
    directChildren: 1,
    reachableDepth: 1,
  }));
  seedFeedback(db, "FP0", ruleId, "reject");

  // Feedback for FP1 but NO finding row → null → skip
  seedFeedback(db, "FP1", ruleId, "reject");

  const result = lookupRejectedEvidenceRows(db, ruleId);
  db.close();

  expect(result).toHaveLength(1);
  expect(result[0]).toEqual({ fanIn: 8, fanOut: 10 });
});

// ── fingerprint with fanOut: undefined is skipped ────────────────────────────

test("fingerprint with fanOut missing from evidence is skipped", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";

  // Finding lacks fanOut field
  seedFinding(db, "FP0", ruleId, JSON.stringify({
    kind: "render-coupling",
    component: { name: "A", span: { start: 0, end: 0 }, fingerprint: "FP0" },
    fanIn: 6,
    // fanOut deliberately omitted
    directChildren: 1,
    reachableDepth: 1,
  }));
  seedFeedback(db, "FP0", ruleId, "reject");

  const result = lookupRejectedEvidenceRows(db, ruleId);
  db.close();

  expect(result).toEqual([]);
});
