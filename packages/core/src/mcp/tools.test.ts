import { expect, test } from "vitest";
import { createSession } from "./tools.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";
import type { Analyzer } from "../analyzers/analyzer.js";
import type { Finding } from "../types.js";

const A = `function LoginButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default LoginButton;`;
const B = `function SignupBtn({ label, onClick, size }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default SignupBtn;`;
const C = `function CtaButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default CtaButton;`;
const files = [{ file: "LoginButton.tsx", source: A }, { file: "SignupBtn.tsx", source: B }, { file: "CtaButton.tsx", source: C }];

function makeFinding(ruleId: string): Finding {
  return {
    id: `finding-${ruleId}`,
    ruleId,
    type: "opportunity",
    fingerprint: { structural: `${ruleId}-structural`, nominal: `${ruleId}-nominal`, positional: `${ruleId}-positional` },
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run1",
    commitSha: "c1",
    severityRaw: "warn",
    evidence: {
      kind: "shared-extraction",
      instances: [],
      cosine: 1,
      propOverlap: 1,
      hookOverlap: 1,
      variancePoints: [],
      sharedSurface: [],
    },
    createdAt: 0,
  };
}

function analyzer(ruleId: string, run: () => Finding[]): Analyzer {
  return { ruleId, framework: "react", analyze: run };
}

function registerAnalyzer(session: unknown, testAnalyzer: Analyzer): void {
  (session as { registry: { register(analyzer: Analyzer): void } }).registry.register(testAnalyzer);
}

test("analyze_repo returns counts + handles, not a finding dump", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const r = s.analyzeRepo({ files, asOf: 0 });
  expect(r.counts.byType.opportunity).toBe(1);
  expect(r.topFingerprints.length).toBe(1);
  expect((r as any).findings).toBeUndefined(); // handles, not bodies
});

test("analyze_repo returns diagnostic count and details for partial analyzer failure", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  registerAnalyzer(s, analyzer("test/failing", () => { throw new TypeError("boom"); }));

  const r = s.analyzeRepo({ files, asOf: 0 });

  expect(r.counts.diagnostics).toBe(1);
  expect(r.diagnostics).toEqual([
    { ruleId: "test/failing", kind: "analyzer-error", errorName: "TypeError", message: "boom" },
  ]);
});

test("analyze_repo diagnostics do not leak finding bodies, evidence, fingerprints, or feedback handles", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  registerAnalyzer(s, analyzer("test/failing", () => { throw new Error("boom"); }));

  const r = s.analyzeRepo({ files, asOf: 0 });
  const diagnostic = r.diagnostics[0]!;

  expect(Object.keys(diagnostic).sort()).toEqual(["errorName", "kind", "message", "ruleId"]);
  expect((diagnostic as any).finding).toBeUndefined();
  expect((diagnostic as any).findings).toBeUndefined();
  expect((diagnostic as any).evidence).toBeUndefined();
  expect((diagnostic as any).fingerprint).toBeUndefined();
  expect((diagnostic as any).feedbackHandle).toBeUndefined();
});

test("diagnostics are not close_session feedback targets or prompt items", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  registerAnalyzer(s, analyzer("test/failing", () => { throw new Error("boom"); }));
  registerAnalyzer(s, analyzer("test/success", () => [makeFinding("test/success")]));

  const analyze = s.analyzeRepo({ files, asOf: 0 });
  const close = s.closeSession({
    decisions: [{ fingerprint: "test/failing", ruleId: "test/failing", verdict: "reject" }],
    asOf: 1,
  });

  expect(analyze.diagnostics).toEqual([
    { ruleId: "test/failing", kind: "analyzer-error", errorName: "Error", message: "boom" },
  ]);
  expect(close.items.some((item) => item.ruleId === "test/failing")).toBe(false);
  expect(close.results).toEqual([{ fingerprint: "test/failing", ruleId: "test/failing", accepted: false, refusedReason: "unknown current finding" }]);
});

