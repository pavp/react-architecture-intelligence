# Apply Progress: p6-cli-adapter-loading

## Mode

Strict TDD — `pnpm test`.

## Workload / PR Boundary

- Delivery: chained PR slice.
- Chain strategy: stacked-to-main.
- Current work unit: Part 1 / PR 1 — core seam + core tests.
- Boundary: core analyzer result seam, session registry factory seam, diagnostic normalization, framework-free guard. CLI dynamic adapter loading, Next core adapter helper, fixtures, and command parity deferred to next PR slice.

## Completed Tasks

- [x] 1.1 Add failing core pipeline tests in `packages/core/src/engine/pipeline.test.ts` for legacy `Finding[]`, `{ findings, diagnostics }`, and thrown analyzer diagnostic isolation.
- [x] 1.6 Add failing framework-free guard coverage proving `FrameworkId`/framework names are banned from `packages/core/src`.
- [x] 2.1 Update `packages/core/src/analyzers/analyzer.ts` with generic `AnalyzerResult` and `framework: string`; remove framework-name literals from core.
- [x] 2.2 Normalize analyzer findings/diagnostics in `packages/core/src/engine/pipeline.ts` without routing diagnostics into findings, feedback, memory overlay, or persistence.
- [x] 2.3 Add `SessionOpts.registryFactory?: (input: { files }) => AnalyzerRegistry` in `packages/core/src/mcp/tools.ts`, pass through `server.ts`, and export types from `packages/core/src/index.ts`.
- [x] 2.4 Tighten `scripts/check-core-framework-free.mjs` to reject framework names/imports and `FrameworkId` leaks in `packages/core/src`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 / 2.2 | `packages/core/src/engine/pipeline.test.ts` | Unit/integration | ✅ `pnpm --filter @rai/core test src/engine/pipeline.test.ts src/mcp/tools.test.ts src/analyzers/registry.test.ts` → 65 passed | ✅ Added diagnostic-aware analyzer result tests before production changes; RED failed with spread-on-object errors | ✅ `pnpm --filter @rai/core test src/engine/pipeline.test.ts src/mcp/tools.test.ts src/framework-free-guard.test.ts` → 68 passed | ✅ 3 cases: legacy array + diagnostic-aware result, diagnostic-only no persistence, thrown analyzer + later diagnostic-aware analyzer | ✅ Added `normalizeAnalyzerResult`; post-refactor tests passed |
| 2.3 | `packages/core/src/mcp/tools.test.ts` | Unit/integration | ✅ Same core safety net → 65 passed | ✅ Added registry factory test before seam; RED failed because factory never ran | ✅ Same core seam test command → 68 passed | ✅ Two analyses with different file inputs prove per-analysis factory, not cached registry | ✅ Passed registry factory through `server.ts`; post-refactor tests passed |
| 1.6 / 2.4 | `packages/core/src/framework-free-guard.test.ts` | Unit | N/A (new guard test seam) | ✅ Added guard tests before helper existed; RED failed missing module | ✅ Same core seam test command → 68 passed | ✅ 2 cases: forbidden import/`FrameworkId` rejected and generic `framework: string` allowed | ✅ Extracted guard helper to `scripts/core-framework-free-guard.mjs`; `pnpm lint` passed |

## Test Summary

- Total tests written: 7.
- Total tests passing: 276 full suite.
- Layers used: Unit/integration via Vitest.
- Approval tests: None — additive seam work.
- Pure functions created: 2 (`normalizeAnalyzerResult`, `findCoreFrameworkFreeViolations`).

## Verification

- ✅ `pnpm test` — 43 files, 276 tests passing.
- ✅ `pnpm typecheck` — core, cli, adapter-next clean.
- ✅ `pnpm build` — workspace packages built.
- ✅ `pnpm lint` — framework-free guard passed.
- ✅ `git diff --check` — no whitespace errors.

## Deviations from Design

None for assigned Part 1. CLI composition, Next helper, fixtures, and command parity are intentionally deferred by PR boundary.

## Issues Found

None.

## Remaining Tasks

- [ ] 1.2 Add CLI Next fixture RED test.
- [ ] 1.3 Add plain React baseline RED test.
- [ ] 1.4 Add CLI loader failure RED test.
- [ ] 1.5 Add command parity RED tests.
- [ ] 3.1-3.6 Implement CLI/adapter composition slice.
- [ ] 4.1-4.2 Docs/status and final verification slice.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/core/src/analyzers/analyzer.ts` | Modified | Added `AnalyzerResult`; made `framework` generic string; removed `FrameworkId` union. |
| `packages/core/src/engine/pipeline.ts` | Modified | Normalized analyzer findings + diagnostics; preserved thrown-analyzer isolation. |
| `packages/core/src/engine/pipeline.test.ts` | Modified | Added RED-first result normalization and diagnostics isolation coverage. |
| `packages/core/src/mcp/tools.ts` | Modified | Added `registryFactory` session seam. |
| `packages/core/src/mcp/tools.test.ts` | Modified | Proved per-analysis registry factory receives current files. |
| `packages/core/src/mcp/server.ts` | Modified | Passed registry factory into session construction for MCP parity seam. |
| `packages/core/src/index.ts` | Modified | Exported new analyzer/session seam types. |
| `scripts/check-core-framework-free.mjs` | Modified | Delegated guard logic to testable helper. |
| `scripts/core-framework-free-guard.mjs` | Created | Added testable framework-free guard implementation. |
| `packages/core/src/framework-free-guard.test.ts` | Created | Added guard tests for framework imports and `FrameworkId` leaks. |
| `packages/core/src/scripts.d.ts` | Created | Declared script helper import for Vitest/TypeScript. |
| `openspec/changes/p6-cli-adapter-loading/tasks.md` | Modified | Marked Part 1 completed tasks and resolved chain strategy to stacked-to-main. |
