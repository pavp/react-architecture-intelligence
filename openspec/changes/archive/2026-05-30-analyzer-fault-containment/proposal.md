# Proposal: Analyzer Fault Containment

## Intent

Prevent one throwing analyzer from aborting repository analysis. C3 delivers crash isolation with deterministic diagnostics so remaining analyzers complete and successful findings persist without polluting findings, memory, or overlay semantics.

## Scope

### In Scope
- Pipeline-level analyzer crash containment with ordered execution.
- Deterministic diagnostic output for failed analyzers, separate from findings.
- Successful analyzer findings continue through existing T3 persistence and presentation.
- MCP/session result surfaces include diagnostic counts/details without finding bodies.

### Out of Scope
- True hard timeout or worker-thread interruptibility for CPU-hung sync analyzers.
- `Promise.race` timeout that pretends to preempt sync infinite loops.
- New async analyzer contract or worker serialization design.
- T3 writes, feedback records, memory reducer input, or overlay entries for failed analyzers.

## Capabilities

### New Capabilities
- `analysis-pipeline`: analyzer execution ordering, partial failure diagnostics, and persistence boundaries.

### Modified Capabilities
- `mcp-tools`: expose analyze diagnostics/counts from `analyze_repo` without turning diagnostics into findings or feedback targets.

## Approach

Replace pipeline `flatMap(a.analyze(ctx))` with an ordered loop plus a small guarded helper. Each analyzer runs under `try/catch`; on throw, it contributes zero findings and one stable diagnostic such as `{ ruleId, kind: "analyzer-error", errorName, message }`. Diagnostics exclude stack traces and volatile paths. Remaining analyzers continue in registry order. Only findings returned by successful analyzers enter existing append-only T3 persistence and memory/overlay presentation. Failed analyzer diagnostics travel on a separate `diagnostics` channel through `AnalyzeRepoResult` and MCP output.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/engine/pipeline.ts` | Modified | Ordered guarded analyzer execution and diagnostics aggregation. |
| `packages/core/src/types.ts` | Modified | Add result diagnostic type, not finding/evidence expansion. |
| `packages/core/src/mcp/tools.ts` | Modified | Return diagnostic counts/details for `analyze_repo`. |
| `packages/core/src/engine/pipeline.test.ts` | Modified | Strict TDD cases for throw containment, persistence, determinism. |
| `packages/core/src/engine/golden.test.ts` | Modified | Stable partial-failure replay if needed. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Timeout scope confusion | Med | Explicit non-goal; worker design follow-up. |
| Non-deterministic diagnostics | Med | Strip stacks/paths; assert stable fields. |
| Integrity pollution | Low | Separate diagnostics channel; no T3 writes for failures. |

## Rollback Plan

Revert pipeline loop/type/MCP changes and tests. Previous behavior restores fail-fast analyzer execution with no diagnostic channel.

## Dependencies

- Existing sync `Analyzer.analyze(ctx): Finding[]` contract remains unchanged.

## Success Criteria

- [ ] Throwing analyzer does not throw from `analyzeRepo`.
- [ ] Later analyzers still run in registry order.
- [ ] Successful findings persist; failed analyzers write no T3 findings.
- [ ] Diagnostics are deterministic and separate from findings/memory/overlay.
- [ ] `analyze_repo` exposes diagnostic summary without finding-body leakage.
