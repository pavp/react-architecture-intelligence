# Tasks: More Analyzers Render Overabstraction

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450-650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 render-coupling + shared contracts → PR 2 over-abstraction + registry/integration |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Evidence/config contracts and `react/render-coupling` | PR 1 | Feature/tracker branch starts from `feat/rai-mvp-p0-p3`; include RED/GREEN tests and typecheck. |
| 2 | `react/over-abstraction`, exports, registry, C3 integration | PR 2 | Base PR 1 branch; include RED/GREEN tests and golden check. |

## Phase 1: Shared Contracts (RED → GREEN)

- [x] 1.1 RED: Add failing type/config tests for `RenderCouplingEvidence`, `OverAbstractionEvidence`, and threshold defaults in `packages/core/src/types.ts` and `packages/core/src/config/schema.ts`.
- [x] 1.2 GREEN: Add metric-only evidence variants and conservative `renderCoupling` / `overAbstraction` threshold groups; no parser, import, module, hook-topology, ts-morph, or type-aware fields.
- [x] 1.3 Verify focused: run matching Vitest tests plus `pnpm typecheck` for contract compile safety.

## Phase 2: Render Coupling Analyzer (RED → GREEN)

- [x] 2.1 RED: Create `packages/core/src/analyzers/render-coupling.test.ts` with hand-built `AnalysisContext` cases for fan-in, fan-out, direct children, reachable depth, below-threshold silence, evidence, and deterministic order.
- [x] 2.2 GREEN: Create `packages/core/src/analyzers/render-coupling.ts` using only `ctx.graph.components` and `RepoGraph` `renders` edges; emit `react/render-coupling` opportunity findings with stable fingerprints.
- [x] 2.3 Verify focused: run render-coupling tests and inspect assertions for no import/module/boundary coupling claims.

## Phase 3: Over-Abstraction Analyzer (RED → GREEN)

- [x] 3.1 RED: Create `packages/core/src/analyzers/over-abstraction.test.ts` for prop, hook, child, composition marker, conditional branch thresholds, below-threshold silence, metric-only evidence, and deterministic order.
- [x] 3.2 GREEN: Create `packages/core/src/analyzers/over-abstraction.ts` using only existing `ComponentNode` counts; emit `react/over-abstraction` opportunity findings with stable fingerprints.
- [x] 3.3 Verify focused: run over-abstraction tests and confirm no hook-topology analyzer/naming or parser enrichment appears.

## Phase 4: Registry, Exports, Integration (RED → GREEN)

- [x] 4.1 RED: Extend `packages/core/src/engine/pipeline.test.ts` to prove registry order and C3 diagnostic isolation still allow later analyzer findings.
- [x] 4.2 GREEN: Register analyzers after shared extraction in `packages/core/src/mcp/tools.ts` and export rule IDs/analyzers from `packages/core/src/index.ts` without changing analyzer contract.
- [x] 4.3 Verify focused: run pipeline tests; update `packages/core/src/engine/golden.test.ts` only if conservative defaults intentionally change fixture counts.

## Phase 5: Final Verification

- [x] 5.1 Run `pnpm test` and `pnpm typecheck`.
- [x] 5.2 Review diff for C4a-only scope: exactly `react/render-coupling` and `react/over-abstraction`; no boundary, hook-topology, parser, import/module, or type-aware logic.
