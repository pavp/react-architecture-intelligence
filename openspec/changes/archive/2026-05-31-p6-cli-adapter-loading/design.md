# Design: P6 CLI Adapter Loading

## Technical Approach

Make `packages/cli` the adapter composition root. `@rai/core` exposes only generic analyzer injection plus diagnostic-aware result normalization; `@rai/adapter-next` exports core-compatible analyzer wrappers that close over `rootDir` and `files`. `rai analyze`, `rai backfill`, and `rai mcp` all create sessions through the same loaded composition so counts, snapshots, and MCP diagnostics stay aligned.

## Architecture Decisions

| Topic | Options | Decision | Rationale |
|------|---------|----------|-----------|
| Core seam | Mutate private registry vs public session registry factory | Add `SessionOpts.registryFactory?: (input: { files }) => AnalyzerRegistry` and keep default when omitted | Per-analysis factory lets adapter wrappers close over current files without framework imports or private-field mutation. |
| Analyzer output | Keep `Finding[]` only vs union output | Add `AnalyzerResult = Finding[] \| { findings: Finding[]; diagnostics?: AnalysisDiagnostic[] }` | Existing analyzers remain valid; adapter variant diagnostics flow through `diagnostics`, not findings or persistence. |
| Loader behavior | Static import vs optional dynamic import | CLI uses async dynamic import helper, returning no-op composer when package is absent | Supports installed-adapter semantics and keeps core dependency-free. Unexpected load failures become deterministic `adapter-load-skipped` diagnostics if reported. |
| Command parity | Analyze only vs all commands | Include `rai backfill` and `rai mcp` parity in this slice | Backfill snapshots and MCP counts must match normal analysis; session factory makes parity small. |
| Framework guard | Current weak string check vs expanded guard | Strengthen `scripts/check-core-framework-free.mjs` to ban framework names/imports in `packages/core/src` | Current `FrameworkId` literal union leaks framework names; replace with generic `string`/branded-free type. |

## Data Flow

```text
CLI command ──await loadInstalledAdapters()──→ createSession({ registryFactory })
     │                                             │
readSources(root) ───────────────────────────────→ analyzeRepo(files)
                                                   │
core builds graph → registryFactory(files) → baseline + adapter analyzers
                                                   │
pipeline normalizes findings + diagnostics → T3/snapshot only for findings
                                                   │
existing analyze_repo envelope: counts, topFingerprints, diagnostics
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/analyzers/analyzer.ts` | Modify | Generic framework string plus `AnalyzerResult` union. |
| `packages/core/src/engine/pipeline.ts` | Modify | Normalize legacy arrays and `{ findings, diagnostics }`; thrown analyzers still emit stable `analyzer-error`. |
| `packages/core/src/mcp/tools.ts` | Modify | `SessionOpts.registryFactory`; `analyzeRepo` builds registry from current files. |
| `packages/core/src/mcp/server.ts` | Modify | Accept/pass `registryFactory` for MCP parity. |
| `packages/core/src/index.ts` | Modify | Export new result/factory types. |
| `packages/adapter-next/src/core-adapter.ts` | Create | `createNextCoreAnalyzers({ rootDir, files })` wraps detection, enrichment, and existing Next analyzers. |
| `packages/adapter-next/src/index.ts` | Modify | Export composition helper and types. |
| `packages/cli/src/adapters.ts` | Create | Dynamic loader returning `{ registryFactory, diagnostics }` no-op on unavailable package. |
| `packages/cli/src/cli.ts` | Modify | Make command paths await loader; reuse for analyze/backfill/mcp. |
| `packages/cli/package.json` | Modify | Declare supported optional/workspace adapter dependency metadata as needed for NodeNext dynamic import. |
| `packages/cli/src/cli.test.ts` | Modify | Add Next fixture and plain React baseline coverage. |
| `fixtures/next/app-router-bloat/` | Create | Minimal App Router fixture with client boundary/route coupling signal. |
| `scripts/check-core-framework-free.mjs` | Modify | Guard framework names/imports in core. |
| `docs/superpowers/STATUS.md`, `docs/gaps.md` | Modify | Mark Slice 6 CLI loading status and close/update gap. |

## Interfaces / Contracts

```ts
export type AnalyzerResult = Finding[] | { findings: Finding[]; diagnostics?: AnalysisDiagnostic[] };
export interface Analyzer { ruleId: string; framework: string; analyze(ctx: AnalysisContext): AnalyzerResult; }
export interface SessionOpts { config: RaiConfig; dbPath?: string; registryFactory?: (input: { files: SourceFile[] }) => AnalyzerRegistry; }
```

`createNextCoreAnalyzers({ rootDir, files })` returns `Analyzer[]`. Wrappers call `detectNext(rootDir)`; if `null`, return no findings and no diagnostics so plain React stays baseline-only. When detection exists, wrappers call `enrichNext({ graph: ctx.graph, detection, files })`, then existing Next analyzers. Diagnostics are returned unchanged through core normalization.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Analyzer result normalization | Core pipeline test for legacy `Finding[]`, `{ findings, diagnostics }`, and throw isolation order. |
| Unit | Loader failure | CLI adapter-loader test mocks unavailable/import failure and asserts deterministic no-op/diagnostic. |
| Integration | `rai analyze` Next fixture | CLI test expects `next/*` finding count and diagnostics channel behavior. |
| Integration | Plain React baseline | Existing buttons fixture has no `next/*` findings and no adapter persistence writes. |
| Integration | Backfill/MCP parity | Backfill snapshot count includes adapter findings; MCP `analyze_repo` returns same counts/diagnostics shape. |

## Migration / Rollout

No data migration required. Existing findings remain append-only; adapter findings enter the same T3/snapshot paths only when analyzers produce findings.

## Verification Commands

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
node packages/cli/dist/index.js analyze fixtures/next/app-router-bloat
node packages/cli/dist/index.js analyze fixtures/duplication/buttons
```

## Open Questions

None.
