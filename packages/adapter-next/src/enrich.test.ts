import { expect, test } from "vitest";
import { enrichNext, type NextGraphInput } from "./enrich.js";
import type { NextDetection } from "./detect.js";
import type { ComponentNode } from "@rai/core";

const appDetection: NextDetection = {
  adapterId: "next",
  rootDir: ".",
  variant: "app-router",
  signals: {
    packageJson: true,
    nextConfig: false,
    appRouter: true,
    pagesRouter: false,
    appRouteFiles: ["actions/page.tsx", "dashboard/page.tsx", "dashboard/layout.tsx"],
    pagesRouteFiles: [],
  },
};

function component(id: string, file: string, name = id): ComponentNode {
  return {
    id,
    name,
    file,
    kind: "fn",
    exportKind: "default",
    span: { file, start: 0, end: 10, kind: "component", astPath: "module>decl[0]" },
    propNames: [],
    hookCalls: [],
    childComponents: [],
    compositionMarkers: [],
    conditionalBranches: 0,
  };
}

function graph(components: ComponentNode[]): NextGraphInput {
  return Object.freeze({
    components: Object.freeze([...components]),
    hooks: Object.freeze([]),
    modules: Object.freeze(components.map((c) => Object.freeze({ id: c.file, file: c.file, contentHash: c.id }))),
    edges: Object.freeze([]),
  });
}

test("enrichNext tags app-router route, layout, and client/server components", () => {
  const page = component("page", "app/dashboard/page.tsx", "Page");
  const layout = component("layout", "app/dashboard/layout.tsx", "Layout");
  const action = component("action", "app/actions/page.tsx", "ActionPage");

  const enrichment = enrichNext({
    graph: graph([page, layout, action]),
    detection: appDetection,
    files: [
      { file: "app/dashboard/page.tsx", source: "'use client';\nexport default function Page() { return <main />; }" },
      { file: "app/dashboard/layout.tsx", source: "export default function Layout({ children }) { return children; }" },
      { file: "app/actions/page.tsx", source: "'use server';\nexport default function ActionPage() { return <main />; }" },
    ],
  });

  expect(enrichment.nodeTags.get("page")?.map((tag) => tag.role).sort()).toEqual(["ClientComponent", "RouteSegment"]);
  expect(enrichment.nodeTags.get("layout")?.map((tag) => tag.role).sort()).toEqual(["Layout", "ServerComponent"]);
  expect(enrichment.nodeTags.get("action")?.map((tag) => tag.role).sort()).toEqual(["RouteSegment", "ServerAction", "ServerComponent"]);
  expect(enrichment.roleIndex.get("RouteSegment")).toEqual(["action", "page"]);
  expect(enrichment.roleIndex.get("Layout")).toEqual(["layout"]);
  expect(enrichment.roleIndex.get("ServerAction")).toEqual(["action"]);
  expect(enrichment.extraEdges).toEqual([
    { srcId: "layout", dstId: "action", kind: "next/layout-wraps" },
    { srcId: "layout", dstId: "page", kind: "next/layout-wraps" },
  ]);
});

test("enrichNext tags pages-router routes without app server/client tags", () => {
  const detection: NextDetection = {
    adapterId: "next",
    rootDir: ".",
    variant: "pages-router",
    signals: { packageJson: true, nextConfig: false, appRouter: false, pagesRouter: true, appRouteFiles: [], pagesRouteFiles: ["about.tsx"] },
  };
  const about = component("about", "pages/about.tsx", "About");

  const enrichment = enrichNext({ graph: graph([about]), detection, files: [{ file: "pages/about.tsx", source: "export default function About() { return <main />; }" }] });

  expect(enrichment.nodeTags.get("about")?.map((tag) => tag.role)).toEqual(["RouteSegment"]);
  expect(enrichment.roleIndex.get("RouteSegment")).toEqual(["about"]);
});

test("enrichNext does not mutate a frozen graph", () => {
  const page = Object.freeze(component("page", "app/dashboard/page.tsx", "Page"));
  const frozen = graph([page]);

  enrichNext({ graph: frozen, detection: appDetection, files: [{ file: "app/dashboard/page.tsx", source: "export default function Page() { return <main />; }" }] });

  expect(frozen.components[0]).toEqual(page);
  expect(frozen.edges).toEqual([]);
  expect(Object.isFrozen(frozen.components[0])).toBe(true);
});
