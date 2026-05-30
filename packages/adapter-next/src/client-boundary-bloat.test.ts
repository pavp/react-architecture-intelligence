import { expect, test } from "vitest";
import { createClientBoundaryBloatAnalyzer, type ClientBoundaryBloatInput } from "./client-boundary-bloat.js";
import type { NextDetection } from "./detect.js";
import type { NextGraphEnrichment, NextGraphInput } from "./enrich.js";
import type { ComponentNode, GraphEdge } from "@rai/core";

const appDetection: NextDetection = {
  adapterId: "next",
  rootDir: ".",
  variant: "app-router",
  signals: { packageJson: true, nextConfig: false, appRouter: true, pagesRouter: false, appRouteFiles: ["dashboard/page.tsx"], pagesRouteFiles: [] },
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

function enrichment(clientIds: string[]): NextGraphEnrichment {
  return {
    nodeTags: new Map(clientIds.map((id) => [id, [{ adapterId: "next", role: "ClientComponent", variant: "app-router", file: `app/${id}.tsx` }]])),
    extraEdges: [],
    roleIndex: new Map([["ClientComponent", [...clientIds].sort()]]),
  };
}

function input(components: ComponentNode[], edges: GraphEdge[], detection = appDetection): ClientBoundaryBloatInput {
  return {
    graph: { components, hooks: [], modules: [], edges } satisfies NextGraphInput,
    detection,
    enrichment: enrichment(["Boundary"]),
    runId: "run-1",
    commitSha: "sha-1",
    analysisVersion: 7,
    thresholds: { maxFanOut: 2, maxDirectChildren: 2, maxReachableNodes: 3, maxReachableDepth: 2 },
  };
}

test("emits next/client-boundary-bloat for oversized App Router client boundaries", () => {
  const components = [component("Boundary"), component("A"), component("B"), component("C"), component("D")];
  const result = createClientBoundaryBloatAnalyzer().analyze(input(components, [renders("Boundary", "A"), renders("Boundary", "B"), renders("Boundary", "C"), renders("C", "D")]));

  expect(result.diagnostics).toEqual([]);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]!).toMatchObject({ ruleId: "next/client-boundary-bloat", type: "opportunity", severityRaw: "error", producingRunId: "run-1", commitSha: "sha-1", analysisVersion: 7 });
  expect(result.findings[0]!.evidence).toMatchObject({
    kind: "adapter-metric",
    adapterId: "next",
    ruleId: "next/client-boundary-bloat",
    subject: { id: "Boundary", name: "Boundary", file: "app/Boundary.tsx", span: components[0]!.span },
    metrics: { fanOut: 3, directChildren: 3, reachableNodes: 4, reachableDepth: 2 },
    thresholds: { maxFanOut: 2, maxDirectChildren: 2, maxReachableNodes: 3, maxReachableDepth: 2 },
    topology: { directChildIds: ["A", "B", "C"], reachableNodeIds: ["A", "B", "C", "D"], exceeded: ["fanOut", "directChildren", "reachableNodes"] },
  });
});

test("returns no finding when client boundary metrics are within thresholds", () => {
  const components = [component("Boundary"), component("A"), component("B")];
  const result = createClientBoundaryBloatAnalyzer().analyze(input(components, [renders("Boundary", "A"), renders("A", "B")]));

  expect(result.findings).toEqual([]);
  expect(result.diagnostics).toEqual([]);
});

test("returns variant-mismatch diagnostics for pages-router and mixed-router", () => {
  const pages = { ...appDetection, variant: "pages-router" as const, signals: { ...appDetection.signals, appRouter: false, pagesRouter: true, appRouteFiles: [], pagesRouteFiles: ["index.tsx"] } };
  const mixed = { ...appDetection, variant: "mixed-router" as const, signals: { ...appDetection.signals, pagesRouter: true, pagesRouteFiles: ["index.tsx"] } };

  const pagesResult = createClientBoundaryBloatAnalyzer().analyze(input([component("Boundary")], [], pages));
  const mixedResult = createClientBoundaryBloatAnalyzer().analyze(input([component("Boundary")], [], mixed));

  expect(pagesResult.findings).toEqual([]);
  expect(mixedResult.findings).toEqual([]);
  expect(pagesResult.diagnostics).toEqual([{ kind: "variant-mismatch", adapterId: "next", analyzerId: "next/client-boundary-bloat", detectedVariant: "pages-router", supportedVariants: ["app-router"], rootDir: ".", message: "next/client-boundary-bloat supports app-router, detected pages-router" }]);
  expect(mixedResult.diagnostics).toEqual([{ kind: "variant-mismatch", adapterId: "next", analyzerId: "next/client-boundary-bloat", detectedVariant: "mixed-router", supportedVariants: ["app-router"], rootDir: ".", message: "next/client-boundary-bloat supports app-router, detected mixed-router" }]);
});

test("emits metric-only evidence with roles and deterministic sorting", () => {
  const components = [component("Zulu"), component("Alpha"), component("ZA"), component("ZB"), component("AA"), component("AB")];
  const nextEnrichment = enrichment(["Zulu", "Alpha"]);
  nextEnrichment.nodeTags.set("Zulu", [{ adapterId: "next", role: "ClientComponent", variant: "app-router", file: "app/Zulu.tsx" }]);
  nextEnrichment.nodeTags.set("Alpha", [{ adapterId: "next", role: "ClientComponent", variant: "app-router", file: "app/Alpha.tsx" }]);
  const analyzer = createClientBoundaryBloatAnalyzer({ thresholds: { maxFanOut: 1, maxDirectChildren: 1, maxReachableNodes: 1, maxReachableDepth: 1 } });
  const run = (orderedComponents: ComponentNode[], orderedEdges: GraphEdge[]) => analyzer.analyze({ ...input(orderedComponents, orderedEdges), thresholds: undefined, enrichment: nextEnrichment }).findings.map((finding) => ({ ...finding, id: "" }));

  const first = run(components, [renders("Zulu", "ZA"), renders("Zulu", "ZB"), renders("Alpha", "AA"), renders("Alpha", "AB")]);
  const second = run([...components].reverse(), [renders("Alpha", "AB"), renders("Alpha", "AA"), renders("Zulu", "ZB"), renders("Zulu", "ZA")]);

  expect(first).toEqual(second);
  expect(first).toHaveLength(2);
  expect(first.map((finding) => finding.fingerprint.structural)).toEqual([...first.map((finding) => finding.fingerprint.structural)].sort());
  expect(Object.keys(first[0]!.evidence).sort()).toEqual(["adapterId", "kind", "metrics", "roles", "ruleId", "subject", "thresholds", "topology"]);
  expect((first[0]!.evidence as any).message).toBeUndefined();
  expect((first[0]!.evidence as any).description).toBeUndefined();
  expect((first[0]!.evidence as any).recommendation).toBeUndefined();
  expect(first[0]!.evidence).toMatchObject({ roles: [{ role: "ClientComponent", variant: "app-router", file: expect.any(String) }] });
});
