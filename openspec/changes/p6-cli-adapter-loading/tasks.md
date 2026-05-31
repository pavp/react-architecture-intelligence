# Tasks: P6 CLI Adapter Loading

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700-950 |
| 800-line budget risk | Medium |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 core seam + RED tests -> PR 2 CLI/adapter composition -> PR 3 docs/status/OpenSpec |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core analyzer-result seam and guard tightening | PR 1 | Keep core framework-free; includes RED/GREEN core tests. |
| 2 | CLI adapter loading, Next helper, command parity | PR 2 | Depends on PR 1; includes CLI integration tests. |
| 3 | Docs/status/gaps/plan/OpenSpec updates | PR 3 | Can follow PR 2; verification bundled. |

## Phase 1: RED Tests

- [x] 1.1 Add failing core pipeline tests in `packages/core/src/engine/pipeline.test.ts` for legacy `Finding[]`, `{ findings, diagnostics }`, and thrown analyzer diagnostic isolation.
- [ ] 1.2 Add failing CLI Next fixture test in `packages/cli/src/cli.test.ts` proving `rai analyze fixtures/next/app-router-bloat` returns `next/*` findings and diagnostics channel shape.
- [ ] 1.3 Add failing plain React baseline test in `packages/cli/src/cli.test.ts` proving `fixtures/duplication/buttons` emits no `next/*` findings.
- [ ] 1.4 Add failing CLI loader failure test in `packages/cli/src/adapters.test.ts` for unavailable/import-failing `@rai/adapter-next` no-op plus optional `adapter-load-skipped` diagnostic.
- [ ] 1.5 Add failing command parity tests for `rai backfill` snapshots and `rai mcp` `analyze_repo` counts/diagnostics matching `rai analyze`.
- [x] 1.6 Add failing framework-free guard coverage proving `FrameworkId`/framework names are banned from `packages/core/src`.

## Phase 2: Core Seam GREEN

- [x] 2.1 Update `packages/core/src/analyzers/analyzer.ts` with generic `AnalyzerResult` and `framework: string`; remove framework-name literals from core.
- [x] 2.2 Normalize analyzer findings/diagnostics in `packages/core/src/engine/pipeline.ts` without routing diagnostics into findings, feedback, memory overlay, or persistence.
- [x] 2.3 Add `SessionOpts.registryFactory?: (input: { files }) => AnalyzerRegistry` in `packages/core/src/mcp/tools.ts`, pass through `server.ts`, and export types from `packages/core/src/index.ts`.
- [x] 2.4 Tighten `scripts/check-core-framework-free.mjs` to reject framework names/imports and `FrameworkId` leaks in `packages/core/src`.

## Phase 3: CLI / Adapter GREEN

- [ ] 3.1 Create `packages/adapter-next/src/core-adapter.ts` with `createNextCoreAnalyzers({ rootDir, files })` wrapping detection, enrichment, findings, and diagnostics.
- [ ] 3.2 Export helper/types from `packages/adapter-next/src/index.ts`.
- [ ] 3.3 Create `packages/cli/src/adapters.ts` dynamic loader returning composed `registryFactory` and deterministic load diagnostics or no-op.
- [ ] 3.4 Wire `packages/cli/src/cli.ts` so `analyze`, `backfill`, and `mcp` share adapter composition.
- [ ] 3.5 Update `packages/cli/package.json` optional/workspace adapter metadata if NodeNext import resolution needs it.
- [ ] 3.6 Add `fixtures/next/app-router-bloat/` minimal App Router fixture for adapter signals.

## Phase 4: Docs / OpenSpec / Verification

- [ ] 4.1 Update `docs/superpowers/STATUS.md`, `docs/gaps.md`, `docs/superpowers/plans/p6*.md` if present, and OpenSpec state/spec notes for Slice 6 delivery.
- [ ] 4.2 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; record outcomes in apply/verify notes.
