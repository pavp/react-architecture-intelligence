import { expect, test } from "vitest";
import { buildSharedExtractionProposal } from "./proposal.js";
import type { Finding, Span } from "../types.js";

const span = (file: string): Span => ({ file, start: 0, end: 10, kind: "component", astPath: "module>fn[0]" });

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
        { name: "PrimaryButton", span: span("PrimaryButton.tsx"), fingerprint: "fp-a", exportKind: "none" },
        { name: "SecondaryButton", span: span("SecondaryButton.tsx"), fingerprint: "fp-b", exportKind: "none" },
        { name: "CtaButton", span: span("CtaButton.tsx"), fingerprint: "fp-c", exportKind: "none" },
      ],
      cosine: 0.92,
      propOverlap: 0.7,
      hookOverlap: 1,
      variancePoints: ["size", "variant"],
      sharedSurface: ["label", "onClick"],
    },
    createdAt: 0,
    ...overrides,
  };
}

test("builds no-write shared extraction proposal from evidence", () => {
  const proposal = buildSharedExtractionProposal(finding());

  expect(proposal.status).toBe("ok");
  expect(proposal).toMatchObject({
    fingerprint: "fp-1",
    ruleId: "react/shared-extraction",
    componentName: "SharedButton",
    varianceParameters: ["size", "variant"],
    sharedProps: ["label", "onClick"],
    risk: { level: "low", reasons: [] },
    writeMode: "proposal-only",
  });
});

test("normalizes common component suffix abbreviations", () => {
  const f = finding();
  if (f.evidence.kind !== "shared-extraction") throw new Error("bad fixture");
  f.evidence.instances = [
    { name: "LoginButton", span: span("LoginButton.tsx"), fingerprint: "fp-a", exportKind: "default" },
    { name: "SignupBtn", span: span("SignupBtn.tsx"), fingerprint: "fp-b", exportKind: "default" },
    { name: "CtaButton", span: span("CtaButton.tsx"), fingerprint: "fp-c", exportKind: "default" },
  ];

  const proposal = buildSharedExtractionProposal(f);

  expect(proposal.status).toBe("ok");
  expect(proposal.componentName).toBe("SharedButton");
});

test("classifies default exports as high risk", () => {
  const f = finding();
  if (f.evidence.kind !== "shared-extraction") throw new Error("bad fixture");
  f.evidence.instances[0] = { ...f.evidence.instances[0]!, exportKind: "default" };

  const proposal = buildSharedExtractionProposal(f);

  expect(proposal.status).toBe("ok");
  expect(proposal.risk).toEqual({ level: "high", reasons: ["default-export-rewrite"] });
});

test("classifies named exports as medium risk", () => {
  const f = finding();
  if (f.evidence.kind !== "shared-extraction") throw new Error("bad fixture");
  f.evidence.instances[0] = { ...f.evidence.instances[0]!, exportKind: "named" };

  const proposal = buildSharedExtractionProposal(f);

  expect(proposal.status).toBe("ok");
  expect(proposal.risk).toEqual({ level: "medium", reasons: ["named-export-rewrite"] });
});

test("classifies invalid spans as high risk", () => {
  const f = finding();
  if (f.evidence.kind !== "shared-extraction") throw new Error("bad fixture");
  f.evidence.instances[0] = { ...f.evidence.instances[0]!, span: { ...span("Broken.tsx"), start: 20, end: 10 } };

  const proposal = buildSharedExtractionProposal(f);

  expect(proposal.status).toBe("ok");
  expect(proposal.risk).toEqual({ level: "high", reasons: ["invalid-span"] });
});

test("classifies unsafe variance names and duplicate source files", () => {
  const f = finding();
  if (f.evidence.kind !== "shared-extraction") throw new Error("bad fixture");
  f.evidence.variancePoints = ["validName", "not-safe-name"];
  f.evidence.instances[1] = { ...f.evidence.instances[1]!, span: span("PrimaryButton.tsx") };

  const proposal = buildSharedExtractionProposal(f);

  expect(proposal.status).toBe("ok");
  expect(proposal.risk).toEqual({ level: "medium", reasons: ["duplicate-source-file", "unsafe-variance-parameter"] });
});

test("refuses non-shared-extraction findings", () => {
  const proposal = buildSharedExtractionProposal(finding({
    ruleId: "react/render-coupling",
    evidence: {
      kind: "render-coupling",
      component: { name: "Page", span: span("Page.tsx"), fingerprint: "fp-page" },
      fanIn: 1,
      fanOut: 8,
      directChildren: 8,
      reachableDepth: 2,
    },
  }));

  expect(proposal).toEqual({ status: "refused", reason: "unsupported-rule" });
});

test("refuses conflict findings before proposal", () => {
  const proposal = buildSharedExtractionProposal(finding({ type: "architectural-conflict" }));

  expect(proposal).toEqual({ status: "refused", reason: "conflict-not-executable" });
});
