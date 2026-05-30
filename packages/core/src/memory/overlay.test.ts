import { expect, test } from "vitest";
import { overlay } from "./overlay.js";
import type { Finding, Weight } from "../types.js";

const cfg = { suppressBelow: -0.3, amplifyAbove: 0.3, minConf: 0.4 };
function mk(): Finding {
  return {
    id: "1", ruleId: "r", type: "opportunity",
    fingerprint: { structural: "S", nominal: "", positional: "" },
    analysisVersion: 1, fpAlgoVersion: 1, producingRunId: "p", commitSha: "c", severityRaw: "warn",
    evidence: { kind: "shared-extraction", instances: [], cosine: 0, propOverlap: 0, hookOverlap: 0, variancePoints: [], sharedSurface: [] },
    createdAt: 0,
  };
}

test("no weight -> active at raw severity", () => {
  const p = overlay(mk(), null, cfg);
  expect(p.status).toBe("active");
  expect(p.severity).toBe("warn");
});

test("strong negative confident weight -> suppressed", () => {
  const w: Weight = { fingerprint: "S", ruleId: "r", value: -0.8, confidence: 0.9, eventCount: 3, lastEvent: 0 };
  expect(overlay(mk(), w, cfg).status).toBe("suppressed");
});

test("strong positive confident weight -> amplified", () => {
  const w: Weight = { fingerprint: "S", ruleId: "r", value: 0.8, confidence: 0.9, eventCount: 3, lastEvent: 0 };
  expect(overlay(mk(), w, cfg).status).toBe("amplified");
});

test("negative but LOW confidence -> still active (not enough evidence)", () => {
  const w: Weight = { fingerprint: "S", ruleId: "r", value: -0.8, confidence: 0.1, eventCount: 1, lastEvent: 0 };
  expect(overlay(mk(), w, cfg).status).toBe("active");
});

test("zero weight with confidence -> active (contested, not suppressed)", () => {
  const w: Weight = { fingerprint: "S", ruleId: "r", value: 0, confidence: 0.7, eventCount: 2, lastEvent: 0 };
  expect(overlay(mk(), w, cfg).status).toBe("active");
});

test("overlay does NOT mutate the finding row", () => {
  const f = mk();
  overlay(f, null, cfg);
  expect((f as any).status).toBeUndefined();
  expect((f as any).severity).toBeUndefined();
});

test("severityMap: error->warn clamps severity and does not mutate severityRaw", () => {
  const f = mk(); // severityRaw: "warn" — override to "error"
  (f as any).severityRaw = "error";
  const cfgWithMap = { ...cfg, severityMap: { error: "warn" as const } };
  const p = overlay(f, null, cfgWithMap);
  expect(p.severity).toBe("warn");
  expect(f.severityRaw).toBe("error"); // source finding unchanged
});

test("severityMap: no map -> identity (severity === severityRaw)", () => {
  const f = mk(); // severityRaw: "warn"
  const p = overlay(f, null, cfg); // cfg has no severityMap
  expect(p.severity).toBe("warn");
});
