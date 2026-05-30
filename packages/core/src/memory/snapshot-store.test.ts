import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { SnapshotStore, digestEvidence } from "./snapshot-store.js";

function setup() {
  const db = openDb(":memory:");
  return { db, store: new SnapshotStore(db) };
}

const baseRow = {
  commitSha: "abc123",
  fingerprint: "fp-structural",
  ruleId: "react/shared-extraction",
  severityRaw: "warn" as const,
  evidence: { kind: "shared-extraction", instances: [], cosine: 1, propOverlap: 1, hookOverlap: 1, variancePoints: [], sharedSurface: [] },
  createdAt: 42,
};

test("insert writes one row with correct fields (created_at == asOf)", () => {
  const { db, store } = setup();
  store.insert(baseRow);
  const row = db.prepare("SELECT * FROM snapshot WHERE commit_sha=?").get("abc123") as Record<string, unknown> | undefined;
  expect(row).toBeDefined();
  expect(row!["commit_sha"]).toBe("abc123");
  expect(row!["fingerprint"]).toBe("fp-structural");
  expect(row!["rule_id"]).toBe("react/shared-extraction");
  expect(row!["severity_raw"]).toBe("warn");
  expect(row!["evidence_digest"]).not.toBeNull();
  expect(typeof row!["evidence_digest"]).toBe("string");
  expect((row!["evidence_digest"] as string).length).toBeGreaterThan(0);
  expect(row!["created_at"]).toBe(42);
});

test("insert is idempotent — calling twice with same PK does not throw and does not add a second row", () => {
  const { db, store } = setup();
  store.insert(baseRow);
  store.insert(baseRow); // second call — must not throw
  const count = (db.prepare("SELECT COUNT(*) as n FROM snapshot WHERE commit_sha=?").get("abc123") as { n: number }).n;
  expect(count).toBe(1);
});

test("two distinct findings produce exactly 2 rows", () => {
  const { db, store } = setup();
  store.insert({ ...baseRow, fingerprint: "fp-1", ruleId: "rule/a" });
  store.insert({ ...baseRow, fingerprint: "fp-2", ruleId: "rule/b" });
  const count = (db.prepare("SELECT COUNT(*) as n FROM snapshot WHERE commit_sha=?").get("abc123") as { n: number }).n;
  expect(count).toBe(2);
});

test("same call twice produces identical evidence_digest (determinism)", () => {
  const { db: db1, store: store1 } = setup();
  store1.insert(baseRow);
  const row1 = db1.prepare("SELECT evidence_digest FROM snapshot WHERE commit_sha=?").get("abc123") as { evidence_digest: string };

  const { db: db2, store: store2 } = setup();
  store2.insert(baseRow);
  const row2 = db2.prepare("SELECT evidence_digest FROM snapshot WHERE commit_sha=?").get("abc123") as { evidence_digest: string };

  expect(row1.evidence_digest).toBe(row2.evidence_digest);
});

test("digestEvidence is a non-empty hex string independent of object key order", () => {
  const ev1 = { b: 2, a: 1 };
  const ev2 = { a: 1, b: 2 };
  const d1 = digestEvidence(ev1);
  const d2 = digestEvidence(ev2);
  expect(d1).toMatch(/^[0-9a-f]{64}$/);
  expect(d1).toBe(d2);
});
