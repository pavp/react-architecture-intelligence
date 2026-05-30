import { expect, test } from "vitest";
import { renderCoupling } from "./render-coupling.js";
import type { AnalysisContext } from "./analyzer.js";
import type { ComponentNode, GraphEdge } from "../types.js";
import { DEFAULT_CONFIG, type RaiConfig } from "../config/resolve.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";

function comp(id: string, name = id): ComponentNode {
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
  };
}

function renders(srcId: string, dstId: string): GraphEdge {
  return { srcId, dstId, kind: "renders" };
}

function ctx(components: ComponentNode[], edges: GraphEdge[], config: RaiConfig = DEFAULT_CONFIG): AnalysisContext {
  return {
    graph: { components, modules: [], edges },
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
  renderCoupling: { maxFanIn: 1, maxFanOut: 2, maxDirectChildren: 2, maxReachableDepth: 2 },
};

test("emits metric-only evidence for fan-in threshold breaches", () => {
  const components = [comp("A"), comp("B"), comp("C"), comp("Target")];
  const findings = renderCoupling.analyze(ctx(components, [renders("A", "Target"), renders("B", "Target"), renders("C", "Target")], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.ruleId).toBe("react/render-coupling");
  expect(findings[0]!.type).toBe("opportunity");
  expect(findings[0]!.evidence).toEqual({
    kind: "render-coupling",
    component: { name: "Target", span: components[3]!.span, fingerprint: expect.any(String) },
    fanIn: 3,
    fanOut: 0,
    directChildren: 0,
    reachableDepth: 0,
  });
  expect(Object.keys(findings[0]!.evidence).sort()).toEqual(["component", "directChildren", "fanIn", "fanOut", "kind", "reachableDepth"]);
});

test("emits one finding when fan-out edge count exceeds direct child count", () => {
  const components = [comp("Parent"), comp("ChildA"), comp("ChildB")];
  const config: RaiConfig = { ...tightConfig, renderCoupling: { ...tightConfig.renderCoupling, maxFanIn: 5 } };
  const findings = renderCoupling.analyze(ctx(components, [renders("Parent", "ChildA"), renders("Parent", "ChildA"), renders("Parent", "ChildB")], config));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.evidence).toMatchObject({ fanIn: 0, fanOut: 3, directChildren: 2, reachableDepth: 1 });
});

test("emits direct-children breaches from unique rendered children", () => {
  const components = [comp("Parent"), comp("ChildA"), comp("ChildB"), comp("ChildC")];
  const config: RaiConfig = { ...tightConfig, renderCoupling: { ...tightConfig.renderCoupling, maxFanIn: 5, maxFanOut: 5 } };
  const findings = renderCoupling.analyze(ctx(components, [renders("Parent", "ChildA"), renders("Parent", "ChildB"), renders("Parent", "ChildC")], config));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.evidence).toMatchObject({ fanIn: 0, fanOut: 3, directChildren: 3, reachableDepth: 1 });
});

test("emits reachable depth breaches from render paths", () => {
  const components = [comp("Root"), comp("A"), comp("B"), comp("C")];
  const findings = renderCoupling.analyze(ctx(components, [renders("Root", "A"), renders("A", "B"), renders("B", "C")], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.evidence).toMatchObject({ component: { name: "Root" }, fanIn: 0, fanOut: 1, directChildren: 1, reachableDepth: 3 });
});

test("emits no findings when all render topology metrics are below thresholds", () => {
  const components = [comp("Root"), comp("Child")];
  const findings = renderCoupling.analyze(ctx(components, [renders("Root", "Child")], tightConfig));

  expect(findings).toEqual([]);
});

test("sorts findings deterministically by structural fingerprint", () => {
  const components = [comp("Zulu"), comp("Alpha"), comp("B"), comp("C"), comp("D"), comp("E")];
  const edges = [renders("B", "Zulu"), renders("C", "Zulu"), renders("D", "Alpha"), renders("E", "Alpha")];
  const first = renderCoupling.analyze(ctx(components, edges, tightConfig)).map((finding) => ({ ...finding, id: "" }));
  const second = renderCoupling.analyze(ctx([...components].reverse(), [...edges].reverse(), tightConfig)).map((finding) => ({ ...finding, id: "" }));

  expect(first).toHaveLength(2);
  expect(first).toEqual(second);
  expect(first.map((finding) => finding.fingerprint.structural)).toEqual([...first.map((finding) => finding.fingerprint.structural)].sort());
});
