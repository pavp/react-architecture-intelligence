import { expect, test } from "vitest";
import { buildSharedExtractionProposal } from "./proposal.js";
import { previewSharedExtractionPatch } from "./dry-run.js";
import type { Finding, Span } from "../types.js";
import { pass1 } from "../parse/pass1.js";

const aSource = `export function LoginButton({ label, onClick, variant }) {
  return <button onClick={onClick} data-variant={variant}>{label}</button>;
}
`;
const bSource = `export function SignupButton({ label, onClick, size }) {
  return <button onClick={onClick} data-size={size}>{label}</button>;
}
`;
const cSource = `export function CtaButton({ label, onClick, variant }) {
  return <button onClick={onClick} data-variant={variant}>{label}</button>;
}
`;

function span(file: string, source: string, name: string): Span {
  return pass1(file, source).components.find((component) => component.name === name)!.span;
}

function finding(): Finding {
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
        { name: "LoginButton", span: span("LoginButton.tsx", aSource, "LoginButton"), fingerprint: "fp-a", exportKind: "named" },
        { name: "SignupButton", span: span("SignupButton.tsx", bSource, "SignupButton"), fingerprint: "fp-b", exportKind: "named" },
        { name: "CtaButton", span: span("CtaButton.tsx", cSource, "CtaButton"), fingerprint: "fp-c", exportKind: "named" },
      ],
      cosine: 0.9,
      propOverlap: 0.7,
      hookOverlap: 1,
      variancePoints: ["size", "variant"],
      sharedSurface: ["label", "onClick"],
    },
    createdAt: 0,
  };
}

const sources = [
  { file: "LoginButton.tsx", source: aSource },
  { file: "SignupButton.tsx", source: bSource },
  { file: "CtaButton.tsx", source: cSource },
];

test("dry-run returns deterministic patch and rollback preview without mutating sources", () => {
  const proposal = buildSharedExtractionProposal(finding());
  if (proposal.status !== "ok") throw new Error("bad fixture");
  const before = sources.map((source) => ({ ...source }));

  const first = previewSharedExtractionPatch({ proposal, sources, targetFile: "SharedButton.tsx" });
  const second = previewSharedExtractionPatch({ proposal, sources, targetFile: "SharedButton.tsx" });

  expect(first).toEqual(second);
  expect(first.status).toBe("ok");
  expect(first.touchedFiles).toEqual(["CtaButton.tsx", "LoginButton.tsx", "SharedButton.tsx", "SignupButton.tsx"]);
  expect(first.patch).toContain("+++ SharedButton.tsx");
  expect(first.patch).toContain("export function SharedButton({ label, onClick, size, variant })");
  expect(first.rollbackPatch).toContain("--- SharedButton.tsx");
  expect(sources).toEqual(before);
});

test("dry-run refuses stale spans before patch generation", () => {
  const proposal = buildSharedExtractionProposal(finding());
  if (proposal.status !== "ok") throw new Error("bad fixture");

  const result = previewSharedExtractionPatch({
    proposal,
    sources: [{ file: "LoginButton.tsx", source: "export const changed = true;" }, ...sources.slice(1)],
    targetFile: "SharedButton.tsx",
  });

  expect(result).toEqual({ status: "refused", reason: "stale-span", file: "LoginButton.tsx" });
});

test("dry-run refuses unsafe variance parameters", () => {
  const f = finding();
  if (f.evidence.kind !== "shared-extraction") throw new Error("bad fixture");
  f.evidence.variancePoints = ["not-safe"];
  const proposal = buildSharedExtractionProposal(f);
  if (proposal.status !== "ok") throw new Error("bad fixture");

  const result = previewSharedExtractionPatch({ proposal, sources, targetFile: "SharedButton.tsx" });

  expect(result).toEqual({ status: "refused", reason: "unsafe-variance-parameter", parameter: "not-safe" });
});
