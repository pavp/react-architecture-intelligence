import { pass1 } from "./pass1.js";
import { contentHash } from "../graph/content-hash.js";
import type { RepoGraph } from "../graph/repograph.js";
import type { GraphEdge, ModuleNode, ComponentNode } from "../types.js";

export interface SourceFile { file: string; source: string; }

export function buildGraph(files: SourceFile[]): RepoGraph {
  const components: ComponentNode[] = [];
  const modules: ModuleNode[] = [];
  const edges: GraphEdge[] = [];

  for (const { file, source } of files) {
    const r = pass1(file, source);
    components.push(...r.components);
    modules.push({ id: file, file, contentHash: contentHash(source) });
  }

  // resolve renders edges by component NAME (syntactic — Pass-1 has no symbol table)
  const byName = new Map<string, string>(); // name -> first component id
  for (const c of components) if (!byName.has(c.name)) byName.set(c.name, c.id);

  for (const c of components) {
    for (const childName of c.childComponents) {
      const dst = byName.get(childName);
      if (dst && dst !== c.id) edges.push({ srcId: c.id, dstId: dst, kind: "renders" });
    }
  }

  return { components, modules, edges };
}
