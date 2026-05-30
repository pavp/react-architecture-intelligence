# Proposal: More Analyzers Render Overabstraction

## Intent

C4a is first reviewable slice of `more-analyzers`: analyzer value from current graph/component facts, without parser, graph, or type expansion.

## Scope

### In Scope
- Add `react/render-coupling` for honest render topology coupling, not import/module coupling.
- Add `react/over-abstraction` for broad component shape signals from existing `ComponentNode` facts.
- Add typed evidence: fan-in, fan-out, direct children, reachable depth, prop count, hook count, child count, composition markers, conditional branches.
- Add conservative config thresholds if needed for deterministic severity/noise control.
- Register/export both analyzers so CLI/MCP analysis sees them.
- Add tests for findings, evidence, thresholds, deterministic order, and C3 failure containment compatibility.

### Out of Scope
- `react/boundary-violation` analyzer.
- `react/hook-topology` analyzer or hook-topology naming.
- Import/module coupling, import boundary violations, parser/graph enrichment, ts-morph/C2b, type-aware analysis.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `analysis-pipeline`: pipeline includes additional deterministic analyzer rules while preserving registry order and diagnostic isolation.
- `architecture-analysis`: architecture findings expand beyond shared extraction to current-data structural render coupling and over-abstraction.

## Approach

Implement pure sync analyzers over frozen `AnalysisContext`: `ctx.graph.components` and existing `renders` edges. Compute stable metrics, emit deterministic findings with typed evidence, and sort/fingerprint consistently. No file reads, type queries, memory writes, or graph facts. C3 diagnostics already isolate analyzer failures.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/analyzers/` | New | Analyzers/tests. |
| `packages/core/src/types.ts` | Modified | Evidence union variants. |
| `packages/core/src/config/schema.ts` | Modified | Optional conservative thresholds. |
| `packages/core/src/analyzers/registry.ts` | Modified | Analyzer registration/export path. |
| `packages/core/src/engine/*.test.ts` | Modified | Integration/golden assertions if counts change. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Review size exceeds 400 lines | Medium | Keep C4a to two pure analyzers; defer boundary and hooks. |
| Rule names overpromise | Low | Use `render-coupling`, explicitly exclude module/import coupling. |
| Evidence contract churn | Medium | Use metric-only typed evidence, no prose payloads. |
| Noise from thresholds | Medium | Conservative defaults plus focused below-threshold tests. |

## Rollback Plan

Remove new analyzer registration/exports, files, evidence variants, config thresholds, and tests. Parser, graph, pipeline, MCP, and memory semantics remain unchanged.

## Dependencies

- `ComponentNode` facts and `renders` graph edges.
- C3 analyzer diagnostic isolation.

## Success Criteria

- [ ] `react/render-coupling` emits deterministic findings for fan-in/fan-out/direct children/depth cases only.
- [ ] `react/over-abstraction` emits deterministic findings from current structural counts only.
- [ ] No parser enrichment, ts-morph/C2b, import coupling, or type-aware logic appears.
- [ ] Focused tests, `pnpm test`, and `pnpm typecheck` pass.
