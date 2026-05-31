# Apply Progress: p6-cli-adapter-loading

## Mode

Strict TDD — `pnpm test`.

## Workload / PR Boundary

- Delivery: chained PR slice.
- Chain strategy: stacked-to-main.
- Current work unit: Part 3 / PR 3 — docs/status/final task closure.
- Boundary: builds on Part 1 core analyzer result seam and Part 2 Next adapter composition root; closes docs/status/OpenSpec state only, with no production behavior changes.

## Completed Tasks

- [x] 1.1 Add failing core pipeline tests in `packages/core/src/engine/pipeline.test.ts` for legacy `Finding[]`, `{ findings, diagnostics }`, and thrown analyzer diagnostic isolation.
- [x] 1.2 Add failing CLI Next fixture test in `packages/cli/src/cli.test.ts` proving `rai analyze fixtures/next/app-router-bloat` returns `next/*` findings and diagnostics channel shape.
- [x] 1.3 Add failing plain React baseline test in `packages/cli/src/cli.test.ts` proving `fixtures/duplication/buttons` emits no `next/*` findings.
- [x] 1.4 Add failing CLI loader failure test in `packages/cli/src/adapters.test.ts` for unavailable/import-failing `@rai/adapter-next` no-op plus optional `adapter-load-skipped` diagnostic.
- [x] 1.5 Add failing command parity tests for `rai backfill` snapshots and `rai mcp` `analyze_repo` counts/diagnostics matching `rai analyze`.
- [x] 1.6 Add failing framework-free guard coverage proving `FrameworkId`/framework names are banned from `packages/core/src`.
- [x] 2.1 Update `packages/core/src/analyzers/analyzer.ts` with generic `AnalyzerResult` and `framework: string`; remove framework-name literals from core.
- [x] 2.2 Normalize analyzer findings/diagnostics in `packages/core/src/engine/pipeline.ts` without routing diagnostics into findings, feedback, memory overlay, or persistence.
- [x] 2.3 Add `SessionOpts.registryFactory?: (input: { files }) => AnalyzerRegistry` in `packages/core/src/mcp/tools.ts`, pass through `server.ts`, and export types from `packages/core/src/index.ts`.
- [x] 2.4 Tighten `scripts/check-core-framework-free.mjs` to reject framework names/imports and `FrameworkId` leaks in `packages/core/src`.
- [x] 3.1 Create `packages/adapter-next/src/core-adapter.ts` with `createNextCoreAnalyzers({ rootDir, files })` wrapping detection, enrichment, findings, and diagnostics.
- [x] 3.2 Export helper/types from `packages/adapter-next/src/index.ts`.
- [x] 3.3 Create `packages/cli/src/adapters.ts` dynamic loader returning composed `registryFactory` and deterministic load diagnostics or no-op.
- [x] 3.4 Wire `packages/cli/src/cli.ts` so `analyze`, `backfill`, and `mcp` share adapter composition.
- [x] 3.5 Update `packages/cli/package.json` and `packages/cli/tsconfig.json` adapter metadata/import resolution for NodeNext.
- [x] 3.6 Add `fixtures/next/app-router-bloat/` minimal App Router fixture for adapter signals.
- [x] 4.1 Update `docs/superpowers/STATUS.md`, `docs/gaps.md`, `docs/superpowers/plans/p6*.md` if present, and OpenSpec state/spec notes for Slice 6 delivery.
- [x] 4.2 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; record outcomes in apply/verify notes.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 / 2.2 | `packages/core/src/engine/pipeline.test.ts` | Unit/integration | ✅ `pnpm --filter @rai/core test src/engine/pipeline.test.ts src/mcp/tools.test.ts src/analyzers/registry.test.ts` → 65 passed | ✅ Added diagnostic-aware analyzer result tests before production changes; RED failed with spread-on-object errors | ✅ `pnpm --filter @rai/core test src/engine/pipeline.test.ts src/mcp/tools.test.ts src/framework-free-guard.test.ts` → 68 passed | ✅ 3 cases: legacy array + diagnostic-aware result, diagnostic-only no persistence, thrown analyzer + later diagnostic-aware analyzer | ✅ Added `normalizeAnalyzerResult`; post-refactor tests passed |
| 2.3 | `packages/core/src/mcp/tools.test.ts` | Unit/integration | ✅ Same core safety net → 65 passed | ✅ Added registry factory test before seam; RED failed because factory never ran | ✅ Same core seam test command → 68 passed | ✅ Two analyses with different file inputs prove per-analysis factory, not cached registry | ✅ Passed registry factory through `server.ts`; post-refactor tests passed |
| 1.6 / 2.4 | `packages/core/src/framework-free-guard.test.ts` | Unit | N/A (new guard test seam) | ✅ Added guard tests before helper existed; RED failed missing module | ✅ Same core seam test command → 68 passed | ✅ 2 cases: forbidden import/`FrameworkId` rejected and generic `framework: string` allowed | ✅ Extracted guard helper to `scripts/core-framework-free-guard.mjs`; `pnpm lint` passed |
| 1.4 / 3.3 | `packages/cli/src/adapters.test.ts` | Unit | N/A (new loader file) | ✅ Added loader tests before `adapters.ts`; RED failed missing module | ✅ `pnpm --filter @rai/cli test src/adapters.test.ts src/cli.test.ts` → 16 passed | ✅ 4 cases: available adapter, unavailable package no-op, unexpected load diagnostic, per-file registry composition | ✅ Extracted `composeRegistryFactory` and deterministic diagnostic helper; targeted tests passed |
| 3.1 / 3.2 | `packages/adapter-next/src/core-adapter.test.ts` | Integration | ✅ `pnpm --filter @rai/adapter-next test` → 21 passed | ✅ Added core-adapter tests before helper; RED failed missing module | ✅ `pnpm --filter @rai/adapter-next test src/core-adapter.test.ts` → 2 passed | ✅ 2 cases: Next fixture adds adapter findings; non-Next root returns no adapter findings/diagnostics | ✅ Helper returns no analyzers when detection is absent; targeted tests passed |
| 1.2 / 1.3 / 1.5 / 3.4 / 3.6 | `packages/cli/src/cli.test.ts` | Integration | ✅ `pnpm --filter @rai/cli test src/cli.test.ts` → 8 passed | ✅ Added async CLI tests before composition wiring; RED showed baseline-only Next count and missing MCP helper | ✅ `pnpm --filter @rai/cli test src/adapters.test.ts src/cli.test.ts` → 16 passed | ✅ 4 cases: Next fixture analyze, plain React baseline, backfill parity, MCP parity | ✅ Shared `loadInstalledAdapters` across analyze/backfill/mcp; targeted tests passed |
| 3.5 | `packages/cli/tsconfig.json`, `packages/cli/package.json` | Config | ✅ `pnpm typecheck` identified package resolution gap | ✅ Typecheck failed before metadata/path resolution | ✅ `pnpm typecheck` → core, adapter-next, cli clean | ➖ Structural config; one import target only | ✅ Built core + adapter declarations; final typecheck passed |
| 4.1 | Docs/status files | Documentation | ✅ Previous Part 2 verification was green; docs-only changes inspected against current implementation state | ➖ Docs-only closure; no production behavior change or new behavior test required | ✅ Final verification commands pass after docs updates | ➖ Docs-only status sync; triangulation not applicable | ✅ STATUS/gaps/P6 plan/OpenSpec task state aligned with verified implementation |

