# Design: More Analyzers Render Overabstraction

## Technical Approach

Add two pure synchronous analyzers under the existing `Analyzer` seam: `react/render-coupling` computes graph topology metrics from `ctx.graph.edges` where `kind === "renders"`; `react/over-abstraction` computes structural counts from each `ComponentNode`. Both emit `opportunity` findings with typed, metric-only evidence and stable fingerprints. No parser, graph builder, type resolver, memory, or pipeline contract changes are required. Registration uses the existing `AnalyzerRegistry` insertion order, while C3 failure containment stays in `analyzeRepo()`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|-------------------------|-----------|
| Rule scope | Use exact rule IDs `react/render-coupling` and `react/over-abstraction`. | Reuse generic `react/coupling` or add `react/hook-topology`. | Names match observable facts and avoid overclaiming import/module coupling or hook topology. |
| Inputs | Use only `ComponentNode` arrays and `renders` edges. | Read imports, call `ctx.types.typeOf()`, or enrich Pass-1/graph facts. | Specs require C4a value from current data only; keeping analyzers pure protects deterministic boundaries. |
| Evidence | Add `RenderCouplingEvidence` and `OverAbstractionEvidence` to `Evidence`. | Store prose summaries or reuse shared-extraction evidence. | Typed metric evidence keeps `explainFinding()` grounding fields honest and persisted JSON stable. |
| Threshold config | Add minimal `renderCoupling` and `overAbstraction` config groups with conservative defaults. | Hard-code thresholds or place all knobs under `shared`. | Matches current `ConfigSchema` pattern while allowing tests and users to tune noise without schema churn. |
| Failure handling | Rely on existing `runAnalyzerSafely()`. | Add analyzer-specific try/catch or diagnostics. | C3 already isolates analyzer failures in registry order; special casing would duplicate policy. |

## Data Flow

```text
Source files -> buildGraph/pass1 -> frozen RepoGraph
  -> AnalyzerRegistry: sharedExtraction -> renderCoupling -> overAbstraction
  -> analyzeRepo guarded execution -> FindingsStore JSON evidence -> overlay/presentation
```

`renderCoupling` builds deterministic adjacency maps sorted by component id/name/file, then calculates fan-in, fan-out, direct children, and reachable depth over `renders` edges. `overAbstraction` walks sorted components and counts props, hooks, child components, composition markers, and conditional branches.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/analyzers/render-coupling.ts` | Create | Pure analyzer, topology metrics, severity/fingerprint helpers. |
| `packages/core/src/analyzers/render-coupling.test.ts` | Create | Threshold, evidence, depth, order, and determinism tests. |
| `packages/core/src/analyzers/over-abstraction.ts` | Create | Pure analyzer over `ComponentNode` structural counts. |
| `packages/core/src/analyzers/over-abstraction.test.ts` | Create | Count thresholds, below-threshold silence, evidence, determinism tests. |
| `packages/core/src/types.ts` | Modify | Add evidence interfaces and union variants. |
| `packages/core/src/config/schema.ts` | Modify | Add minimal threshold config groups and defaults. |
| `packages/core/src/mcp/tools.ts` | Modify | Register new analyzers after `sharedExtraction`. |
| `packages/core/src/index.ts` | Modify | Export analyzers and rule IDs. |
| `packages/core/src/engine/pipeline.test.ts` | Modify | Assert guarded execution still returns later analyzer findings. |
| `packages/core/src/engine/golden.test.ts` | Modify | Update counts only if default thresholds affect existing fixtures. |

## Interfaces / Contracts

Evidence shapes:

```ts
interface RenderCouplingEvidence {
  kind: "render-coupling";
  component: { name: string; span: Span; fingerprint: string };
  fanIn: number; fanOut: number; directChildren: number; reachableDepth: number;
}

interface OverAbstractionEvidence {
  kind: "over-abstraction";
  component: { name: string; span: Span; fingerprint: string };
  propCount: number; hookCount: number; childCount: number;
  compositionMarkerCount: number; conditionalBranchCount: number;
}
```

Fingerprints should hash `ruleId + component structural fingerprint + sorted breached metric names`, with nominal/positional derived from component name/file. Output order sorts by `fingerprint.structural`, matching pipeline expectations.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Both analyzer metrics, thresholds, evidence, fingerprints, deterministic order. | Hand-built `AnalysisContext` fixtures, no parser dependency. |
| Integration | Registration order and C3 containment compatibility. | Extend pipeline/session tests with failing analyzer before new successful analyzer. |
| E2E | CLI/MCP sees registered analyzers. | Existing `pnpm test`, `pnpm typecheck`; update golden only for intentional count changes. |

## Migration / Rollout

No migration required. Findings are append-only with new rule IDs and evidence `kind` values. Rollback removes registration, exports, config groups, evidence variants, analyzer files, and tests.

## Open Questions

- [ ] None.