test("find_shared_opportunities separates opportunities from conflicts", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  s.analyzeRepo({ files, asOf: 0 });
  const r = s.findSharedOpportunities({});
  expect(r.opportunities.length).toBe(1);
  expect(r.conflicts.length).toBe(0);
});

test("explain_finding returns evidence + groundingFields, no prose", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;
  const e = s.explainFinding({ fingerprint: fp });
  expect(e.evidence.kind).toBe("shared-extraction");
  expect(e.groundingFields).toContain("sharedSurface");
  expect((e as any).explanation).toBeUndefined(); // no prose field
});

test("record_feedback (human reject) then re-analyze -> finding suppressed", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;
  const fb = s.recordFeedback({ fingerprint: fp, ruleId: "react/shared-extraction", verdict: "reject", source: "human", asOf: 0 });
  expect(fb.accepted).toBe(true);
  const a2 = s.analyzeRepo({ files, asOf: 0, analysisVersion: 2 });
  expect(a2.counts.suppressed).toBe(1);
});

test("record_feedback refuses a phantom fingerprint", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const r = s.recordFeedback({ fingerprint: "phantom", ruleId: "r", verdict: "reject", source: "human", asOf: 0 });
  expect(r.accepted).toBe(false);
});

test("explainFinding includes lastReason from most recent non-null feedback reason", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;
  s.recordFeedback({ fingerprint: fp, ruleId: "react/shared-extraction", verdict: "reject", source: "human", reason: "arch-reason", asOf: 1 });
  const e = s.explainFinding({ fingerprint: fp });
  expect(e.memory.lastReason).toBe("arch-reason");
});

test("explainFinding lastReason is null when no feedback with non-null reason exists", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;
  const e = s.explainFinding({ fingerprint: fp });
  expect(e.memory.lastReason).toBeNull();
});

test("closeSession without decisions returns current prompt items and writes no feedback", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;

  const r = s.closeSession({});

  expect(r.items).toEqual([
    expect.objectContaining({
      fingerprint: fp,
      ruleId: "react/shared-extraction",
      type: "opportunity",
      severity: "warn",
      status: "active",
    }),
  ]);
  expect(r.results).toEqual([]);
  expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession with summary but no decisions returns prompt context and writes no feedback", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;

  const r = s.closeSession({ summary: "Looks like we should reject this later." });

  expect(r.items.map((item) => item.fingerprint)).toEqual([fp]);
  expect(r.summary).toBe("Looks like we should reject this later.");
  expect(r.results).toEqual([]);
  expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession with explicit known decision records feedback", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;

  const r = s.closeSession({ decisions: [{ fingerprint: fp, ruleId: "react/shared-extraction", verdict: "reject", reason: "not reusable" }], asOf: 7 });

  expect(r.results).toEqual([{ fingerprint: fp, ruleId: "react/shared-extraction", accepted: true }]);
  const e = s.explainFinding({ fingerprint: fp });
  expect(e.memory.eventCount).toBe(1);
  expect(e.memory.lastReason).toBe("not reusable");
});

test("closeSession refuses unknown decision fingerprint and writes no feedback", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;

  const r = s.closeSession({ decisions: [{ fingerprint: "phantom", ruleId: "react/shared-extraction", verdict: "reject" }], asOf: 7 });

  expect(r.results).toEqual([{ fingerprint: "phantom", ruleId: "react/shared-extraction", accepted: false, refusedReason: "unknown current finding" }]);
  expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession refuses mismatched ruleId and writes no feedback", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;

  const r = s.closeSession({ decisions: [{ fingerprint: fp, ruleId: "wrong/rule", verdict: "reject" }], asOf: 7 });

  expect(r.results).toEqual([{ fingerprint: fp, ruleId: "wrong/rule", accepted: false, refusedReason: "unknown current finding" }]);
  expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession ignores ambiguous summary text without decisions", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const a = s.analyzeRepo({ files, asOf: 0 });
  const fp = a.topFingerprints[0]!;

  const r = s.closeSession({ summary: "We probably do not want this finding." });

  expect(r.results).toEqual([]);
  expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});
