import { expect, test } from "vitest";
import { createSession } from "./tools.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";

const A = `function LoginButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default LoginButton;`;
const B = `function SignupBtn({ label, onClick, size }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default SignupBtn;`;
const C = `function CtaButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default CtaButton;`;
const files = [{ file: "LoginButton.tsx", source: A }, { file: "SignupBtn.tsx", source: B }, { file: "CtaButton.tsx", source: C }];

test("analyze_repo returns counts + handles, not a finding dump", () => {
  const s = createSession({ config: DEFAULT_CONFIG });
  const r = s.analyzeRepo({ files, asOf: 0 });
  expect(r.counts.byType.opportunity).toBe(1);
  expect(r.topFingerprints.length).toBe(1);
  expect((r as any).findings).toBeUndefined(); // handles, not bodies
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
