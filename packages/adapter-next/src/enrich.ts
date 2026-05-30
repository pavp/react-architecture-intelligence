import type { ComponentNode, GraphEdge, HookNode, ModuleNode } from "@rai/core";
import type { NextDetection } from "./detect.js";

export type NextRole = "RouteSegment" | "Layout" | "ClientComponent" | "ServerComponent" | "ServerAction";
export type NextEdgeKind = "next/layout-wraps";

export interface NextTag {
  adapterId: "next";
  role: NextRole;
  variant: NextDetection["variant"];
  file: string;
}

export interface NextEnrichmentEdge {
  srcId: string;
  dstId: string;
  kind: NextEdgeKind;
}

export interface NextGraphInput {
  components: readonly ComponentNode[];
  hooks: readonly HookNode[];
  modules: readonly ModuleNode[];
  edges: readonly GraphEdge[];
}

export interface NextSourceFile {
  file: string;
  source: string;
}

export interface NextGraphEnrichment {
  nodeTags: Map<string, NextTag[]>;
  extraEdges: NextEnrichmentEdge[];
  roleIndex: Map<NextRole, string[]>;
}

export function enrichNext(input: { graph: NextGraphInput; detection: NextDetection; files: NextSourceFile[] }): NextGraphEnrichment {
  const sources = new Map(input.files.map((file) => [normalizePath(file.file), file.source]));
  const nodeTags = new Map<string, NextTag[]>();
  const roleIndex = new Map<NextRole, string[]>();
  const extraEdges: NextEnrichmentEdge[] = [];

  for (const component of input.graph.components) {
    const file = normalizePath(component.file);
    const routeRole = routeRoleFor(file, input.detection);
    if (routeRole) addTag(nodeTags, roleIndex, component.id, tag(routeRole, input.detection, file));

    if (isAppFile(file, input.detection)) {
      const source = sources.get(file) ?? "";
      addTag(nodeTags, roleIndex, component.id, tag(hasDirective(source, "use client") ? "ClientComponent" : "ServerComponent", input.detection, file));
      if (hasDirective(source, "use server")) addTag(nodeTags, roleIndex, component.id, tag("ServerAction", input.detection, file));
    }
  }

  const layouts = idsForRole(roleIndex, "Layout");
  const routes = idsForRole(roleIndex, "RouteSegment");
  for (const layoutId of layouts) {
    for (const routeId of routes) {
      if (layoutId !== routeId) extraEdges.push({ srcId: layoutId, dstId: routeId, kind: "next/layout-wraps" });
    }
  }

  return { nodeTags, extraEdges: extraEdges.sort(compareEdges), roleIndex: sortRoleIndex(roleIndex) };
}

function tag(role: NextRole, detection: NextDetection, file: string): NextTag {
  return { adapterId: "next", role, variant: detection.variant, file };
}

function routeRoleFor(file: string, detection: NextDetection): "RouteSegment" | "Layout" | null {
  if (detection.signals.appRouteFiles.includes(stripPrefix(file, "app/"))) {
    return file.endsWith("/layout.tsx") || file.endsWith("/layout.ts") || file.endsWith("/layout.jsx") || file.endsWith("/layout.js") ? "Layout" : "RouteSegment";
  }
  if (detection.signals.pagesRouteFiles.includes(stripPrefix(file, "pages/"))) return "RouteSegment";
  return null;
}

function isAppFile(file: string, detection: NextDetection): boolean {
  return detection.signals.appRouteFiles.includes(stripPrefix(file, "app/"));
}

function addTag(nodeTags: Map<string, NextTag[]>, roleIndex: Map<NextRole, string[]>, nodeId: string, nextTag: NextTag): void {
  nodeTags.set(nodeId, [...(nodeTags.get(nodeId) ?? []), nextTag]);
  roleIndex.set(nextTag.role, [...(roleIndex.get(nextTag.role) ?? []), nodeId].sort());
}

function idsForRole(roleIndex: Map<NextRole, string[]>, role: NextRole): string[] {
  return roleIndex.get(role) ?? [];
}

function sortRoleIndex(roleIndex: Map<NextRole, string[]>): Map<NextRole, string[]> {
  return new Map([...roleIndex.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([role, ids]) => [role, [...ids].sort()]));
}

function hasDirective(source: string, directive: "use client" | "use server"): boolean {
  return source.split("\n").slice(0, 5).some((line) => new RegExp(`^\\s*['\"]${directive}['\"];?\\s*$`).test(line));
}

function stripPrefix(file: string, prefix: string): string {
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function compareEdges(a: NextEnrichmentEdge, b: NextEnrichmentEdge): number {
  return a.kind.localeCompare(b.kind) || a.srcId.localeCompare(b.srcId) || a.dstId.localeCompare(b.dstId);
}
