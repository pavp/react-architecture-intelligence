import { expect, test } from "vitest";
import { overAbstraction } from "./over-abstraction.js";
import type { AnalysisContext } from "./analyzer.js";
import type { ComponentNode } from "../types.js";
import { DEFAULT_CONFIG, type RaiConfig } from "../config/resolve.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";

function comp(id: string, overrides: Partial<ComponentNode> = {}): ComponentNode {
  const name = overrides.name ?? id;
  return {
    id,
    name,
    file: `${name}.tsx`,
    kind: "fn",
    exportKind: "named",
    span: { file: `${name}.tsx`, start: 0, end: 10, kind: "component", astPath: `module>fn[${id}]` },
    propNames: [],
    hookCalls: [],
    childComponents: [],
    compositionMarkers: [],
    conditionalBranches: 0,
    ...overrides,
  };
}

function ctx(components: ComponentNode[], config: RaiConfig = DEFAULT_CONFIG): AnalysisContext {
  return {
    graph: { components, hooks: [], modules: [], edges: [] },
    memory: { weight: () => ({ fingerprint: "", ruleId: "", value: 0, confidence: 0, eventCount: 0, lastEvent: 0 }) } as any,
    config,
    types: { typeOf: () => null },
    runId: "run",
    commitSha: "sha",
    analysisVersion: 1,
    embeddingModelVersion: EMBED_MODEL_VERSION,
    boundaryRules: [],
  };
}

const tightConfig: RaiConfig = {
  ...DEFAULT_CONFIG,
  overAbstraction: { maxProps: 2, maxHooks: 1, maxChildren: 2, maxCompositionMarkers: 1, maxConditionalBranches: 1 },
};

test("emits metric-only evidence for prop threshold breaches", () => {
  const component = comp("DenseCard", { propNames: ["title", "subtitle", "icon"] });
  const findings = overAbstraction.analyze(ctx([component], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.ruleId).toBe("react/over-abstraction");
  expect(findings[0]!.type).toBe("opportunity");
  expect(findings[0]!.evidence).toEqual({
    kind: "over-abstraction",
    component: { name: "DenseCard", span: component.span, fingerprint: expect.any(String) },
    propCount: 3,
    hookCount: 0,
    childCount: 0,
    compositionMarkerCount: 0,
    conditionalBranchCount: 0,
  });
  expect(Object.keys(findings[0]!.evidence).sort()).toEqual([
    "childCount",
    "component",
    "compositionMarkerCount",
    "conditionalBranchCount",
    "hookCount",
    "kind",
    "propCount",
  ]);
});

test("emits hook and child count breaches from existing component counts", () => {
  const component = comp("DashboardPanel", {
    hookCalls: ["useTheme", "useFilters"],
    childComponents: ["Header", "Chart", "Table"],
  });
  const findings = overAbstraction.analyze(ctx([component], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.evidence).toMatchObject({
    component: { name: "DashboardPanel" },
    propCount: 0,
    hookCount: 2,
    childCount: 3,
    compositionMarkerCount: 0,
    conditionalBranchCount: 0,
  });
});

test("emits composition marker and conditional branch breaches", () => {
  const component = comp("AdaptiveWidget", {
    compositionMarkers: ["memo", "forwardRef"],
    conditionalBranches: 2,
  });
  const findings = overAbstraction.analyze(ctx([component], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.evidence).toMatchObject({
    component: { name: "AdaptiveWidget" },
    propCount: 0,
    hookCount: 0,
    childCount: 0,
    compositionMarkerCount: 2,
    conditionalBranchCount: 2,
  });
});

test("emits no findings when structural counts are below thresholds", () => {
  const component = comp("SimpleCard", {
    propNames: ["title"],
    hookCalls: ["useTheme"],
    childComponents: ["Icon"],
    compositionMarkers: ["memo"],
    conditionalBranches: 1,
  });

  expect(overAbstraction.analyze(ctx([component], tightConfig))).toEqual([]);
});

test("sorts findings deterministically by structural fingerprint", () => {
  const alpha = comp("Alpha", { propNames: ["a", "b", "c"] });
  const zulu = comp("Zulu", { hookCalls: ["useA", "useB"] });
  const first = overAbstraction.analyze(ctx([zulu, alpha], tightConfig)).map((finding) => ({ ...finding, id: "" }));
  const second = overAbstraction.analyze(ctx([alpha, zulu], tightConfig)).map((finding) => ({ ...finding, id: "" }));

  expect(first).toHaveLength(2);
  expect(first).toEqual(second);
  expect(first.map((finding) => finding.fingerprint.structural)).toEqual([...first.map((finding) => finding.fingerprint.structural)].sort());
});
