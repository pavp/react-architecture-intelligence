import { pass1 } from "./pass1.js";
import { contentHash } from "../graph/content-hash.js";
import type { RepoGraph } from "../graph/repograph.js";
import type { GraphEdge, ModuleNode, ComponentNode, HookNode, PatternFact, PatternImportFact, PatternJsxAttributeFact } from "../types.js";

export interface SourceFile { file: string; source: string; }

export function buildGraph(files: SourceFile[]): RepoGraph {
  const components: ComponentNode[] = [];
  const hooks: HookNode[] = [];
  const modules: ModuleNode[] = [];
  const edges: GraphEdge[] = [];
  const patternFacts: PatternFact[] = [];

  for (const { file, source } of files) {
    const r = pass1(file, source);
    components.push(...r.components);
    hooks.push(...r.hooks);
    patternFacts.push(...r.patternFacts);
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

  // resolve passes edges from jsx-attribute facts (file-scoped, name-resolved)
  const propsByPair = new Map<string, { srcId: string; dstId: string; props: Set<string> }>();
  for (const f of patternFacts) {
    if (f.kind !== "jsx-attribute") continue;
    const jf = f as PatternJsxAttributeFact;
    if (jf.valueKind === "spread") continue;
    const dstId = byName.get(jf.tag);
    if (!dstId) continue;
    const cands = components.filter((c) => c.file === jf.file && c.childComponents.includes(jf.tag));
    if (cands.length !== 1) continue;
    const srcId = cands[0]!.id;
    if (srcId === dstId) continue;
    const key = `${srcId}|${dstId}`;
    let entry = propsByPair.get(key);
    if (!entry) { entry = { srcId, dstId, props: new Set() }; propsByPair.set(key, entry); }
    entry.props.add(jf.name);
  }
  for (const { srcId, dstId, props } of propsByPair.values()) {
    if (props.size === 0) continue;
    edges.push({ srcId, dstId, kind: "passes", propNames: [...props].sort() });
  }

  const hookByName = new Map<string, string>();
  for (const hook of hooks) if (!hookByName.has(hook.name)) hookByName.set(hook.name, hook.id);

  for (const component of components) {
    for (const hookName of component.hookCalls) {
      const dst = hookByName.get(hookName);
      if (dst) edges.push({ srcId: component.id, dstId: dst, kind: "uses-hook" });
    }
  }

  for (const hook of hooks) {
    for (const hookName of hook.hookCalls) {
      const dst = hookByName.get(hookName);
      if (dst && dst !== hook.id) edges.push({ srcId: hook.id, dstId: dst, kind: "uses-hook" });
    }
  }

  // resolve imports edges from PatternImportFacts (relative-only, fs-free)
  const moduleIdSet = new Set(modules.map((m) => m.id));
  for (const f of patternFacts) {
    if (f.kind !== "import") continue;
    const imp = f as PatternImportFact;
    const dst = resolveImportTarget(imp.file, imp.source, moduleIdSet);
    if (dst && dst !== imp.file) edges.push({ srcId: imp.file, dstId: dst, kind: "imports" });
  }

  return { components, hooks, modules, edges: dedupeEdges(edges).sort(compareEdges), patternFacts: dedupePatternFacts(patternFacts).sort(comparePatternFacts) };
}

// ── Import-edge resolver helpers (POSIX string arithmetic, no fs) ──────────

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i < 0) return ".";
  return p.slice(0, i) || ".";
}

// Returns null when the path escapes above the scan root (over-pop).
function posixNormalizeJoin(base: string, rel: string): string | null {
  const parts = base === "." ? [] : base.split("/");
  for (const seg of rel.split("/")) {
    if (seg === "..") {
      if (parts.length === 0) return null; // escapes scan root → unresolvable
      parts.pop();
    } else if (seg !== ".") {
      parts.push(seg);
    }
  }
  const result = parts.join("/");
  return result.startsWith("./") ? result.slice(2) : result;
}

const IMPORT_EXTS = [".ts", ".tsx", ".js", ".jsx"] as const;

function resolveImportTarget(
  importerId: string,
  source: string,
  moduleIds: Set<string>,
): string | null {
  if (!source.startsWith("./") && !source.startsWith("../")) return null;
  const base = posixDirname(importerId);
  const joined = posixNormalizeJoin(base, source);
  if (joined === null) return null; // path escapes scan root
  // (a) exact match
  if (moduleIds.has(joined)) return joined;
  // (b) joined + extension
  for (const ext of IMPORT_EXTS) {
    const candidate = joined + ext;
    if (moduleIds.has(candidate)) return candidate;
  }
  // (c) joined/index + extension
  for (const ext of IMPORT_EXTS) {
    const candidate = joined + "/index" + ext;
    if (moduleIds.has(candidate)) return candidate;
  }
  return null;
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const byKey = new Map<string, GraphEdge>();
  for (const edge of edges) byKey.set(`${edge.kind}:${edge.srcId}:${edge.dstId}`, edge);
  return [...byKey.values()];
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return a.kind.localeCompare(b.kind) || a.srcId.localeCompare(b.srcId) || a.dstId.localeCompare(b.dstId);
}

function dedupePatternFacts(facts: PatternFact[]): PatternFact[] {
  const byKey = new Map<string, PatternFact>();
  for (const fact of facts) byKey.set(fact.id, fact);
  return [...byKey.values()];
}

function comparePatternFacts(a: PatternFact, b: PatternFact): number {
  return a.id.localeCompare(b.id);
}
