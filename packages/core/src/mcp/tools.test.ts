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

const graphFiles = [
  { file: "Leaf.tsx", source: "export function Leaf() { return <span />; }" },
  { file: "Card.tsx", source: "export function Card() { return <Leaf />; }" },
  { file: "Sidebar.tsx", source: "export function Sidebar() { return <Leaf />; }" },
  { file: "Page.tsx", source: "export function Page() { return <main><Card /><Sidebar /></main>; }" },
];

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
  expect((r as any).graph).toBeUndefined(); // graph stays internal to query_architecture
});

// ─── queryArchitecture tests ────────────────────────────────────────────────

test("queryArchitecture refuses unknown questions with the valid enum", () => {
  const s = createSession({ config: DEFAULT_CONFIG });

  const r = s.queryArchitecture({ question: "hook-consumers", target: "Leaf" });

  expect(r).toEqual({
    status: "unknown_question",
    question: "hook-consumers",
    validQuestions: ["renders", "rendered-by", "fan-in", "fan-out", "reachability"],
  });
});

test("queryArchitecture requires a prior analysis", () => {
  const s = createSession({ config: DEFAULT_CONFIG });

  const r = s.queryArchitecture({ question: "renders", target: "Page" });

  expect(r.status).toBe("no_analysis");
});

test("queryArchitecture answers renders and rendered-by from the last graph", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  s.analyzeRepo({ files: graphFiles, asOf: 0 });

  const renders = s.queryArchitecture({ question: "renders", target: "Page" });
  const renderedBy = s.queryArchitecture({ question: "rendered-by", target: "Leaf" });

  expect(renders.status).toBe("ok");
  expect((renders as any).answer.children.map((n: { name: string }) => n.name)).toEqual(["Card", "Sidebar"]);
  expect((renders as any).edges).toHaveLength(2);
  expect(renderedBy.status).toBe("ok");
  expect((renderedBy as any).answer.parents.map((n: { name: string }) => n.name)).toEqual(["Card", "Sidebar"]);
});

test("queryArchitecture answers fan-in for a shared rendered component", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  s.analyzeRepo({ files: graphFiles, asOf: 0 });

  const r = s.queryArchitecture({ question: "fan-in", target: "Leaf" });

  expect(r.status).toBe("ok");
  expect((r as any).answer.count).toBe(2);
});

test("queryArchitecture reachability respects the requested depth bound", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  s.analyzeRepo({ files: graphFiles, asOf: 0 });

  const depthOne = s.queryArchitecture({ question: "reachability", target: "Page", depth: 1 });
  const depthTwo = s.queryArchitecture({ question: "reachability", target: "Page", depth: 2 });

  expect(depthOne.status).toBe("ok");
  expect((depthOne as any).answer.reachable.map((n: { name: string }) => n.name)).toEqual(["Card", "Sidebar"]);
  expect(depthTwo.status).toBe("ok");
  expect((depthTwo as any).answer.reachable.map((n: { name: string }) => n.name)).toEqual(["Card", "Leaf", "Sidebar"]);
});

test("queryArchitecture refuses unknown targets", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  s.analyzeRepo({ files: graphFiles, asOf: 0 });

  const r = s.queryArchitecture({ question: "renders", target: "Missing" });

  expect(r).toEqual({ status: "unknown_target", target: "Missing" });
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

// ─── getDrift tests ────────────────────────────────────────────────────────

function seedSnapshot(session: ReturnType<typeof createSession>, rows: Array<{
  commit_sha: string; fingerprint: string; rule_id: string;
  severity_raw?: string; evidence_digest: string; created_at?: number;
}>) {
  const db = (session as any).db;
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO snapshot (commit_sha, fingerprint, rule_id, severity_raw, evidence_digest, created_at) VALUES (?,?,?,?,?,?)"
  );
  for (const r of rows) {
    stmt.run(r.commit_sha, r.fingerprint, r.rule_id, r.severity_raw ?? "warn", r.evidence_digest, r.created_at ?? Date.now());
  }
}

