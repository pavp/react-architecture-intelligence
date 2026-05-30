# Tasks: Analyzer Fault Containment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 240-330 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR: pipeline diagnostics + MCP surfacing + tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add guarded analyzer execution, diagnostics, and MCP metadata | PR 1 | Under budget; tests travel with behavior |

## Phase 1: Pipeline RED Tests

- [x] 1.1 RED: In `packages/core/src/engine/pipeline.test.ts`, add A/B/C analyzer-order test: B throws, C still runs, `analyzeRepo` returns normally.
- [x] 1.2 RED: In `pipeline.test.ts`, add persistence-boundary test: failed analyzer writes zero T3 findings, later valid finding persists/presents.
- [x] 1.3 RED: In `pipeline.test.ts`, add deterministic diagnostic test for `TypeError("boom")` with no `stack`, evidence, body, fingerprint, or volatile fields.
- [x] 1.4 Run `pnpm --filter @rai/core test src/engine/pipeline.test.ts`; confirm new tests fail.

## Phase 2: Pipeline GREEN

- [x] 2.1 In `packages/core/src/types.ts`, add `AnalysisDiagnosticKind` and `AnalysisDiagnostic`; do not change `Finding`, `Evidence`, or `isFinding`.
- [x] 2.2 In `packages/core/src/engine/pipeline.ts`, add `diagnostics: AnalysisDiagnostic[]` to `AnalyzeRepoResult`.
- [x] 2.3 In `pipeline.ts`, add `normalizeAnalyzerError(error)` with stable `errorName`/`message`, `NonErrorThrown`, and empty-message fallback `"Analyzer failed"`.
- [x] 2.4 In `pipeline.ts`, replace analyzer `flatMap` with ordered guarded loop using `runAnalyzerSafely`; failed analyzer yields zero findings and one diagnostic.
- [x] 2.5 Run focused pipeline test until GREEN.

## Phase 3: MCP RED/GREEN

- [x] 3.1 RED: In `packages/core/src/mcp/tools.test.ts`, assert `analyze_repo` returns `counts.diagnostics` and `diagnostics[]` for partial failure.
- [x] 3.2 RED: In `tools.test.ts`, assert diagnostics include no finding bodies, evidence payloads, fingerprints, or feedback handles.
- [x] 3.3 RED: In `tools.test.ts`, assert diagnostics do not become `close_session` feedback targets or prompt items.
- [x] 3.4 GREEN: In `packages/core/src/mcp/tools.ts`, add `counts.diagnostics` and `diagnostics: res.diagnostics`; keep `lastPresented` findings-only.
- [x] 3.5 Optional: Update `packages/core/src/mcp/server.ts` description only if current text would mislead clients.
- [x] 3.6 Run `pnpm --filter @rai/core test src/mcp/tools.test.ts` until GREEN.

## Phase 4: REFACTOR and Verify

- [x] 4.1 REFACTOR: Keep helpers local, deterministic, and framework-free; preserve NodeNext `.js` imports.
- [x] 4.2 Verify no diagnostics enter `FindingsStore`, feedback, memory reducer, overlay, `find_shared_opportunities`, or `explain_finding`.
- [x] 4.3 Run `pnpm --filter @rai/core test src/engine/pipeline.test.ts`, `pnpm --filter @rai/core test src/mcp/tools.test.ts`, `pnpm test`, and `pnpm typecheck`.
