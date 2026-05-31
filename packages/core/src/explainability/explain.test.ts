import { expect, test } from "vitest";
import { explainFinding } from "./explain.js";
import type { PresentedFinding } from "../types.js";

const span = { file: "src/Button.tsx", start: 1, end: 20, kind: "FunctionDeclaration", astPath: "module>fn[0]" };

function finding(evidence: PresentedFinding["evidence"]): PresentedFinding {
  return {
    id: "f1",
    ruleId: "react/shared-extraction",
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

test("explainFinding builds bounded explanation from shared-extraction facts", () => {
  const result = explainFinding(finding({
    kind: "shared-extraction",
    instances: [
      { name: "PrimaryButton", span, fingerprint: "a", exportKind: "named" },
      { name: "SecondaryButton", span: { ...span, file: "src/SecondaryButton.tsx" }, fingerprint: "b", exportKind: "default" },
    ],
    cosine: 0.91,
    propOverlap: 0.75,
    hookOverlap: 0.5,
    variancePoints: ["variant"],
    sharedSurface: ["label", "onClick"],
  }));

  expect(result).toMatchObject({
    summary: "RAI found 2 similar components for react/shared-extraction.",
    whyItMatters: "This may indicate repeated UI structure already visible in code.",
    inspectFirst: ["src/Button.tsx", "src/SecondaryButton.tsx"],
    limits: expect.arrayContaining(["Do not assume shared ownership, intent, or safe remediation from this finding alone."]),
    groundingFields: expect.arrayContaining(["cosine", "propOverlap", "hookOverlap", "sharedSurface"]),
  });
  expect(result.glossary.map((entry) => entry.term)).toEqual(expect.arrayContaining(["cosine", "sharedSurface"]));
});

test("explainFinding reports unknown evidence keys as raw and does not invent intent", () => {
  const result = explainFinding(finding({
    kind: "custom-evidence",
    span,
    ownerIntent: "team-a",
  } as unknown as PresentedFinding["evidence"]));

  expect(result.summary).toBe("RAI found custom-evidence evidence for react/shared-extraction.");
  expect(result.groundingFields).toEqual(["kind", "ownerIntent", "span"]);
  expect(result.glossary).toContainEqual({
    term: "ownerIntent",
    known: false,
    definition: "Unknown term; treat it as raw evidence from the finding.",
  });
  expect(result.whyItMatters).not.toContain("team-a");
  expect(result.limits).toContain("Unknown evidence keys are raw facts, not inferred meaning.");
});

test("explainFinding gives inspect-first guidance for render-coupling evidence", () => {
  const result = explainFinding(finding({
    kind: "render-coupling",
    component: { name: "Dashboard", span, fingerprint: "dashboard-fp" },
    fanIn: 2,
    fanOut: 8,
    directChildren: 5,
    reachableDepth: 3,
  }));

  expect(result.inspectFirst).toEqual([
    "Dashboard in src/Button.tsx",
    "2 inbound render links",
    "8 downstream render links",
    "5 direct children",
    "render tree depth: 3",
  ]);
  expect(result.inspectFirst.join("\n")).not.toMatch(/\b(fanIn|fanOut|directChildren|reachableDepth)=/);
  expect(result.whyItMatters).not.toContain("owner");
  expect(result.limits).toContain("Do not assume shared ownership, intent, root cause, or safe remediation from this finding alone.");
});

test("explainFinding keeps known topology guidance human-readable", () => {
  const result = explainFinding(finding({
    kind: "hook-topology",
    hook: { name: "useDashboardData", span, fingerprint: "hook-fp" },
    fanIn: 1,
    fanOut: 4,
    directDependencies: 2,
    reachableDepth: 3,
  }));

  expect(result.inspectFirst).toEqual([
    "useDashboardData in src/Button.tsx",
    "1 inbound dependency link",
    "4 downstream dependency links",
    "2 direct dependencies",
    "dependency tree depth: 3",
  ]);
  expect(result.inspectFirst.join("\n")).not.toMatch(/\b(fanIn|fanOut|directDependencies|reachableDepth)=/);
});

test("explainFinding avoids raw key-value guidance for known evidence kinds", () => {
  const cases: Array<{ name: string; evidence: PresentedFinding["evidence"]; expected: string[] }> = [
    {
      name: "over-abstraction",
      evidence: {
        kind: "over-abstraction",
        component: { name: "Dashboard", span, fingerprint: "dashboard-fp" },
        propCount: 7,
        hookCount: 2,
        childCount: 3,
        compositionMarkerCount: 1,
        conditionalBranchCount: 4,
      },
      expected: [
        "Dashboard in src/Button.tsx",
        "7 props",
        "2 hooks",
        "3 rendered children",
        "1 composition marker",
        "4 conditional branches",
      ],
    },
    {
      name: "boundary-violation",
      evidence: {
        kind: "boundary-violation",
        convention: { id: "ui-boundary", edgeKind: "renders", policy: "forbid", reason: "Keep app shell separate." },
        edge: {
          kind: "renders",
          from: { id: "Dashboard", kind: "component", name: "Dashboard", file: "src/Dashboard.tsx", span: { ...span, file: "src/Dashboard.tsx" } },
          to: { id: "Button", kind: "component", name: "Button", file: "src/Button.tsx", span },
        },
      },
      expected: [
        "Dashboard in src/Dashboard.tsx",
        "Button in src/Button.tsx",
        "render link violates ui-boundary",
      ],
    },
    {
      name: "adapter-metric",
      evidence: {
        kind: "adapter-metric",
        adapterId: "next",
        ruleId: "next/client-boundary-bloat",
        subject: { id: "AppRoute", name: "AppRoute", file: "app/page.tsx", span: { ...span, file: "app/page.tsx" }, fingerprint: "route-fp" },
        roles: [{ role: "route", variant: "app", file: "app/page.tsx" }],
        metrics: { clientComponentCount: 6 },
        thresholds: { clientComponentCount: 3 },
        topology: { directChildIds: ["Child"], reachableNodeIds: ["Child", "Leaf"], exceeded: ["clientComponentCount"] },
      },
      expected: [
        "AppRoute in app/page.tsx",
        "adapter: next",
        "rule: next/client-boundary-bloat",
        "role route (app) in app/page.tsx",
        "metric clientComponentCount: 6",
        "threshold clientComponentCount: 3",
        "exceeded topology: clientComponentCount",
      ],
    },
  ];

  for (const tt of cases) {
    const result = explainFinding(finding(tt.evidence));

    expect(result.inspectFirst, tt.name).toEqual(tt.expected);
    expect(result.inspectFirst.join("\n"), tt.name).not.toMatch(/\b[A-Za-z][A-Za-z0-9.]*=/);
  }
});

test("explainFinding gives raw inspect-first fallback for unknown evidence", () => {
  const result = explainFinding(finding({
    kind: "custom-evidence",
    span,
    count: 3,
  } as unknown as PresentedFinding["evidence"]));

  expect(result.inspectFirst).toEqual(["raw evidence keys: count, kind, span"]);
  expect(result.summary).toBe("RAI found custom-evidence evidence for react/shared-extraction.");
});
