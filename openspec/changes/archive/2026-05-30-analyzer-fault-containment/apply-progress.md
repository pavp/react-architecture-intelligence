# Apply Progress: Analyzer Fault Containment

## Status

All apply tasks complete. Strict TDD mode followed.

## Completed Tasks

- [x] 1.1 RED analyzer-order containment test.
- [x] 1.2 RED persistence-boundary test.
- [x] 1.3 RED deterministic diagnostic test.
- [x] 1.4 Focused pipeline RED run confirmed failures.
- [x] 2.1 Added `AnalysisDiagnosticKind` and `AnalysisDiagnostic`.
- [x] 2.2 Added `diagnostics` to `AnalyzeRepoResult`.
- [x] 2.3 Added stable analyzer error normalization.
- [x] 2.4 Replaced analyzer `flatMap` with ordered guarded loop.
- [x] 2.5 Focused pipeline GREEN run passed.
- [x] 3.1 RED MCP diagnostic count/details test.
- [x] 3.2 RED MCP no-leakage test.
- [x] 3.3 RED MCP diagnostics-not-feedback-targets test.
- [x] 3.4 Added MCP `counts.diagnostics` and `diagnostics` output.
- [x] 3.5 Server description unchanged; JSON output stays additive and current text not misleading.
- [x] 3.6 Focused MCP GREEN run passed.
- [x] 4.1 Helpers kept local, deterministic, framework-free; NodeNext `.js` imports preserved.
- [x] 4.2 Diagnostics boundary verified through tests and code path: only successful findings enter `FindingsStore`, memory overlay, `find_shared_opportunities`, `explain_finding`, and `close_session`.
- [x] 4.3 Focused tests, full `pnpm test`, and `pnpm typecheck` passed.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.4 | `packages/core/src/engine/pipeline.test.ts` | Unit | ✅ 4/4 baseline passed | ✅ 3 tests written first; focused run failed with thrown analyzer | ✅ 7/7 focused pipeline tests passed | ✅ 3 cases: order containment, persistence boundary, deterministic diagnostic | ✅ Local helper loop; focused tests stayed green |
| 2.1-2.5 | `packages/core/src/engine/pipeline.test.ts` | Unit | ✅ RED already captured before production changes | ✅ Existing RED tests drove type/result/helper/loop | ✅ 7/7 focused pipeline tests passed | ✅ Error and TypeError paths covered; successful finding path covered | ✅ Helpers kept local and stable-field-only |
| 3.1-3.3 | `packages/core/src/mcp/tools.test.ts` | Integration | ✅ 13/13 baseline passed | ✅ 3 MCP tests written first; focused run failed on missing diagnostics output | ✅ 16/16 focused MCP tests passed after tools output change | ✅ Count/details, no-leakage, close_session boundary covered | ✅ `lastPresented` remains findings-only |
| 3.4-3.6 | `packages/core/src/mcp/tools.test.ts` | Integration | ✅ RED already captured before MCP production change | ✅ Existing RED tests drove output fields | ✅ 16/16 focused MCP tests passed | ✅ Partial failure + successful finding close_session path covered | ✅ Additive response shape only |
| 4.1-4.3 | Focused + full suite | Regression | ✅ Prior focused suites green | ✅ N/A verification task | ✅ `pnpm test` 23 files/126 tests; `pnpm typecheck` clean | ✅ Focused pipeline and MCP suites rerun before full suite | ✅ No schema/memory/overlay/registry edits |

## Test Summary

- **Total tests written**: 6
- **Total tests passing**: 126
- **Layers used**: Unit (3), Integration (3), E2E (0)
- **Approval tests**: None — behavior change covered by new RED tests.
- **Pure functions created**: 1 (`normalizeAnalyzerError`)

## Verification Commands

- `pnpm --filter @rai/core test src/engine/pipeline.test.ts` → 7/7 passed.
- `pnpm --filter @rai/core test src/mcp/tools.test.ts` → 16/16 passed.
- `pnpm test` → 23 files, 126 tests passed.
- `pnpm typecheck` → packages/core and packages/cli clean.

## Deviations from Design

None — implementation matches design. `packages/core/src/mcp/server.ts` was not changed because existing server description does not contradict additive diagnostics metadata.

## Issues Found

None.

## Workload / PR Boundary

- Mode: single PR
- Current work unit: guarded analyzer execution, diagnostics, MCP metadata, tests
- Boundary: pipeline diagnostics and MCP surfacing only
- Estimated review budget impact: low; no chained PR needed
