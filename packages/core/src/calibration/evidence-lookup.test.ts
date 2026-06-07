/**
 * Tests for lookupRejectedEvidence.
 * A1 RED: written before implementation exists.
 */
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../db/db.js";
import type { Db } from "../db/db.js";
import { lookupRejectedEvidence } from "./evidence-lookup.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTmpDb(): { db: Db; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "rai-ev-test-"));
  dirs.push(dir);
  const dbPath = join(dir, "rai.sqlite");
  const db = openDb(dbPath);
  return { db, dbPath };
}

/** Seed a finding row (all 11 NOT NULL cols). evidence_json is a JSON string. */
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

/** Seed a feedback_event row with a given verdict. */
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

// ── Basic: returns correct metric values per rule ────────────────────────────

test("render-coupling: returns fanIn values from rejected findings", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";
  const fps = ["FP0", "FP1", "FP2", "FP3"];
  const fanIns = [6, 7, 9, 12];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "render-coupling",
      component: { name: "Comp", span: { start: 0, end: 0 }, fingerprint: fps[i] },
      fanIn: fanIns[i],
      fanOut: 1,
      directChildren: 1,
      reachableDepth: 1,
    }));
    seedFeedback(db, fps[i], ruleId, "reject");
  }

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result).toHaveLength(4);
  expect(result.sort((a, b) => a - b)).toEqual([6, 7, 9, 12]);
});

test("over-abstraction: returns propCount values from rejected findings", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/over-abstraction";
  const fps = ["FP0", "FP1", "FP2"];
  const propCounts = [9, 11, 14];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "over-abstraction",
      component: { name: "Comp", span: { start: 0, end: 0 }, fingerprint: fps[i] },
      propCount: propCounts[i],
      hookCount: 2,
      childCount: 1,
      compositionMarkerCount: 0,
      conditionalBranchCount: 0,
    }));
    seedFeedback(db, fps[i], ruleId, "reject");
  }

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result.sort((a, b) => a - b)).toEqual([9, 11, 14]);
});

test("hook-topology: returns fanIn values from rejected findings", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/hook-topology";
  const fps = ["FP0", "FP1", "FP2"];
  const fanIns = [4, 8, 10];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "hook-topology",
      hook: { name: "useHook", span: { start: 0, end: 0 }, fingerprint: fps[i] },
      fanIn: fanIns[i],
      fanOut: 1,
      directDependencies: 1,
      reachableDepth: 1,
    }));
    seedFeedback(db, fps[i], ruleId, "reject");
  }

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result.sort((a, b) => a - b)).toEqual([4, 8, 10]);
});

test("shared-extraction: returns instances.length values from rejected findings", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/shared-extraction";
  const fps = ["FP0", "FP1", "FP2"];
  const instanceLengths = [3, 4, 6];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "shared-extraction",
      instances: Array.from({ length: instanceLengths[i] }, (_, k) => ({
        name: `C${k}`,
        span: { start: 0, end: 0 },
        fingerprint: `fp-inst-${k}`,
        exportKind: "named",
      })),
      cosine: 0.9,
      propOverlap: 0.8,
      hookOverlap: 0.7,
      variancePoints: [],
      sharedSurface: [],
    }));
    seedFeedback(db, fps[i], ruleId, "reject");
  }

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result.sort((a, b) => a - b)).toEqual([3, 4, 6]);
});

// ── null-finding skip (not 0) ────────────────────────────────────────────────

test("fingerprint with no finding (currentVersion=null) is skipped, not treated as 0", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";

  // One valid finding + feedback
  seedFinding(db, "FP0", ruleId, JSON.stringify({
    kind: "render-coupling",
    component: { name: "A", span: { start: 0, end: 0 }, fingerprint: "FP0" },
    fanIn: 8,
    fanOut: 1,
    directChildren: 1,
    reachableDepth: 1,
  }));
  seedFeedback(db, "FP0", ruleId, "reject");

  // Feedback for FP1 but NO finding row → currentVersion returns null → skip
  seedFeedback(db, "FP1", ruleId, "reject");

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result).toEqual([8]);
  expect(result).not.toContain(0);
});

// ── kind-mismatch skip ───────────────────────────────────────────────────────

test("fingerprint where evidence.kind does not match expected kind is skipped", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";

  // Finding exists but evidence.kind is wrong (over-abstraction instead of render-coupling)
  seedFinding(db, "FP0", ruleId, JSON.stringify({
    kind: "over-abstraction",
    component: { name: "B", span: { start: 0, end: 0 }, fingerprint: "FP0" },
    propCount: 15,
    hookCount: 3,
    childCount: 2,
    compositionMarkerCount: 0,
    conditionalBranchCount: 0,
  }));
  seedFeedback(db, "FP0", ruleId, "reject");

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result).toHaveLength(0);
});

// ── empty → [] ──────────────────────────────────────────────────────────────

test("empty db returns empty array", () => {
  const { db } = makeTmpDb();
  const result = lookupRejectedEvidence(db, "react/render-coupling");
  db.close();
  expect(result).toEqual([]);
});

test("no rejected feedback for rule returns empty array", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";

  seedFinding(db, "FP0", ruleId, JSON.stringify({
    kind: "render-coupling",
    component: { name: "C", span: { start: 0, end: 0 }, fingerprint: "FP0" },
    fanIn: 5,
    fanOut: 1,
    directChildren: 1,
    reachableDepth: 1,
  }));
  // Only accept/confirm — not negative verdicts
  seedFeedback(db, "FP0", ruleId, "accept");
  seedFeedback(db, "FP0", ruleId, "confirm");

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  expect(result).toEqual([]);
});

// ── only reject/wontfix/dismiss counted, accept/confirm excluded ─────────────

test("only reject, wontfix, dismiss verdicts are counted; accept and confirm are excluded", () => {
  const { db } = makeTmpDb();
  const ruleId = "react/render-coupling";

  const fps = ["FP0", "FP1", "FP2", "FP3", "FP4"];
  const fanIns = [6, 7, 8, 9, 10];
  const verdicts = ["reject", "wontfix", "dismiss", "accept", "confirm"];

  for (let i = 0; i < fps.length; i++) {
    seedFinding(db, fps[i], ruleId, JSON.stringify({
      kind: "render-coupling",
      component: { name: `C${i}`, span: { start: 0, end: 0 }, fingerprint: fps[i] },
      fanIn: fanIns[i],
      fanOut: 1,
      directChildren: 1,
      reachableDepth: 1,
    }));
    seedFeedback(db, fps[i], ruleId, verdicts[i]);
  }

  const result = lookupRejectedEvidence(db, ruleId);
  db.close();

  // Only FP0 (reject/6), FP1 (wontfix/7), FP2 (dismiss/8) should be included
  expect(result.sort((a, b) => a - b)).toEqual([6, 7, 8]);
});
