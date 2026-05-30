import { expect, test } from "vitest";
import type {
  Fingerprint,
  Finding,
  FindingType,
  HookTopologyEvidence,
  OverAbstractionEvidence,
  RenderCouplingEvidence,
  Severity,
  Span,
} from "./types.js";
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

test("finding evidence accepts metric-only render-coupling, over-abstraction, and hook-topology variants", () => {
  const span: Span = { file: "Card.tsx", start: 0, end: 10, kind: "component", astPath: "module>fn[0]" };
  const renderEvidence: RenderCouplingEvidence = {
    kind: "render-coupling",
    component: { name: "Card", span, fingerprint: "fp-card" },
    fanIn: 2,
    fanOut: 4,
    directChildren: 3,
    reachableDepth: 2,
  };
  const abstractionEvidence: OverAbstractionEvidence = {
    kind: "over-abstraction",
    component: { name: "Card", span, fingerprint: "fp-card" },
    propCount: 7,
    hookCount: 4,
    childCount: 5,
    compositionMarkerCount: 2,
    conditionalBranchCount: 3,
  };
  const hookEvidence: HookTopologyEvidence = {
    kind: "hook-topology",
    hook: { name: "useCheckout", span, fingerprint: "fp-hook" },
    fanIn: 2,
    fanOut: 3,
    directDependencies: 3,
    reachableDepth: 2,
  };

  const fp: Fingerprint = { structural: "s", nominal: "n", positional: "p" };
  const renderFinding: Finding = {
    id: "01R",
    ruleId: "react/render-coupling",
    type: "opportunity",
    fingerprint: fp,
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run1",
    commitSha: "abc",
    severityRaw: "warn",
    evidence: renderEvidence,
    createdAt: 0,
  };
  const abstractionFinding: Finding = { ...renderFinding, id: "01O", ruleId: "react/over-abstraction", evidence: abstractionEvidence };
  const hookFinding: Finding = { ...renderFinding, id: "01H", ruleId: "react/hook-topology", evidence: hookEvidence };

  expect(isFinding(renderFinding)).toBe(true);
  expect(isFinding(abstractionFinding)).toBe(true);
  expect(isFinding(hookFinding)).toBe(true);
});
