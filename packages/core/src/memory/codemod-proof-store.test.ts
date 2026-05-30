import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { CodemodProofStore } from "./codemod-proof-store.js";

function setup() {
  const db = openDb(":memory:");
  return { db, store: new CodemodProofStore(db) };
}

const baseProof = {
  fingerprint: "fp-1",
  ruleId: "react/shared-extraction",
  analysisVersion: 2,
  patch: "patch",
  verificationOutput: JSON.stringify([{ stage: "typecheck", ok: true }]),
  rollbackPatch: "rollback",
  status: "applied" as const,
  commitSha: "a".repeat(40),
  createdAt: 42,
};

test("insert persists proof fields", () => {
  const { store } = setup();
  const id = store.insert(baseProof);

  const row = store.recent(5)[0]!;
  expect(row).toMatchObject({ id, ...baseProof });
});

test("proof rows are append-only", () => {
  const { store } = setup();
  store.insert(baseProof);
  store.insert({ ...baseProof, status: "rolled-back", commitSha: null, createdAt: 43 });

  const rows = store.recent(5);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.status)).toEqual(["rolled-back", "applied"]);
});

test("schema has no proof update/delete triggers or paths", () => {
  const { db } = setup();
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='codemod_proof'").all();
  expect(triggers).toEqual([]);
});
