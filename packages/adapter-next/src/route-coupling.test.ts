import { expect, test } from "vitest";
import { createRouteCouplingAnalyzer, ROUTE_COUPLING_RULE_ID, type RouteCouplingInput } from "./route-coupling.js";
import type { NextDetection } from "./detect.js";
import type { NextGraphEnrichment, NextGraphInput, NextTag } from "./enrich.js";
import type { ComponentNode, GraphEdge } from "@rai/core";

const appDetection: NextDetection = {
  adapterId: "next",
  rootDir: ".",
  variant: "app-router",
  signals: { packageJson: true, nextConfig: false, appRouter: true, pagesRouter: false, appRouteFiles: ["dashboard/page.tsx"], pagesRouteFiles: [] },
};

const pagesDetection: NextDetection = {
  adapterId: "next",
  rootDir: ".",
  variant: "pages-router",
  signals: { packageJson: true, nextConfig: false, appRouter: false, pagesRouter: true, appRouteFiles: [], pagesRouteFiles: ["index.tsx"] },
};

const mixedDetection: NextDetection = {
  adapterId: "next",
  rootDir: ".",
  variant: "mixed-router",
  signals: { packageJson: true, nextConfig: false, appRouter: true, pagesRouter: true, appRouteFiles: ["dashboard/page.tsx"], pagesRouteFiles: ["index.tsx"] },
};

function component(id: string, file = `app/${id}.tsx`, name = id): ComponentNode {
  return {
    id,
    name,
    file,
    kind: "fn",
    exportKind: "default",
    span: { file, start: 0, end: 10, kind: "component", astPath: `module>fn[${id}]` },
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

function routeEnrichment(routeIds: string[], detection: NextDetection = appDetection): NextGraphEnrichment {
  const tags = new Map<string, NextTag[]>(routeIds.map((id) => [id, [{ adapterId: "next", role: "RouteSegment", variant: detection.variant, file: `${detection.variant === "pages-router" ? "pages" : "app"}/${id}.tsx` }]]));
  return { nodeTags: tags, extraEdges: [], roleIndex: new Map([["RouteSegment", [...routeIds].sort()]]) };
}

function input(components: ComponentNode[], edges: GraphEdge[], detection = appDetection, routeIds = ["Route"]): RouteCouplingInput {
  return {
    graph: { components, hooks: [], modules: [], edges } satisfies NextGraphInput,
    detection,
    enrichment: routeEnrichment(routeIds, detection),
    runId: "run-1",
    commitSha: "sha-1",
    analysisVersion: 9,
    thresholds: { maxFanIn: 1, maxFanOut: 2, maxDirectChildren: 2, maxReachableNodes: 3, maxReachableDepth: 2 },
  };
}

test("emits next/route-coupling for App Router route topology breaches", () => {
  const components = [component("Route"), component("Shell"), component("A"), component("B"), component("C"), component("D")];
  const result = createRouteCouplingAnalyzer().analyze(input(components, [renders("Shell", "Route"), renders("Route", "A"), renders("Route", "B"), renders("Route", "C"), renders("C", "D")]));

  expect(result.diagnostics).toEqual([]);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]!).toMatchObject({ ruleId: ROUTE_COUPLING_RULE_ID, type: "opportunity", severityRaw: "error", producingRunId: "run-1", commitSha: "sha-1", analysisVersion: 9 });
  expect(result.findings[0]!.evidence).toMatchObject({
    kind: "adapter-metric",
    adapterId: "next",
    ruleId: ROUTE_COUPLING_RULE_ID,
    subject: { id: "Route", name: "Route", file: "app/Route.tsx", span: components[0]!.span },
    metrics: { fanIn: 1, fanOut: 3, directChildren: 3, reachableNodes: 4, reachableDepth: 2 },
    thresholds: { maxFanIn: 1, maxFanOut: 2, maxDirectChildren: 2, maxReachableNodes: 3, maxReachableDepth: 2 },
    topology: { directChildIds: ["A", "B", "C"], reachableNodeIds: ["A", "B", "C", "D"], exceeded: ["fanOut", "directChildren", "reachableNodes"] },
  });
});

test("supports Pages Router route segments and scopes metrics to route-owned topology", () => {
  const route = component("PageRoute", "pages/index.tsx");
  const components = [route, component("A"), component("B"), component("C"), component("D"), component("Unrelated"), component("External")];
  const edges = [renders("PageRoute", "A"), renders("PageRoute", "B"), renders("PageRoute", "C"), renders("C", "D"), renders("Unrelated", "External")];
  const result = createRouteCouplingAnalyzer().analyze(input(components, edges, pagesDetection, ["PageRoute"]));

  expect(result.diagnostics).toEqual([]);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]!.evidence).toMatchObject({
    roles: [{ role: "RouteSegment", variant: "pages-router", file: "pages/PageRoute.tsx" }],
    metrics: { fanIn: 0, fanOut: 3, directChildren: 3, reachableNodes: 4, reachableDepth: 2 },
    topology: { directChildIds: ["A", "B", "C"], reachableNodeIds: ["A", "B", "C", "D"], exceeded: ["fanOut", "directChildren", "reachableNodes"] },
  });
});

