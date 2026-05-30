import { expect, test } from "vitest";
import { openDb } from "../db/db.js";
import { analyzeRepo } from "./pipeline.js";
import { sharedExtraction } from "../analyzers/shared-extraction.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";

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
