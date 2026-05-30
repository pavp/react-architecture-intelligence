import { expect, test } from "vitest";
import { hookTopology } from "./hook-topology.js";
import type { AnalysisContext } from "./analyzer.js";
import type { ComponentNode, GraphEdge, HookNode } from "../types.js";
import { DEFAULT_CONFIG, type RaiConfig } from "../config/resolve.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";

function hook(id: string, name = id): HookNode {
  return {
    id,
    name,
    file: `${name}.ts`,
    span: { file: `${name}.ts`, start: 0, end: 10, kind: "hook", astPath: `module>decl[${id}]` },
    exportKind: "named",
    hookCalls: [],
  };
}

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

function usesHook(srcId: string, dstId: string): GraphEdge {
  return { srcId, dstId, kind: "uses-hook" };
}

function ctx(hooks: HookNode[], edges: GraphEdge[], components: ComponentNode[] = [], config: RaiConfig = DEFAULT_CONFIG): AnalysisContext {
  return {
    graph: { components, hooks, modules: [], edges },
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
  hookTopology: { maxFanIn: 1, maxFanOut: 2, maxDirectDependencies: 2, maxReachableDepth: 2 },
};

test("emits metric-only evidence for hook fan-in threshold breaches", () => {
  const hooks = [hook("useA"), hook("useB"), hook("useC"), hook("useTarget")];
  const findings = hookTopology.analyze(ctx(hooks, [usesHook("useA", "useTarget"), usesHook("useB", "useTarget"), usesHook("useC", "useTarget")], [], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.ruleId).toBe("react/hook-topology");
  expect(findings[0]!.evidence).toEqual({
    kind: "hook-topology",
    hook: { name: "useTarget", span: hooks[3]!.span, fingerprint: expect.any(String) },
    fanIn: 3,
    fanOut: 0,
    directDependencies: 0,
    reachableDepth: 0,
  });
});

test("ignores component-to-hook consumer edges for hook-to-hook fan-in", () => {
  const hooks = [hook("useTarget")];
  const components = [comp("Page")];
  const findings = hookTopology.analyze(ctx(hooks, [usesHook("Page", "useTarget")], components, { ...tightConfig, hookTopology: { ...tightConfig.hookTopology, maxFanIn: 0 } }));

  expect(findings).toEqual([]);
});

test("emits reachable depth breaches from hook composition paths", () => {
  const hooks = [hook("useRoot"), hook("useA"), hook("useB"), hook("useC")];
  const findings = hookTopology.analyze(ctx(hooks, [usesHook("useRoot", "useA"), usesHook("useA", "useB"), usesHook("useB", "useC")], [], tightConfig));

  expect(findings).toHaveLength(1);
  expect(findings[0]!.evidence).toMatchObject({ hook: { name: "useRoot" }, fanIn: 0, fanOut: 1, directDependencies: 1, reachableDepth: 3 });
});

test("emits no findings when all hook topology metrics are below thresholds", () => {
  const hooks = [hook("useRoot"), hook("useChild")];
  const findings = hookTopology.analyze(ctx(hooks, [usesHook("useRoot", "useChild")], [], tightConfig));

  expect(findings).toEqual([]);
});

test("sorts hook topology findings deterministically", () => {
  const hooks = [hook("useZulu"), hook("useAlpha"), hook("useB"), hook("useC"), hook("useD"), hook("useE")];
  const edges = [usesHook("useB", "useZulu"), usesHook("useC", "useZulu"), usesHook("useD", "useAlpha"), usesHook("useE", "useAlpha")];
  const first = hookTopology.analyze(ctx(hooks, edges, [], tightConfig)).map((finding) => ({ ...finding, id: "" }));
  const second = hookTopology.analyze(ctx([...hooks].reverse(), [...edges].reverse(), [], tightConfig)).map((finding) => ({ ...finding, id: "" }));

  expect(first).toHaveLength(2);
  expect(first).toEqual(second);
  expect(first.map((finding) => finding.fingerprint.structural)).toEqual([...first.map((finding) => finding.fingerprint.structural)].sort());
});