## Test Summary

- Total tests written: 17 cumulative (Part 1: 7, Part 2: 10, Part 3: docs-only).
- Total tests passing: 286 full suite.
- Layers used: Unit and integration via Vitest.
- Approval tests: None — additive composition and seam work.
- Pure functions created: 4 cumulative (`normalizeAnalyzerResult`, `findCoreFrameworkFreeViolations`, `composeRegistryFactory`, adapter-load diagnostic normalization).

## Verification

- ✅ `pnpm test` — 45 files, 286 tests passing.
- ✅ `pnpm typecheck` — core, adapter-next, cli clean.
- ✅ `pnpm build` — workspace packages built.
- ✅ `pnpm lint` — framework-free guard passed.
- ✅ `git diff --check` — no whitespace errors.

## Deviations from Design

- `packages/cli` declares `@rai/adapter-next` as a workspace dependency instead of optional-only metadata because current pnpm isolated node_modules did not expose optional workspace package for TypeScript/NodeNext resolution. Loader still keeps deterministic no-op behavior for unavailable/import-failing adapter via injectable importer.
- CLI adds `tsconfig` path to adapter declarations so `@rai/adapter-next` resolves during package-local `tsc --noEmit`.

## Issues Found

- Existing isolated pnpm layout did not create direct `node_modules/@rai/*` links at root or package level, so building package declarations before typecheck was needed for adapter import typing.
- Existing unrelated dirty files remain untouched: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `.gga`, `.mcp.json`.
- Part 3 changed docs/status artifacts only and made no production behavior changes.

