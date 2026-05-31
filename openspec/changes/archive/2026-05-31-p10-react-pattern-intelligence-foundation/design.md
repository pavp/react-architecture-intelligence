# Design: P10 React Pattern Intelligence Foundation

## Technical Approach

Extend existing Pass-1 parser and `RepoGraph` with deterministic, framework-neutral pattern facts, then add React catalog scaffolding outside `packages/core`. This design follows `pattern-fact-extraction` and `react-pattern-catalog` specs: P10 is a foundation slice only, emits no findings, and preserves `@rai/core` framework independence.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Fact ownership | Core owns syntax facts only: imports, exports, calls, JSX, hook-like names, member assignments, file-role seeds. | React facts/catalog in core; adapter-only reparse. | Core already parses every file once; syntax facts are source truth. React meaning would violate core boundary, while adapter reparse risks divergence. |
| Fact shape | Add small discriminated `PatternFact` families in `types.ts` with `id`, `kind`, `file`, `span`, and JSON-safe fields. | One loose `Record<string, unknown>` blob. | Typed families keep contracts explainable and sortable without encoding React intent. |
| Graph storage | Add `patternFacts: PatternFact[]` to `RepoGraph`, frozen with existing arrays. | Store facts only in parser result or MCP cache. | Future analyzers need same immutable `AnalysisContext.graph` source as existing analyzers. |
| React catalog | Add catalog scaffolding in a new package `packages/adapter-react` or a React-specific adapter module, not in core. | Put catalog beside core analyzers. | Existing Next adapter proves adapter-to-core dependency direction; catalog can consume generic facts later without core imports back to React. |
| MCP exposure | Do not add broad MCP surface in P10 unless bounded raw graph rows include facts behind existing `raw_graph_query` patterns. | Add `query_patterns` tool now. | P10 has no analyzers/findings; avoid user-facing pattern claims before P11. |

## Data Flow

```text
SourceFile[]
  -> pass1(file, source): components/hooks/imports + patternFacts
  -> buildGraph(): nodes/edges/modules + sorted deduped patternFacts
  -> freezeGraph(): immutable AnalysisContext.graph
  -> future React adapter/analyzers consume generic facts + external catalog
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/core/src/types.ts` | Modify | Add framework-neutral `PatternFact` contracts. |
| `packages/core/src/parse/pass1.ts` | Modify | Extract import/export/call/JSX/hook-like/member/file-role seed facts with stable spans and astPaths. |
| `packages/core/src/parse/pass1.test.ts` | Modify | RED-first table tests for each fact kind, aliases, namespace imports, re-exports, member assignments, and no React-specific names in contracts. |
| `packages/core/src/parse/graph-build.ts` | Modify | Carry facts into graph, sort and dedupe deterministically. |
| `packages/core/src/parse/graph-build.test.ts` | Modify | Assert graph fact persistence, order, dedupe, and frozen behavior through `freezeGraph`. |
| `packages/core/src/graph/repograph.ts` | Modify | Add and freeze `patternFacts`. |
| `packages/core/src/index.ts` | Modify | Export fact types if needed by adapters. |
| `packages/adapter-react/src/catalog.ts` | Create | React catalog scaffolding for compound primitives, no findings. |
| `packages/adapter-react/src/catalog.test.ts` | Create | Verify catalog consumes generic fact kinds and stays outside core. |
| `packages/adapter-react/package.json` | Create | Workspace package depending on `@rai/core`. |
| `fixtures/react/compound-primitives/*` | Create | Modal/Popover examples with static members, namespace imports, and JSX children. |

## Interfaces / Contracts

`PatternFact` kinds stay syntax-level: `import`, `export`, `call`, `jsx`, `hook-call`, `member-assignment`, `file-role-seed`. Each fact MUST include `id`, `kind`, `file`, `span`, and stable string fields only. Examples: import source/specifiers/alias; export local/exported/name/default/reexport source; call callee text; JSX tag/parent tag; member assignment object/property/value; file-role seed from path/directive only. No fact may include React terms such as compound component, provider, controlled, Modal, or Popover.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Pass-1 fact extraction edge cases. | Strict TDD: add failing Vitest cases first, then implement minimal extraction. |
| Unit | Graph fact persistence/freeze/dedupe. | RED/GREEN tests around `buildGraph` and `freezeGraph`. |
| Adapter | React catalog package boundary. | Tests import `@rai/core` types only; no core import of adapter package. |
| Integration | Full suite integrity. | Run `/opt/homebrew/bin/pnpm test`, then typecheck/build/lint in verification phase. |

## Migration / Rollout

No migration required. P10 adds graph facts and catalog scaffolding only; it does not persist findings, write memory, or change existing analyzer output. Rollback is revert of P10 files and fixture additions.

## Open Questions

None.
