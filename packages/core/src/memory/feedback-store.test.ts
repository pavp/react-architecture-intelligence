import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { FindingsStore } from "./findings-store.js";
import { FeedbackStore } from "./feedback-store.js";
import type { Finding } from "../types.js";

function seed(store: FindingsStore, producingRunId = "prod-run") {
  const f: Finding = {
    id: "", ruleId: "react/shared-extraction", type: "opportunity",
    fingerprint: { structural: "S", nominal: "N", positional: "P" },
    analysisVersion: 1, fpAlgoVersion: 1, producingRunId, commitSha: "c", severityRaw: "warn",
    evidence: { kind: "shared-extraction", instances: [], cosine: 0, propOverlap: 0, hookOverlap: 0, variancePoints: [], sharedSurface: [] },
    createdAt: 0,
  };
  store.insert(f);
}

test("human feedback on a real fingerprint is accepted", () => {
  const db = openDb(":memory:");
  const findings = new FindingsStore(db);
  seed(findings);
  const fb = new FeedbackStore(db, findings);
  const r = fb.record({ fingerprint: "S", ruleId: "react/shared-extraction", verdict: "reject", source: "human" });
  expect(r.accepted).toBe(true);
});

test("phantom fingerprint is REFUSED", () => {
  const db = openDb(":memory:");
  const fb = new FeedbackStore(db, new FindingsStore(db));
  const r = fb.record({ fingerprint: "NOPE", ruleId: "r", verdict: "reject", source: "human" });
  expect(r.accepted).toBe(false);
  expect(r.refusedReason).toMatch(/phantom/i);
});

test("agent self-loop is REFUSED (same run that produced the finding)", () => {
  const db = openDb(":memory:");
  const findings = new FindingsStore(db);
  seed(findings, "run-42");
  const fb = new FeedbackStore(db, findings);
  const r = fb.record({
    fingerprint: "S", ruleId: "react/shared-extraction", verdict: "accept",
    source: "agent", originRunId: "run-42",
  });
  expect(r.accepted).toBe(false);
  expect(r.refusedReason).toMatch(/self-loop/i);
});

test("agent feedback from a DIFFERENT run is accepted", () => {
  const db = openDb(":memory:");
  const findings = new FindingsStore(db);
  seed(findings, "run-42");
  const fb = new FeedbackStore(db, findings);
  const r = fb.record({
    fingerprint: "S", ruleId: "react/shared-extraction", verdict: "accept",
    source: "agent", originRunId: "run-99",
  });
  expect(r.accepted).toBe(true);
});

test("recorded events are readable for the reducer", () => {
  const db = openDb(":memory:");
  const findings = new FindingsStore(db);
  seed(findings);
  const fb = new FeedbackStore(db, findings);
  fb.record({ fingerprint: "S", ruleId: "react/shared-extraction", verdict: "reject", source: "human" });
  expect(fb.eventsFor("S", "react/shared-extraction").length).toBe(1);
});