function countRows(session: ReturnType<typeof createSession>, table: string): number {
  const db = (session as any).db;
  return (db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number }).cnt;
}

test("getDrift does not trigger analysis (zero writes)", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  // no seeded rows — both commits absent
  s.getDrift({ baseCommit: "abc", headCommit: "def" });
  expect(countRows(s, "snapshot")).toBe(0);
  expect(countRows(s, "finding")).toBe(0);
  expect(countRows(s, "feedback_event")).toBe(0);
});

test("getDrift: added finding detected", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "base1", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "base1", fingerprint: "fpB", rule_id: "react/rc", evidence_digest: "d2" },
    { commit_sha: "head1", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "head1", fingerprint: "fpB", rule_id: "react/rc", evidence_digest: "d2" },
    { commit_sha: "head1", fingerprint: "fpC", rule_id: "react/rc", evidence_digest: "d3" },
  ]);
  const r = s.getDrift({ baseCommit: "base1", headCommit: "head1" });
  expect(r.status).toBe("ok");
  const added = (r as any).added as Array<{ fingerprint: string }>;
  expect(added.map((x) => x.fingerprint)).toContain("fpC");
  expect((r as any).removed).toHaveLength(0);
});

test("getDrift: removed finding detected", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "base2", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "base2", fingerprint: "fpB", rule_id: "react/rc", evidence_digest: "d2" },
    { commit_sha: "head2", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
  ]);
  const r = s.getDrift({ baseCommit: "base2", headCommit: "head2" });
  expect(r.status).toBe("ok");
  const removed = (r as any).removed as Array<{ fingerprint: string }>;
  expect(removed.map((x) => x.fingerprint)).toContain("fpB");
  expect((r as any).added).toHaveLength(0);
});

test("getDrift: differing evidence_digest → persisted 'changed'", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "base3", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "digest-v1" },
    { commit_sha: "head3", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "digest-v2" },
  ]);
  const r = s.getDrift({ baseCommit: "base3", headCommit: "head3" });
  expect(r.status).toBe("ok");
  const persisted = (r as any).persisted as Array<{ fingerprint: string; stability: string }>;
  const entry = persisted.find((p) => p.fingerprint === "fpA");
  expect(entry?.stability).toBe("changed");
});

test("getDrift: identical evidence_digest → persisted 'stable'", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "base4", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "same-digest" },
    { commit_sha: "head4", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "same-digest" },
  ]);
  const r = s.getDrift({ baseCommit: "base4", headCommit: "head4" });
  expect(r.status).toBe("ok");
  const persisted = (r as any).persisted as Array<{ fingerprint: string; stability: string }>;
  const entry = persisted.find((p) => p.fingerprint === "fpA");
  expect(entry?.stability).toBe("stable");
});

test("getDrift: ruleId filter narrows results", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "base5", fingerprint: "fpA", rule_id: "react/render-coupling", evidence_digest: "d1" },
    { commit_sha: "base5", fingerprint: "fpB", rule_id: "react/over-abstraction", evidence_digest: "d2" },
    { commit_sha: "head5", fingerprint: "fpA", rule_id: "react/render-coupling", evidence_digest: "d1" },
    { commit_sha: "head5", fingerprint: "fpB", rule_id: "react/over-abstraction", evidence_digest: "d2" },
    { commit_sha: "head5", fingerprint: "fpC", rule_id: "react/render-coupling", evidence_digest: "d3" },
  ]);
  const r = s.getDrift({ baseCommit: "base5", headCommit: "head5", ruleId: "react/render-coupling" });
  expect(r.status).toBe("ok");
  const added = (r as any).added as Array<{ fingerprint: string; rule_id: string }>;
  const persisted = (r as any).persisted as Array<{ fingerprint: string; rule_id: string }>;
  const removed = (r as any).removed as Array<{ fingerprint: string; rule_id: string }>;
  const allEntries = [...added, ...persisted, ...removed];
  expect(allEntries.every((e) => e.rule_id === "react/render-coupling")).toBe(true);
  expect(allEntries.some((e) => e.rule_id === "react/over-abstraction")).toBe(false);
});

