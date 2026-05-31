import { expect, test } from "vitest";
import { findingFileRefs, findingMatchesFile } from "./file-refs.js";
import type { PresentedFinding, Span } from "../types.js";

const span = (file: string): Span => ({ file, start: 0, end: 10, kind: "FunctionDeclaration", astPath: "module>fn[0]" });

function finding(evidence: PresentedFinding["evidence"]): PresentedFinding {
  return {
    id: "f1",
    ruleId: "test/rule",
    type: "opportunity",
    fingerprint: { structural: "fp", nominal: "n", positional: "p" },
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run",
    commitSha: "sha",
    severityRaw: "warn",
    severity: "warn",
    status: "active",
    weight: null,
    evidence,
    createdAt: 0,
  };
}

test("findingFileRefs extracts primary and nested spans from current evidence variants", () => {
  const refs = findingFileRefs(finding({
    kind: "boundary-violation",
    convention: { id: "ui-only", edgeKind: "renders", policy: "forbid", reason: "boundary" },
    edge: {
      kind: "renders",
      from: { id: "a", kind: "component", name: "A", file: "src/A.tsx", span: span("src/A.tsx") },
      to: { id: "b", kind: "component", name: "B", file: "src/B.tsx", span: span("src/B.tsx") },
    },
  }));

  expect(refs.map((ref) => ref.file)).toEqual(["src/A.tsx", "src/B.tsx"]);
  expect(refs[0]).toMatchObject({ source: "edge.from", span: span("src/A.tsx") });
});

test("findingMatchesFile matches direct spans and adapter role file refs without false positives", () => {
  const adapterFinding = finding({
    kind: "adapter-metric",
    adapterId: "next",
    ruleId: "next/client-boundary-bloat",
    subject: { id: "page", name: "Page", file: "app/page.tsx", span: span("app/page.tsx"), fingerprint: "page" },
    roles: [{ role: "ClientComponent", variant: "app-router", file: "app/client.tsx" }],
    metrics: { reachableDepth: 3 },
    thresholds: { maxReachableDepth: 2 },
    topology: { directChildIds: ["A"], reachableNodeIds: ["A", "B"], exceeded: ["reachableDepth"] },
  });

  expect(findingMatchesFile(adapterFinding, "app/page.tsx")).toBe(true);
  expect(findingMatchesFile(adapterFinding, "./app/client.tsx")).toBe(true);
  expect(findingMatchesFile(adapterFinding, "app/missing.tsx")).toBe(false);
});
