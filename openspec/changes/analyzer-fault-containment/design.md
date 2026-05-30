# Design: Analyzer Fault Containment

## Technical Approach

Add crash containment at the pipeline execution seam, where `analyzeRepo` already owns run context, persistence, and presentation. Replace `registry.list().flatMap(...)` with an ordered loop that calls each sync analyzer through a guarded helper. Failed analyzers return zero findings plus one deterministic diagnostic; successful findings continue through existing append-only `FindingsStore` and `overlay` path unchanged. No timeout, worker, async contract, schema, memory, or overlay changes.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Containment boundary | `packages/core/src/engine/pipeline.ts` | Registry wrappers; MCP-only catch | Pipeline has `runId`, config, persistence boundary, and analyzer order; registry should stay catalog-only. |
| Analyzer contract | Preserve `Analyzer.analyze(ctx): Finding[]` | Async analyzer contract; `Promise.race` timeout | Current analyzers are sync; fake timeouts cannot interrupt CPU-hung sync code and would create broad churn. |
| Diagnostics channel | Add `AnalysisDiagnostic` in `packages/core/src/types.ts` | Extend `Finding`/`Evidence`; persist diagnostic rows | Diagnostics are runtime metadata, not CODE-derived findings; this protects memory, overlay, and feedback semantics. |
| MCP surfacing | Add counts/details to `analyze_repo` result only | Include diagnostics in finding tools; make feedback targets | MCP needs debuggability without finding body leakage or feedback pollution. |
| Golden tests | No existing golden fixture update required | Add golden fixture for throwing analyzer | Existing golden tests assert successful corpus determinism; crash determinism belongs in focused pipeline tests. |

## Data Flow

```text
AnalyzerRegistry.list()
  └─ registry order loop
      ├─ runAnalyzerSafely(analyzer, ctx) ── success ── findings[]
      └─ runAnalyzerSafely(analyzer, ctx) ── throw ──── diagnostic

successful findings ── FindingsStore.insert ── overlay ── presented
diagnostics ────────────────────────────────────────────── AnalyzeRepoResult/MCP metadata
```

Diagnostics never enter `FindingsStore`, `FeedbackStore`, `MemoryReader.weight`, `overlay`, `find_shared_opportunities`, `explain_finding`, or `close_session` prompt items.

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/core/src/types.ts` | Modify | Add `AnalysisDiagnosticKind` and `AnalysisDiagnostic`. Do not change `Finding`, `Evidence`, or `isFinding`. |
| `packages/core/src/engine/pipeline.ts` | Modify | Add guarded analyzer loop, local helpers, and `diagnostics` on `AnalyzeRepoResult`. |
| `packages/core/src/mcp/tools.ts` | Modify | Return diagnostic metadata from `Session.analyzeRepo`; keep `lastPresented` findings-only. |
| `packages/core/src/mcp/server.ts` | Modify | No tool schema change required; JSON output naturally includes new fields. Description may mention diagnostics. |
| `packages/core/src/engine/pipeline.test.ts` | Modify | Strict TDD tests for crash containment, persistence boundary, and deterministic diagnostics. |
| `packages/core/src/mcp/tools.test.ts` | Modify | Assert `analyze_repo` diagnostic count/details and no `findings`/`evidence` leakage. |
| `packages/core/src/engine/golden.test.ts` | Keep | No change unless implementation accidentally changes existing golden results. |

## Interfaces / Contracts

```ts
export type AnalysisDiagnosticKind = "analyzer-error";

export interface AnalysisDiagnostic {
  ruleId: string;
  kind: AnalysisDiagnosticKind;
  errorName: string;
  message: string;
}

export interface AnalyzeRepoResult {
  presented: PresentedFinding[];
  diagnostics: AnalysisDiagnostic[];
  analysisVersion: number;
  runId: string;
}
```

`pipeline.ts` helper contracts:

```ts
function runAnalyzerSafely(analyzer: Analyzer, ctx: AnalysisContext): {
  findings: Finding[];
  diagnostic: AnalysisDiagnostic | null;
}
```

`normalizeAnalyzerError(error: unknown)` lives beside the helper. It returns only `errorName` and `message`: for `Error`, use `error.name || error.constructor.name || "Error"` and `error.message`; for non-Error throws, use `"NonErrorThrown"` and `String(error)`. Never include `stack`, causes, file paths, or serialized objects. Empty messages normalize to `"Analyzer failed"`.

MCP `analyze_repo` additions:

```ts
counts: { ..., diagnostics: res.diagnostics.length },
diagnostics: res.diagnostics
```

No finding bodies, evidence payloads, fingerprints, or feedback handles are added to diagnostic entries.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Throwing analyzer does not abort later analyzers | RED: add fake analyzers A/B/C in `pipeline.test.ts`; B throws; assert C ran and result returned. |
| Unit | Persistence boundary | RED: successful finding persists/presents; failed rule has zero DB rows. Then implement guarded loop. |
| Unit | Stable diagnostics | RED: `TypeError("boom")` yields exact `{ ruleId, kind: "analyzer-error", errorName: "TypeError", message: "boom" }`; no stack. |
| Integration | MCP metadata | RED: `tools.test.ts` asserts `counts.diagnostics`, `diagnostics[]`, no `findings`/`evidence`, and diagnostics absent from close-session items. |
| Regression | Existing deterministic golden behavior | Run existing `golden.test.ts`; change only if existing expectations break, which would signal unintended behavior drift. |

Strict TDD sequence: write failing pipeline tests first, run focused Vitest, implement minimal types/helper/loop, add MCP failing tests, implement MCP output, then run `pnpm --filter @rai/core test src/engine/pipeline.test.ts`, `pnpm --filter @rai/core test src/mcp/tools.test.ts`, `pnpm test`, and `pnpm typecheck`.

## Migration / Rollout

No migration required. Result shape is additive. Existing finding persistence, feedback, memory, config schema, and overlay tables remain unchanged.

## Open Questions

None.
