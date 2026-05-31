import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { analyzeRepo } from "./pipeline.js";
import { sharedExtraction } from "../analyzers/shared-extraction.js";
import { overAbstraction } from "../analyzers/over-abstraction.js";
import { AnalyzerRegistry, createDefaultAnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";
import type { Analyzer, AnalyzerResult } from "../analyzers/analyzer.js";
import type { Finding, AnalysisDiagnostic } from "../types.js";

// A1 — compile-time assertion: snapshot-skipped diagnostic is assignable to AnalysisDiagnostic
const _snapshotSkippedDiagnostic: AnalysisDiagnostic = { kind: "snapshot-skipped", message: "no git SHA available" };

const A = `function LoginButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default LoginButton;`;
const B = `function SignupBtn({ label, onClick, size }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default SignupBtn;`;
const C = `function CtaButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default CtaButton;`;

function setup() {
  const db = openDb(":memory:");
  const registry = new AnalyzerRegistry();
  registry.register(sharedExtraction);
  const findings = new FindingsStore(db);
  const feedback = new FeedbackStore(db, findings);
  return { db, registry, findings, feedback };
}
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

function analyzer(ruleId: string, run: () => AnalyzerResult): Analyzer {
  return { ruleId, framework: "react", analyze: run };
}

test("end-to-end: finds the shared-extraction opportunity", () => {
  const { registry, findings, feedback } = setup();
  const res = analyzeRepo({
    files, registry, findings, feedback, config: DEFAULT_CONFIG,
    runId: "run1", commitSha: "c1", asOf: 0,
  });
  expect(res.presented.length).toBe(1);
  expect(res.presented[0]!.type).toBe("opportunity");
  expect(res.presented[0]!.status).toBe("active");
});

test("persists findings append-only (re-run supersedes, keeps history)", () => {
  const { db, registry, findings, feedback } = setup();
  const run = (runId: string, av: number) => analyzeRepo({
    files, registry, findings, feedback, config: DEFAULT_CONFIG, runId, commitSha: "c", asOf: 0, analysisVersion: av,
  });
  run("run1", 1);
  run("run2", 2);
  const grouped = db.prepare("SELECT fingerprint, COUNT(*) n FROM finding GROUP BY fingerprint").all() as { fingerprint: string; n: number }[];
  expect(grouped.some((r) => r.n === 2)).toBe(true); // one opportunity, two versions
});

test("a recorded rejection suppresses the finding on the next run", () => {
  const { registry, findings, feedback } = setup();
  const first = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c", asOf: 0 });
  const fp = first.presented[0]!.fingerprint.structural;

  feedback.record({ fingerprint: fp, ruleId: "react/shared-extraction", verdict: "reject", source: "human", asOf: 0 });

  const second = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run2", commitSha: "c", asOf: 0, analysisVersion: 2 });
  expect(second.presented[0]!.status).toBe("suppressed");
});

test("deterministic: two identical runs produce equal presented findings (ignoring ids)", () => {
  const s1 = setup(); const r1 = analyzeRepo({ files, registry: s1.registry, findings: s1.findings, feedback: s1.feedback, config: DEFAULT_CONFIG, runId: "r", commitSha: "c", asOf: 0 });
  const s2 = setup(); const r2 = analyzeRepo({ files, registry: s2.registry, findings: s2.findings, feedback: s2.feedback, config: DEFAULT_CONFIG, runId: "r", commitSha: "c", asOf: 0 });
  const strip = (p: any) => ({ type: p.type, status: p.status, fp: p.fingerprint.structural, ev: p.evidence });
  expect(r1.presented.map(strip)).toEqual(r2.presented.map(strip));
});

test("contains a throwing analyzer and continues later analyzers in registry order", () => {
  const { findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  const calls: string[] = [];
  registry.register(analyzer("rule/a", () => { calls.push("A"); return []; }));
  registry.register(analyzer("rule/b", () => { calls.push("B"); throw new Error("boom"); }));
  registry.register(analyzer("rule/c", () => { calls.push("C"); return []; }));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(calls).toEqual(["A", "B", "C"]);
  expect(res.presented).toEqual([]);
  expect(res.diagnostics).toEqual([
    { ruleId: "rule/b", kind: "analyzer-error", errorName: "Error", message: "boom" },
  ]);
});

test("persists successful findings while failed analyzer writes zero T3 findings", () => {
  const { db, findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/failing", () => { throw new TypeError("boom"); }));
  registry.register(analyzer("rule/success", () => [makeFinding("rule/success")]));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 7 });

  expect(res.presented.map((finding) => finding.ruleId)).toEqual(["rule/success"]);
  const rows = db.prepare("SELECT rule_id, evidence_json FROM finding ORDER BY rule_id").all() as { rule_id: string; evidence_json: string }[];
  expect(rows.map((row) => row.rule_id)).toEqual(["rule/success"]);
  expect(rows.some((row) => row.evidence_json.includes("rule/failing"))).toBe(false);
});

test("executes default analyzers in registry order", () => {
  const registry = createDefaultAnalyzerRegistry();

  expect(registry.list().map((registered) => registered.ruleId)).toEqual([
    "react/shared-extraction",
    "react/render-coupling",
    "react/over-abstraction",
    "react/hook-topology",
    "react/boundary-violation",
  ]);
});

// ── D1: snapshot rows written after findings persist (happy path) ────────────
test("D1: pipeline writes snapshot rows after findings persist (2 findings → 2 rows, evidence_digest non-null)", () => {
  const { db, findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/a", () => [makeFinding("rule/a")]));
  registry.register(analyzer("rule/b", () => [makeFinding("rule/b")]));

  analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "abc123", asOf: 42 });

  const count = (db.prepare("SELECT COUNT(*) as n FROM snapshot WHERE commit_sha='abc123'").get() as { n: number }).n;
  expect(count).toBe(2);
  const rows = db.prepare("SELECT evidence_digest FROM snapshot WHERE commit_sha='abc123'").all() as { evidence_digest: string }[];
  expect(rows.every((r) => r.evidence_digest !== null && r.evidence_digest.length > 0)).toBe(true);
});