test("getDrift: unknown base commit → status unknown_commit with base SHA", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "known-head", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "known-base", fingerprint: "fpX", rule_id: "react/rc", evidence_digest: "dx" },
  ]);
  const r = s.getDrift({ baseCommit: "unknown-sha", headCommit: "known-head" });
  expect(r.status).toBe("unknown_commit");
  expect((r as any).commit).toBe("unknown-sha");
  // no writes
  expect(countRows(s, "finding")).toBe(0);
});

test("getDrift: unknown head commit → status unknown_commit with head SHA", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "known-base2", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "also-known", fingerprint: "fpB", rule_id: "react/rc", evidence_digest: "d2" },
  ]);
  const r = s.getDrift({ baseCommit: "known-base2", headCommit: "unknown-head" });
  expect(r.status).toBe("unknown_commit");
  expect((r as any).commit).toBe("unknown-head");
});

test("getDrift: only one distinct commit analyzed → insufficient_history", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "only-sha", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
  ]);
  const r = s.getDrift({ baseCommit: "only-sha", headCommit: "only-sha" });
  expect(r.status).toBe("insufficient_history");
  expect((r as any).snapshotCount).toBe(1);
  expect((r as any).requiredSnapshots).toBe(2);
  expect((r as any).added).toEqual([]);
  expect((r as any).removed).toEqual([]);
});

test("getDrift: unknown state is never silent-clean (no ok with empty arrays)", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  // fewer than 2 distinct commits
  seedSnapshot(s, [
    { commit_sha: "single-commit", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
  ]);
  const r = s.getDrift({ baseCommit: "single-commit", headCommit: "single-commit" });
  // must NOT be status "ok"
  expect(r.status).not.toBe("ok");
  // must be one of the named error statuses
  expect(["unknown_commit", "insufficient_history"]).toContain(r.status);
});

// ─── CRITICAL-1: presence checks must fire before insufficient_history ────────

test("getDrift: absent base with 1 snapshot row → unknown_commit(base), not insufficient_history", () => {
  // Spec scenario 8: "Unknown base commit is refused" — regardless of snapshot count
  const s = createSession({ config: DEFAULT_CONFIG });
  // Only 1 distinct commit in DB — cnt < 2 would fire first under the buggy order
  seedSnapshot(s, [
    { commit_sha: "known-sha", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
  ]);
  const r = s.getDrift({ baseCommit: "absent-sha", headCommit: "known-sha" });
  expect(r.status).toBe("unknown_commit");
  expect((r as any).commit).toBe("absent-sha");
});

test("getDrift: absent head with 1 snapshot row → unknown_commit(head), not insufficient_history", () => {
  // Symmetric case: head absent, base present, cnt = 1
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "known-sha", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
  ]);
  const r = s.getDrift({ baseCommit: "known-sha", headCommit: "absent-sha" });
  expect(r.status).toBe("unknown_commit");
  expect((r as any).commit).toBe("absent-sha");
});

// ─── WARNING-1: happy-path ok result must write nothing ───────────────────────

test("getDrift: ok-status result writes nothing to finding, snapshot, or feedback_event", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  seedSnapshot(s, [
    { commit_sha: "commit-a", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "commit-a", fingerprint: "fpB", rule_id: "react/rc", evidence_digest: "d2" },
    { commit_sha: "commit-b", fingerprint: "fpA", rule_id: "react/rc", evidence_digest: "d1" },
    { commit_sha: "commit-b", fingerprint: "fpC", rule_id: "react/rc", evidence_digest: "d3" },
  ]);
  const beforeSnapshot = countRows(s, "snapshot");
  const beforeFinding = countRows(s, "finding");
  const beforeFeedback = countRows(s, "feedback_event");

  const r = s.getDrift({ baseCommit: "commit-a", headCommit: "commit-b" });

  expect(r.status).toBe("ok");
  expect(countRows(s, "snapshot")).toBe(beforeSnapshot);
  expect(countRows(s, "finding")).toBe(beforeFinding);
  expect(countRows(s, "feedback_event")).toBe(beforeFeedback);
});