## Remaining Tasks

- None — apply phase work is ready for full verify/archive. Do not archive in this part.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/core/src/analyzers/analyzer.ts` | Modified | Added `AnalyzerResult`; made `framework` generic string; removed `FrameworkId` union. |
| `packages/core/src/engine/pipeline.ts` | Modified | Normalized analyzer findings + diagnostics; preserved thrown-analyzer isolation. |
| `packages/core/src/engine/pipeline.test.ts` | Modified | Added RED-first result normalization and diagnostics isolation coverage. |
| `packages/core/src/mcp/tools.ts` | Modified | Added `registryFactory` session seam. |
| `packages/core/src/mcp/tools.test.ts` | Modified | Proved per-analysis registry factory receives current files. |
| `packages/core/src/mcp/server.ts` | Modified | Passed registry factory into session construction for MCP parity seam. |
| `packages/core/src/index.ts` | Modified | Exported new analyzer/session seam types and `SourceFile`. |
| `packages/core/src/types.ts` | Modified | Added `adapter-load-skipped` diagnostic variant. |
| `scripts/check-core-framework-free.mjs` | Modified | Delegated guard logic to testable helper. |
| `scripts/core-framework-free-guard.mjs` | Created | Added testable framework-free guard implementation. |
| `packages/core/src/framework-free-guard.test.ts` | Created | Added guard tests for framework imports and `FrameworkId` leaks. |
| `packages/core/src/scripts.d.ts` | Created | Declared script helper import for Vitest/TypeScript. |
| `packages/adapter-next/src/core-adapter.ts` | Created | Added core-compatible Next analyzer composition helper. |
| `packages/adapter-next/src/core-adapter.test.ts` | Created | Added RED-first Next/non-Next helper tests. |
| `packages/adapter-next/src/index.ts` | Modified | Exported `createNextCoreAnalyzers` and input type. |
| `packages/cli/src/adapters.ts` | Created | Added dynamic adapter loader and registry composition helper. |
| `packages/cli/src/adapters.test.ts` | Created | Added RED-first loader tests for available, unavailable, failure, and per-file composition. |
| `packages/cli/src/cli.ts` | Modified | Wired adapter composition into analyze, backfill, and MCP paths. |
| `packages/cli/src/cli.test.ts` | Modified | Added CLI Next fixture, plain React, backfill parity, and MCP parity tests. |
| `packages/cli/package.json` | Modified | Added `@rai/adapter-next` workspace dependency for composition root. |
| `packages/cli/tsconfig.json` | Modified | Added adapter declaration path for package-local typecheck. |
| `fixtures/next/app-router-bloat/` | Created | Added minimal App Router fixture with route coupling and client boundary signals. |
| `pnpm-lock.yaml` | Modified | Recorded CLI adapter workspace dependency. |
| `docs/superpowers/STATUS.md` | Modified | Marked P6 Next adapter complete and updated verification counts. |
| `docs/gaps.md` | Modified | Closed P6 roadmap gap and updated resolution order. |
| `docs/superpowers/plans/p6-adapter-next.md` | Modified | Marked Slice 6 and P6 overall exit criteria complete. |
| `openspec/changes/p6-cli-adapter-loading/tasks.md` | Modified | Marked Part 2 verification and Part 3 docs/status tasks complete. |
| `openspec/changes/p6-cli-adapter-loading/apply-progress.md` | Modified | Merged Part 1, Part 2, and Part 3 apply progress with TDD evidence and verification. |
