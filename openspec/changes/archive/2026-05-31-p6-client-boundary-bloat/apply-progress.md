# Apply Progress: P6 Client Boundary Bloat

## Status

Ready for verify — all planned tasks completed in Strict TDD mode.

## Completed Tasks

- [x] 1.1 Add failing core test proving `AdapterMetricEvidence` is assignable to `Evidence` and `spanFromEvidence` reads `adapter-metric.subject.span`.
- [x] 1.2 Update `packages/core/src/types.ts` with generic `AdapterMetricEvidence`; no Next-specific strings.
- [x] 1.3 Update `packages/core/src/mcp/tools.ts` span extraction for adapter metric evidence; export root types from `packages/core/src/index.ts` only if adapter imports require it.
- [x] 2.1 Create failing `packages/adapter-next/src/client-boundary-bloat.test.ts` for oversized App Router `ClientComponent` emitting `next/client-boundary-bloat`.
- [x] 2.2 Add failing below-threshold test asserting no finding when direct children, fan-out, reachable nodes, and depth are within thresholds.
- [x] 2.3 Add failing pages-router and mixed-router tests asserting one `variant-mismatch` diagnostic and zero findings.
- [x] 2.4 Add failing evidence/determinism tests asserting metric-only keys, node IDs, spans, roles, thresholds, topology IDs, exceeded metrics, and stable sort.
- [x] 3.1 Create `packages/adapter-next/src/client-boundary-bloat.ts` with `createClientBoundaryBloatAnalyzer`, default thresholds, result/input types, and `guardNextVariant` wrapper.
- [x] 3.2 Implement deterministic render traversal over existing graph edges for direct child count, fan-out, reachable node count, and reachable depth.
- [x] 3.3 Emit findings only for exceeded thresholds with `adapter-metric` evidence and no persistence writes.
- [x] 3.4 Export analyzer factory and types from `packages/adapter-next/src/index.ts`.
- [x] 4.1 Refactor fixtures/helpers in `client-boundary-bloat.test.ts` for readability without weakening assertions.
- [x] 4.2 Update `docs/superpowers/plans/p6-adapter-next.md` and `docs/superpowers/STATUS.md` after tests, typecheck, and build pass.
- [x] 4.3 Run `pnpm test`, `pnpm typecheck`, and `pnpm build`; keep tasks checked only after each command passes.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `packages/core/src/types.test.ts`, `packages/core/src/mcp/tools.test.ts` | Unit | ✅ `types.test.ts` 3/3, `tools.test.ts` 45/45 | ✅ `tools.test.ts` failed on `adapter-metric` span lookup | ✅ `types.test.ts` 3/3, `tools.test.ts` 46/46 | ✅ assignability + span lookup cases | ✅ targeted core tests still passing |
| 1.2 | `packages/core/src/types.test.ts` | Unit | ✅ covered by 1.1 safety net | ✅ adapter evidence type used before union support | ✅ `types.test.ts` 3/3 | ➖ Structural type addition; assignability test covers union | ✅ targeted core tests still passing |
| 1.3 | `packages/core/src/mcp/tools.test.ts` | Unit | ✅ covered by 1.1 safety net | ✅ `spanFromEvidence` crashed on adapter metric evidence | ✅ `tools.test.ts` 46/46 | ✅ existing boundary/render/hook span paths retained, adapter span added | ✅ targeted core tests still passing |
| 2.1 | `packages/adapter-next/src/client-boundary-bloat.test.ts` | Unit | ✅ `enrich.test.ts` + `variant-guard.test.ts` 6/6 | ✅ missing analyzer module failed before implementation | ✅ analyzer test 4/4 | ✅ oversized + silent + guard + determinism cases | ✅ adapter tests 10/10 |
| 2.2 | `packages/adapter-next/src/client-boundary-bloat.test.ts` | Unit | ✅ adapter safety net 6/6 | ✅ below-threshold case written before implementation | ✅ analyzer test 4/4 | ✅ paired with oversized non-empty finding case | ✅ adapter tests 10/10 |
| 2.3 | `packages/adapter-next/src/client-boundary-bloat.test.ts` | Unit | ✅ adapter safety net 6/6 | ✅ pages/mixed guard cases written before implementation | ✅ analyzer test 4/4 | ✅ two unsupported variants checked | ✅ adapter tests 10/10 |
| 2.4 | `packages/adapter-next/src/client-boundary-bloat.test.ts` | Unit | ✅ adapter safety net 6/6 | ✅ evidence/determinism cases written before implementation | ✅ analyzer test 4/4 | ✅ reversed input ordering yields same findings | ✅ adapter tests 10/10 |
| 3.1-3.4 | `packages/adapter-next/src/client-boundary-bloat.test.ts` | Unit | ✅ adapter safety net 6/6 | ✅ Phase 2 failing tests drove implementation | ✅ analyzer test 4/4 | ✅ all spec scenarios covered | ✅ adapter tests 10/10; typecheck after core build passed |
| 4.1-4.3 | Full suite | Unit/Integration | ✅ targeted suites green before docs update | ✅ N/A docs/verification task | ✅ `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `git diff --check` pass | ➖ Verification task | ✅ final whitespace check passed |

## Verification Evidence

- `pnpm test` → 41 files, 263 tests passed.
- `pnpm typecheck` → core, cli, adapter-next passed.
- `pnpm build` → core, cli, adapter-next built.
- `pnpm lint` → core framework-free guard passed.
- `git diff --check` → passed with no output.

## Deviations from Design

- `next.clientBoundaryBloat` core config namespace was not added. Design decision D2 selected adapter-local factory thresholds to avoid leaking Next config into core; P6 plan wording was updated to match this slice.

## Issues Found

- Adapter package typecheck consumes built `@rai/core` declarations, so `pnpm --filter @rai/core build` was required before adapter typecheck saw the new exported type.

## Workload / PR Boundary

- Mode: single PR.
- Current work unit: P6 Slice 4 client boundary bloat.
- Boundary: generic core adapter evidence seam + exported adapter analyzer + docs/status updates.
- Estimated review budget impact: medium; implementation stayed inside assigned slice.
