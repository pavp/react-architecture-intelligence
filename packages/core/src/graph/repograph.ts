import type { ComponentNode, ModuleNode, GraphEdge } from "../types.js";

export interface RepoGraph {
  components: ComponentNode[];
  modules: ModuleNode[];
  edges: GraphEdge[];
}

/** Frozen, read-only view for analyzers (§2.4 isolation). */
export function freezeGraph(g: RepoGraph): Readonly<RepoGraph> {
  g.components.forEach((c) => Object.freeze(c));
  g.edges.forEach((e) => Object.freeze(e));
  g.modules.forEach((m) => Object.freeze(m));
  return Object.freeze({
    components: Object.freeze([...g.components]) as ComponentNode[],
    modules: Object.freeze([...g.modules]) as ModuleNode[],
    edges: Object.freeze([...g.edges]) as GraphEdge[],
  });
}
