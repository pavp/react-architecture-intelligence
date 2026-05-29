import { expect, test } from "vitest";
import type { Span, Fingerprint, Finding, Severity, FindingType } from "./types.js";
import { isFinding } from "./types.js";

test("isFinding accepts a well-formed finding", () => {
  const fp: Fingerprint = { structural: "s", nominal: "n", positional: "p" };
  const f: Finding = {
    id: "01J",
    ruleId: "react/shared-extraction",
    type: "opportunity" satisfies FindingType,
    fingerprint: fp,
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run1",
    commitSha: "abc",
    severityRaw: "warn" satisfies Severity,
    evidence: { kind: "shared-extraction", instances: [], cosine: 0, propOverlap: 0, hookOverlap: 0, variancePoints: [], sharedSurface: [] },
    createdAt: 0,
  };
  expect(isFinding(f)).toBe(true);
});

test("isFinding rejects a non-finding", () => {
  expect(isFinding({ id: "x" })).toBe(false);
  expect(isFinding(null)).toBe(false);
});
