import type { ComponentNode, ModuleNode, GraphEdge, HookNode } from "../types.js";

export interface RepoGraph {
  components: ComponentNode[];
  hooks: HookNode[];
  modules: ModuleNode[];
  edges: GraphEdge[];
}

/** Frozen, read-only view for analyzers (§2.4 isolation). */
export function freezeGraph(g: RepoGraph): Readonly<RepoGraph> {
  g.components.forEach((c) => Object.freeze(c));
  g.hooks.forEach((h) => Object.freeze(h));
  g.edges.forEach((e) => Object.freeze(e));
  g.modules.forEach((m) => Object.freeze(m));
  return Object.freeze({
    components: Object.freeze([...g.components]) as ComponentNode[],
    hooks: Object.freeze([...g.hooks]) as HookNode[],
    modules: Object.freeze([...g.modules]) as ModuleNode[],
    edges: Object.freeze([...g.edges]) as GraphEdge[],
  });
}
