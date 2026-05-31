# Exploration: P10 React Pattern Intelligence Foundation

### Current State

RAI already builds a deterministic Pass-1 graph from source text through `oxc-parser`. Current facts include components, hooks, imports by module source only, JSX child component names, hook calls, export kind for admitted components/hooks, composition markers, conditional counts, modules, `renders` edges, and `uses-hook` edges. `EdgeKind` already declares `imports` and `calls`, but graph construction does not build those edges yet; config intentionally rejects convention rules for unsupported edge kinds.

Existing analyzers consume `AnalysisContext.graph` as a frozen, read-only source. Next-specific roles live in `packages/adapter-next` through enrichment, preserving the core boundary. P10 should keep that direction: core may expose deterministic, framework-neutral source facts; React pattern catalog and React interpretation should live in a React-specific adapter/module loaded like the Next adapter, not as implicit intent inside core truth.

### Affected Areas

- `packages/core/src/parse/pass1.ts` — current extraction point for imports, declarations, calls, JSX, hooks, composition markers, and export wrappers.
- `packages/core/src/parse/pass1.test.ts` — nearest strict-TDD seam for fact extraction examples and edge cases.
- `packages/core/src/parse/graph-build.ts` — current name-only edge builder; likely place to carry generic fact collections into `RepoGraph` without analyzer I/O.
- `packages/core/src/graph/repograph.ts` — frozen graph shape must include any new fact indexes deterministically.
- `packages/core/src/types.ts` — current public node, edge, evidence, and graph-related contracts; likely home for framework-neutral `PatternFact`/catalog-facing types.
- `packages/core/src/config/schema.ts` and `packages/core/src/config/resolve.test.ts` — currently reject `imports`/`calls` conventions because edges are not built; P10 may prepare config only after facts/edges exist.
- `packages/core/src/mcp/tools.ts` and `packages/core/src/mcp/tools.test.ts` — `get_node` and `raw_graph_query` currently expose components/hooks/modules/edges; future explainable evidence may need bounded fact inspection.
- `packages/adapter-next/src/enrich.ts` — existing adapter-enrichment pattern for framework/file roles without core coupling.
- `packages/cli/src/adapters.ts` and `packages/adapter-next/src/core-adapter.ts` — existing adapter-loading seam to mirror for a React pattern adapter/catalog.
- `fixtures/` — existing fixtures cover duplication, forwardRef, route handlers, and Next bloat; P10 needs Modal/Popover compound primitive fixtures.
- `openspec/specs/parser-component-detection.md`, `openspec/specs/architecture-analysis.md`, `openspec/specs/analysis-pipeline.md`, `openspec/specs/mcp-tools.md` — specs governing parser admission, analyzer purity, graph facts, and bounded tool surfaces.

### Approaches

1. **Core-only graph expansion** — add React pattern facts and catalog directly to `@rai/core`.
   - Pros: smallest package change; analyzers can consume facts immediately.
   - Cons: conflicts with framework boundary; risks turning core into React-intent layer; harder to reuse for Next/other adapters.
   - Effort: Medium

2. **Framework-neutral facts in core, React catalog in adapter** — extend Pass-1/RepoGraph with deterministic syntax facts (`import`, `export`, `call`, `jsx`, `member`, `fileRoleSeed`) and add React-specific catalog/fixtures outside core.
   - Pros: preserves code-as-truth and core boundary; enables imports/calls conventions later; keeps React interpretation explicit; fits existing Next adapter model.
   - Cons: requires careful type design so facts stay generic but useful; more seams than core-only.
   - Effort: Medium

3. **Adapter-only reparse** — keep core graph unchanged and make a React adapter parse files again for pattern facts.
   - Pros: strongest core isolation; low risk to existing graph contracts.
   - Cons: duplicates parser work; risks divergent source facts; harder to share explainable evidence with MCP/core graph tools.
   - Effort: Medium/High

### Recommendation

Use approach 2. P10 should first add deterministic, framework-neutral pattern facts to the core graph, then place React pattern catalog definitions and Modal/Popover fixtures in a React-specific adapter/module. This gives P11 analyzers stable evidence without letting core infer React intent or own framework catalogs.

Suggested P10 proposal scope:

- Define `PatternFact` or small typed fact families with stable spans, file, astPath, and evidence fields.
- Extract facts for import specifiers/sources, export declarations/specifiers, call expressions, JSX parent/child structure, hook-like calls as names only, static/member assignments, and deterministic file-role seeds from path/directives only.
- Keep facts sorted/deduped, JSON-safe, and frozen with `RepoGraph`.
- Add Modal/Popover compound fixtures covering `Modal.Root`, `Modal.Trigger`, `Modal.Content`, `Popover.Root`, static member assignment, namespace import, and JSX children.
- Add React catalog outside core describing known pattern signatures without emitting findings yet.
- Expose only bounded raw fact inspection if MCP surface is included; no broad analyzer implementation in P10.

### Risks

- Core-boundary drift: React-specific pattern names or intent inside `packages/core` would weaken the established adapter model.
- Fact explosion: raw calls/JSX/member facts can grow quickly; P10 needs bounded shapes and deterministic sorting.
- Resolver overreach: name-only extraction is acceptable for foundation; symbol/type inference should remain deferred unless explicitly designed.
- Export/import ambiguity: existing Pass-1 only records import source and component/hook export kind; richer facts need careful support for default, named, namespace, re-export, and alias forms.
- Static member false meaning: `Modal.Trigger = Trigger` is a syntax fact, not proof of compound-component intent until a later analyzer/catalog matches it.
- Review size: fact extraction plus catalog plus fixtures could approach the 800-line budget; keep P10 foundation single PR only if tasks stay sliced by test-first seams.

### Ready for Proposal

Yes. Tell the user P10 should be proposed as a foundation slice: deterministic source-pattern facts plus React catalog scaffolding and fixtures, with no broad pattern findings yet. Proposal should explicitly preserve `@rai/core` framework neutrality by keeping React catalog/analyzer interpretation outside core while allowing generic syntax facts in core.
