import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { mayExecuteCodemod } from "./capability-gate.js";
import type { Finding, Span } from "../types.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";

const span: Span = { file: "Button.tsx", start: 0, end: 10, kind: "component", astPath: "module>fn[0]" };

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    ruleId: "react/shared-extraction",
    type: "opportunity",
    fingerprint: { structural: "fp-1", nominal: "nominal", positional: "positional" },
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run-1",
    commitSha: "abc",
    severityRaw: "warn",
    evidence: {
      kind: "shared-extraction",
      instances: [
        { name: "AButton", span, fingerprint: "fp-a", exportKind: "none" },
        { name: "BButton", span: { ...span, file: "B.tsx" }, fingerprint: "fp-b", exportKind: "none" },
        { name: "CButton", span: { ...span, file: "C.tsx" }, fingerprint: "fp-c", exportKind: "none" },
      ],
      cosine: 0.9,
      propOverlap: 0.7,
      hookOverlap: 1,
      variancePoints: ["variant"],
      sharedSurface: ["label"],
    },
    createdAt: 0,
    ...overrides,
  };
}

function stores() {
  const db = openDb(":memory:");
  const findings = new FindingsStore(db);
  const feedback = new FeedbackStore(db, findings);
  return { db, findings, feedback };
}

test("binds a current active opportunity finding", () => {
  const { findings, feedback } = stores();
  findings.insert(finding({ analysisVersion: 2 }));

  const result = mayExecuteCodemod("fp-1", {
    ruleId: "react/shared-extraction",
    analysisVersion: 2,
    findings,
    feedback,
    memoryConfig: DEFAULT_CONFIG.memory,
  });

  expect(result.status).toBe("bound");
  expect(result.finding.fingerprint.structural).toBe("fp-1");
});

test("refuses absent fingerprint", () => {
  const { findings, feedback } = stores();

  expect(mayExecuteCodemod("missing", {
    ruleId: "react/shared-extraction",
    analysisVersion: 1,
    findings,
    feedback,
    memoryConfig: DEFAULT_CONFIG.memory,
  })).toEqual({ status: "refused", reason: "no-such-finding" });
});

test("refuses stale current version", () => {
  const { findings, feedback } = stores();
  findings.insert(finding({ analysisVersion: 1 }));

  expect(mayExecuteCodemod("fp-1", {
    ruleId: "react/shared-extraction",
    analysisVersion: 2,
    findings,
    feedback,
    memoryConfig: DEFAULT_CONFIG.memory,
  })).toEqual({ status: "refused", reason: "stale-finding", currentAnalysisVersion: 2, findingAnalysisVersion: 1 });
});

test("refuses architectural conflict", () => {
  const { findings, feedback } = stores();
  findings.insert(finding({ type: "architectural-conflict" }));

  expect(mayExecuteCodemod("fp-1", {
    ruleId: "react/shared-extraction",
    analysisVersion: 1,
    findings,
    feedback,
    memoryConfig: DEFAULT_CONFIG.memory,
  })).toEqual({ status: "refused", reason: "conflict-non-opportunity" });
});

test("refuses suppressed finding", () => {
  const { findings, feedback } = stores();
  findings.insert(finding());
  feedback.record({ fingerprint: "fp-1", ruleId: "react/shared-extraction", verdict: "reject", source: "human", asOf: 1 });

  expect(mayExecuteCodemod("fp-1", {
    ruleId: "react/shared-extraction",
    analysisVersion: 1,
    findings,
    feedback,
    memoryConfig: DEFAULT_CONFIG.memory,
  })).toEqual({ status: "refused", reason: "suppressed-by-memory" });
});
