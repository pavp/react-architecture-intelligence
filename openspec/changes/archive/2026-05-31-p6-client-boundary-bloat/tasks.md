# Tasks: P6 Client Boundary Bloat

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 360-520 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; split core evidence/MCP support only if diff exceeds budget |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add typed adapter metric evidence support | PR 1 | `packages/core/src/types.ts`, `packages/core/src/mcp/tools.ts`; tests first |
| 2 | Add Next client boundary analyzer | PR 1 | `packages/adapter-next/src/client-boundary-bloat.*`, exports; tests first |
| 3 | Update rollout docs | PR 1 | Mark P6 Slice 4 complete after verification |

## Phase 1: RED — Core Evidence Seam

- [x] 1.1 Add failing core test proving `AdapterMetricEvidence` is assignable to `Evidence` and `spanFromEvidence` reads `adapter-metric.subject.span`.
- [x] 1.2 Update `packages/core/src/types.ts` with generic `AdapterMetricEvidence`; no Next-specific strings.
- [x] 1.3 Update `packages/core/src/mcp/tools.ts` span extraction for adapter metric evidence; export root types from `packages/core/src/index.ts` only if adapter imports require it.

## Phase 2: RED — Analyzer Behavior

- [x] 2.1 Create failing `packages/adapter-next/src/client-boundary-bloat.test.ts` for oversized App Router `ClientComponent` emitting `next/client-boundary-bloat`.
- [x] 2.2 Add failing below-threshold test asserting no finding when direct children, fan-out, reachable nodes, and depth are within thresholds.
- [x] 2.3 Add failing pages-router and mixed-router tests asserting one `variant-mismatch` diagnostic and zero findings.
- [x] 2.4 Add failing evidence/determinism tests asserting metric-only keys, node IDs, spans, roles, thresholds, topology IDs, exceeded metrics, and stable sort.

## Phase 3: GREEN — Adapter Implementation

- [x] 3.1 Create `packages/adapter-next/src/client-boundary-bloat.ts` with `createClientBoundaryBloatAnalyzer`, default thresholds, result/input types, and `guardNextVariant` wrapper.
- [x] 3.2 Implement deterministic render traversal over existing graph edges for direct child count, fan-out, reachable node count, and reachable depth.
- [x] 3.3 Emit findings only for exceeded thresholds with `adapter-metric` evidence and no persistence writes.
- [x] 3.4 Export analyzer factory and types from `packages/adapter-next/src/index.ts`.

## Phase 4: REFACTOR / Docs / Verification

- [x] 4.1 Refactor fixtures/helpers in `client-boundary-bloat.test.ts` for readability without weakening assertions.
- [x] 4.2 Update `docs/superpowers/plans/p6-adapter-next.md` and `docs/superpowers/STATUS.md` after tests, typecheck, and build pass.
- [x] 4.3 Run `pnpm test`, `pnpm typecheck`, and `pnpm build`; keep tasks checked only after each command passes.