// ── D2: snapshot skipped when commitSha is empty ─────────────────────────────
test("D2: pipeline emits snapshot-skipped diagnostic when commitSha is empty, findings still returned", () => {
  const { db, findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/a", () => [makeFinding("rule/a")]));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "", asOf: 0 });

  const skipped = res.diagnostics.filter((d) => d.kind === "snapshot-skipped");
  expect(skipped).toHaveLength(1);
  expect(res.presented.length).toBeGreaterThan(0);
  const count = (db.prepare("SELECT COUNT(*) as n FROM snapshot").get() as { n: number }).n;
  expect(count).toBe(0);
});

// ── D3: snapshot failure does NOT roll back persisted findings ────────────────
test("D3: snapshot failure does not roll back findings — analyzeRepo returns normally", () => {
  const db = openDb(":memory:");
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/a", () => [makeFinding("rule/a")]));
  const findings = new FindingsStore(db);
  const feedback = new FeedbackStore(db, findings);

  // Corrupt the db handle exposed via (findings as any).db to force snapshot insert to throw.
  const realDb = (findings as any).db;
  let snapshotCallCount = 0;
  const proxyDb = new Proxy(realDb, {
    get(target, prop) {
      const val = target[prop];
      if (prop === "prepare" && typeof val === "function") {
        return (sql: string) => {
          if (typeof sql === "string" && sql.includes("snapshot")) {
            snapshotCallCount++;
            throw new Error("simulated snapshot db failure");
          }
          return val.call(target, sql);
        };
      }
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
  (findings as any).db = proxyDb;

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "abc123", asOf: 0 });

  // analyzeRepo must not throw
  expect(res.presented.length).toBeGreaterThan(0);
  // finding rows intact (use real db, not proxy)
  const findingCount = (realDb.prepare("SELECT COUNT(*) as n FROM finding").get() as { n: number }).n;
  expect(findingCount).toBeGreaterThan(0);
  // a snapshot-skipped diagnostic emitted
  const skipped = res.diagnostics.filter((d) => d.kind === "snapshot-skipped");
  expect(skipped.length).toBeGreaterThanOrEqual(1);
});

// ── D4: idempotent re-analysis (row count stable across two runs) ─────────────
test("D4: snapshot row count is stable across two runs with the same commitSha", () => {
  const { db, findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  // Use empty id so FindingsStore generates a unique ulid per run (append-only by design)
  registry.register(analyzer("rule/a", () => [{ ...makeFinding("rule/a"), id: "" }]));

  analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "abc123", asOf: 0 });
  const countAfterFirst = (db.prepare("SELECT COUNT(*) as n FROM snapshot WHERE commit_sha='abc123'").get() as { n: number }).n;

  analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run2", commitSha: "abc123", asOf: 0, analysisVersion: 2 });
  const countAfterSecond = (db.prepare("SELECT COUNT(*) as n FROM snapshot WHERE commit_sha='abc123'").get() as { n: number }).n;

  expect(countAfterFirst).toBeGreaterThan(0);
  expect(countAfterSecond).toBe(countAfterFirst);
});

// ── D5: deterministic replay (created_at == asOf, rows byte-for-byte identical) ─
test("D5: snapshot rows are byte-for-byte identical on two runs with same inputs and asOf=42", () => {
  const runOnce = () => {
    const db = openDb(":memory:");
    const registry = new AnalyzerRegistry();
    registry.register(analyzer("rule/a", () => [makeFinding("rule/a")]));
    const findings = new FindingsStore(db);
    const feedback = new FeedbackStore(db, findings);
    analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "abc123", asOf: 42 });
    return db.prepare("SELECT * FROM snapshot WHERE commit_sha='abc123' ORDER BY fingerprint, rule_id").all() as Record<string, unknown>[];
  };

  const rows1 = runOnce();
  const rows2 = runOnce();

  expect(rows1.length).toBeGreaterThan(0);
  expect(rows1.length).toBe(rows2.length);
  for (let i = 0; i < rows1.length; i++) {
    expect(rows1[i]!["created_at"]).toBe(42);
    expect(rows1[i]!["evidence_digest"]).toBe(rows2[i]!["evidence_digest"]);
    expect(rows1[i]!["fingerprint"]).toBe(rows2[i]!["fingerprint"]);
    expect(rows1[i]!["created_at"]).toBe(rows2[i]!["created_at"]);
  }
});

