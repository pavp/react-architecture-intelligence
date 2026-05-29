import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { FindingsStore } from "./findings-store.js";
import type { Finding } from "../types.js";

function mk(over: Partial<Finding>): Finding {
  return {
    id: "", ruleId: "react/shared-extraction", type: "opportunity",
    fingerprint: { structural: "S", nominal: "N", positional: "P" },
    analysisVersion: 1, fpAlgoVersion: 1, producingRunId: "run", commitSha: "c",
    severityRaw: "warn",
    evidence: { kind: "shared-extraction", instances: [], cosine: 0, propOverlap: 0, hookOverlap: 0, variancePoints: [], sharedSurface: [] },
    createdAt: Date.now(), ...over,
  };
}

test("insert assigns an id and persists", () => {
  const store = new FindingsStore(openDb(":memory:"));
  const id = store.insert(mk({}));
  expect(id).toBeTruthy();
  expect(store.currentVersion("S", "react/shared-extraction")?.id).toBe(id);
});

test("supersede keeps old version (append-only) and returns the latest", () => {
  const store = new FindingsStore(openDb(":memory:"));
  store.insert(mk({ analysisVersion: 1 }));
  store.insert(mk({ analysisVersion: 2 }));
  expect(store.currentVersion("S", "react/shared-extraction")?.analysisVersion).toBe(2);
  expect(store.allVersions("S", "react/shared-extraction").length).toBe(2); // nothing deleted
});

test("anyHistoricalVersion finds a superseded finding by fingerprint", () => {
  const store = new FindingsStore(openDb(":memory:"));
  store.insert(mk({ analysisVersion: 1 }));
  store.insert(mk({ analysisVersion: 2 }));
  expect(store.anyHistoricalVersion("S")).toBe(true);
  expect(store.anyHistoricalVersion("does-not-exist")).toBe(false);
});