test("stays silent when metrics are below or equal to thresholds", () => {
  const below = createRouteCouplingAnalyzer().analyze(input([component("Route"), component("A"), component("B")], [renders("Route", "A"), renders("A", "B")]));
  const equal = createRouteCouplingAnalyzer().analyze(input([component("Route"), component("Parent"), component("A"), component("B"), component("C")], [renders("Parent", "Route"), renders("Route", "A"), renders("Route", "B"), renders("A", "C")]));

  expect(below.findings).toEqual([]);
  expect(below.diagnostics).toEqual([]);
  expect(equal.findings).toEqual([]);
  expect(equal.diagnostics).toEqual([]);
});

test("returns diagnostics without findings for mixed-router and non-Next unsupported variants", () => {
  const mixed = createRouteCouplingAnalyzer().analyze(input([component("Route")], [], mixedDetection));
  const nonNext = createRouteCouplingAnalyzer().analyze({ ...input([component("Route")], []), detection: null });

  expect(mixed.findings).toEqual([]);
  expect(nonNext.findings).toEqual([]);
  expect(mixed.diagnostics).toEqual([{ kind: "variant-mismatch", adapterId: "next", analyzerId: ROUTE_COUPLING_RULE_ID, detectedVariant: "mixed-router", supportedVariants: ["app-router", "pages-router"], rootDir: ".", message: "next/route-coupling supports app-router, pages-router, detected mixed-router" }]);
  expect(nonNext.diagnostics).toEqual([{ kind: "variant-mismatch", adapterId: "next", analyzerId: ROUTE_COUPLING_RULE_ID, detectedVariant: "non-next", supportedVariants: ["app-router", "pages-router"], rootDir: "", message: "next/route-coupling supports app-router, pages-router, detected non-next" }]);
});

test("emits metric-only evidence with route roles and render topology references only", () => {
  const components = [component("Route"), component("A"), component("B"), component("C"), component("D")];
  const result = createRouteCouplingAnalyzer().analyze(input(components, [renders("Route", "A"), renders("Route", "B"), renders("Route", "C"), renders("C", "D")]));
  const evidence = result.findings[0]!.evidence;
  const evidenceWithoutSpan = { ...evidence, subject: { ...evidence.subject, span: undefined } };
  const encoded = JSON.stringify(evidenceWithoutSpan).toLowerCase();

  expect(Object.keys(evidence).sort()).toEqual(["adapterId", "kind", "metrics", "roles", "ruleId", "subject", "thresholds", "topology"]);
  expect(evidence).toMatchObject({ roles: [{ role: "RouteSegment", variant: "app-router", file: "app/Route.tsx" }], topology: { directChildIds: ["A", "B", "C"], reachableNodeIds: ["A", "B", "C", "D"], exceeded: ["fanOut", "directChildren", "reachableNodes"] } });
  expect(encoded).toContain("renderedgeids");
  expect(encoded).not.toContain("import");
  expect(encoded).not.toContain("module");
  expect(encoded).not.toContain("call");
  expect(encoded).not.toContain("prop-flow");
});

test("is pure and exposes findings and diagnostics through return values only", () => {
  const inputValue = Object.freeze(input([component("Route"), component("A"), component("B"), component("C")], [renders("Route", "A"), renders("Route", "B"), renders("Route", "C")]));
  const result = createRouteCouplingAnalyzer().analyze(inputValue);

  expect(result.findings).toHaveLength(1);
  expect(result.diagnostics).toEqual([]);
  expect(Object.keys(createRouteCouplingAnalyzer()).sort()).toEqual(["analyze", "ruleId"]);
});

test("produces deterministic output and traverses render cycles safely", () => {
  const components = [component("RouteZ"), component("RouteA"), component("ZA"), component("ZB"), component("AA"), component("AB")];
  const nextEnrichment = routeEnrichment(["RouteA", "RouteZ"]);
  const analyzer = createRouteCouplingAnalyzer({ thresholds: { maxFanIn: 0, maxFanOut: 1, maxDirectChildren: 1, maxReachableNodes: 1, maxReachableDepth: 1 } });
  const run = (orderedComponents: ComponentNode[], orderedEdges: GraphEdge[]) => analyzer.analyze({ ...input(orderedComponents, orderedEdges, appDetection, ["RouteA", "RouteZ"]), thresholds: undefined, enrichment: nextEnrichment }).findings.map((finding) => ({ ...finding, id: "" }));

  const first = run(components, [renders("RouteZ", "ZA"), renders("RouteZ", "ZB"), renders("ZB", "RouteZ"), renders("RouteA", "AA"), renders("RouteA", "AB"), renders("AB", "RouteA")]);
  const second = run([...components].reverse(), [renders("AB", "RouteA"), renders("RouteA", "AB"), renders("RouteA", "AA"), renders("ZB", "RouteZ"), renders("RouteZ", "ZB"), renders("RouteZ", "ZA")]);

  expect(first).toEqual(second);
  expect(first).toHaveLength(2);
  expect(first.map((finding) => finding.fingerprint.structural)).toEqual([...first.map((finding) => finding.fingerprint.structural)].sort());
  expect(first[0]!.evidence).toMatchObject({ metrics: { fanIn: 1, fanOut: 2, directChildren: 2, reachableNodes: 2, reachableDepth: 1 } });
});