test("C3 isolation lets later new analyzer findings survive failed earlier analyzer", () => {
  const { findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/failing", () => { throw new TypeError("boom"); }));
  registry.register(overAbstraction);
  const files = [{
    file: "DenseCard.tsx",
    source: "export function DenseCard({ a, b, c }) { return <section>{a}{b}{c}</section>; }",
  }];
  const config = { ...DEFAULT_CONFIG, overAbstraction: { ...DEFAULT_CONFIG.overAbstraction, maxProps: 2 } };

  const res = analyzeRepo({ files, registry, findings, feedback, config, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(res.diagnostics).toEqual([
    { ruleId: "rule/failing", kind: "analyzer-error", errorName: "TypeError", message: "boom" },
  ]);
  expect(res.presented.map((finding) => finding.ruleId)).toEqual(["react/over-abstraction"]);
  expect(res.presented[0]!.evidence).toMatchObject({ kind: "over-abstraction", propCount: 3 });
});

test("lazy Pass-2 is not initialized when analyzers do not call typeOf", () => {
  const { findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  let called = false;
  registry.register({
    ruleId: "rule/no-type",
    framework: "react",
    analyze: () => [],
  });

  analyzeRepo({
    files,
    registry,
    findings,
    feedback,
    config: DEFAULT_CONFIG,
    runId: "run1",
    commitSha: "c1",
    asOf: 0,
    typeResolverHooks: { onProjectCreate: () => { called = true; } },
  });

  expect(called).toBe(false);
});

test("lazy Pass-2 returns a non-null type when an analyzer calls typeOf", () => {
  const { findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  let observed: unknown = null;
  registry.register({
    ruleId: "rule/type-aware",
    framework: "react",
    analyze: (ctx) => {
      observed = ctx.types.typeOf(ctx.graph.components[0]!.span);
      return [];
    },
  });
  const typedFiles = [{
    file: "Profile.tsx",
    source: "type Props = { name: string }; export function Profile({ name }: Props) { return <div>{name}</div>; }",
  }];

  analyzeRepo({ files: typedFiles, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(observed).toEqual({ text: "{ name: string }", symbolName: "Profile" });
});

test("returns deterministic analyzer diagnostics without finding or volatile fields", () => {
  const { findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("shared-extraction", () => { throw new TypeError("boom"); }));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(res.diagnostics).toEqual([
    { ruleId: "shared-extraction", kind: "analyzer-error", errorName: "TypeError", message: "boom" },
  ]);
  expect(Object.keys(res.diagnostics[0]!).sort()).toEqual(["errorName", "kind", "message", "ruleId"]);
  expect((res.diagnostics[0] as any).stack).toBeUndefined();
  expect((res.diagnostics[0] as any).evidence).toBeUndefined();
  expect((res.diagnostics[0] as any).body).toBeUndefined();
  expect((res.diagnostics[0] as any).fingerprint).toBeUndefined();
});

test("normalizes analyzer outputs from legacy arrays and diagnostic-aware results", () => {
  const { db, findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/legacy", () => [makeFinding("rule/legacy")]));
  registry.register(analyzer("rule/diagnostic-aware", () => ({
    findings: [makeFinding("rule/diagnostic-aware")],
    diagnostics: [{ kind: "variant-mismatch", adapterId: "adapter", analyzerId: "rule/diagnostic-aware", detectedVariant: "alpha", supportedVariants: ["beta"], rootDir: "/repo", message: "unsupported variant" }],
  })));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(res.presented.map((finding) => finding.ruleId)).toEqual(["rule/diagnostic-aware", "rule/legacy"]);
  expect(res.diagnostics).toEqual([
    { kind: "variant-mismatch", adapterId: "adapter", analyzerId: "rule/diagnostic-aware", detectedVariant: "alpha", supportedVariants: ["beta"], rootDir: "/repo", message: "unsupported variant" },
  ]);
  const rows = db.prepare("SELECT rule_id FROM finding ORDER BY rule_id").all() as { rule_id: string }[];
  expect(rows.map((row) => row.rule_id)).toEqual(["rule/diagnostic-aware", "rule/legacy"]);
});

test("keeps analyzer diagnostics out of findings, feedback targets, and snapshot rows", () => {
  const { db, findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/diagnostic-only", () => ({
    findings: [],
    diagnostics: [{ kind: "variant-mismatch", adapterId: "adapter", analyzerId: "rule/diagnostic-only", detectedVariant: "alpha", supportedVariants: ["beta"], rootDir: "/repo", message: "unsupported variant" }],
  })));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(res.presented).toEqual([]);
  expect(res.diagnostics).toHaveLength(1);
  const findingCount = (db.prepare("SELECT COUNT(*) as n FROM finding").get() as { n: number }).n;
  const snapshotCount = (db.prepare("SELECT COUNT(*) as n FROM snapshot").get() as { n: number }).n;
  const feedbackCount = (db.prepare("SELECT COUNT(*) as n FROM feedback_event").get() as { n: number }).n;
  expect({ findingCount, snapshotCount, feedbackCount }).toEqual({ findingCount: 0, snapshotCount: 0, feedbackCount: 0 });
});

test("isolates thrown analyzer diagnostics while preserving later diagnostic-aware findings", () => {
  const { findings, feedback } = setup();
  const registry = new AnalyzerRegistry();
  registry.register(analyzer("rule/failing", () => { throw new TypeError("boom"); }));
  registry.register(analyzer("rule/success", () => ({
    findings: [makeFinding("rule/success")],
    diagnostics: [{ kind: "variant-mismatch", adapterId: "adapter", analyzerId: "rule/success", detectedVariant: "alpha", supportedVariants: ["beta"], rootDir: "/repo", message: "unsupported variant" }],
  })));

  const res = analyzeRepo({ files, registry, findings, feedback, config: DEFAULT_CONFIG, runId: "run1", commitSha: "c1", asOf: 0 });

  expect(res.presented.map((finding) => finding.ruleId)).toEqual(["rule/success"]);
  expect(res.diagnostics).toEqual([
    { ruleId: "rule/failing", kind: "analyzer-error", errorName: "TypeError", message: "boom" },
    { kind: "variant-mismatch", adapterId: "adapter", analyzerId: "rule/success", detectedVariant: "alpha", supportedVariants: ["beta"], rootDir: "/repo", message: "unsupported variant" },
  ]);
});
