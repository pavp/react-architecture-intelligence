# Apply Progress: P6 Slice 5 — next/route-coupling

## Mode

Strict TDD — test runner `pnpm test`.

## Completed Tasks

- [x] 1.1 Create `packages/adapter-next/src/route-coupling.test.ts` with failing App Router finding test for `RouteSegment` render topology breach.
- [x] 1.2 Add failing Pages Router finding test using same rule id `next/route-coupling` and route-owned topology only.
- [x] 1.3 Add failing silence tests for below-threshold and equality cases across fan-in, fan-out, direct children, reachable nodes, reachable depth.
- [x] 1.4 Add failing mixed-router and non-Next diagnostic skip tests: diagnostic only, zero route-coupling findings.
- [x] 1.5 Add failing metric-only evidence test: route IDs, role data, topology counts, thresholds, render edge refs; no import/module/call/prop-flow claims.
- [x] 1.6 Add failing pure analyzer test proving outputs are return values only and no persistence/T3/T4/T5 write seams are called.
- [x] 1.7 Add failing determinism/cycle test with reversed graph order and render cycle.
- [x] 2.1 Create `packages/adapter-next/src/route-coupling.ts` with `ROUTE_COUPLING_RULE_ID`, thresholds, input/analyzer types, and factory defaults.
- [x] 2.2 Implement variant guard for App/Pages support plus mixed/non-Next `variant-mismatch` diagnostics.
- [x] 2.3 Implement sorted `RouteSegment` lookup from `enrichment.roleIndex` and component existence filtering.
- [x] 2.4 Implement render-edge maps and cycle-safe metrics for fan-in, fan-out, direct children, reachable nodes, reachable depth.
- [x] 2.5 Implement deterministic severity, findings, fingerprints, and `AdapterMetricEvidence` using render-topology terms only.
- [x] 3.1 Export analyzer factory, rule id, input, threshold, and analyzer types from `packages/adapter-next/src/index.ts`.
- [x] 3.2 Update `docs/superpowers/STATUS.md` and relevant P6 plan/status docs with Slice 5 scope and verification notes.
- [x] 4.1 Run `pnpm test` and record passing evidence.
- [x] 4.2 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; fix failures before apply completion.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/adapter-next/src/route-coupling.test.ts` | Created | Strict TDD coverage for App/Pages route findings, silent thresholds, unsupported diagnostics, metric evidence, purity, determinism, cycles. |
| `packages/adapter-next/src/route-coupling.ts` | Created | Pure adapter-owned `next/route-coupling` analyzer over `RouteSegment` role index and render topology metrics. |
| `packages/adapter-next/src/index.ts` | Modified | Exported analyzer factory, rule id, input, thresholds, and analyzer result types. |
| `docs/superpowers/STATUS.md` | Modified | Marked P6 Slice 5 complete and refreshed verification counts. |
| `docs/superpowers/plans/p6-adapter-next.md` | Modified | Marked Slice 5 tasks and exit criteria complete. |
| `openspec/changes/p6-route-coupling/tasks.md` | Modified | Marked assigned P6 Slice 5 tasks complete. |
| `openspec/changes/p6-route-coupling/apply-progress.md` | Created | Persisted apply evidence and verification summary. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Missing `./route-coupling.js` failed before production file existed | ✅ `pnpm vitest run packages/adapter-next/src/route-coupling.test.ts` passed | ✅ App route breach produced non-empty finding and concrete metric evidence | ✅ Extracted pure topology helpers |
| 1.2 / 2.3 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Pages Router route-owned topology test written first | ✅ RouteSegment lookup/filter passed | ✅ Unrelated render subgraph excluded from route metrics | ✅ Sorted role/component handling kept deterministic |
| 1.3 / 2.4 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Below/equality threshold tests written first | ✅ Strict `>` threshold logic passed | ✅ Covered fan-in, fan-out, direct children, reachable nodes, reachable depth | ✅ Shared metrics helper used by all paths |
| 1.4 / 2.2 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Mixed-router and non-Next diagnostic tests written first | ✅ Variant diagnostics returned without findings | ✅ Covered supported App/Pages and unsupported Mixed/Non-Next | ✅ Reused `guardNextVariant` for Next variants |
| 1.5 / 2.5 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Metric-only evidence test written first | ✅ Evidence carried roles, thresholds, counts, render edge refs | ✅ Assertions reject import/module/call/prop-flow claims outside span metadata | ✅ Evidence uses generic `AdapterMetricEvidence` |
| 1.6 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Purity test written first | ✅ Analyzer exposes only return values through `analyze` | ✅ No persistence/T3/T4/T5 seams exist on analyzer object | ➖ None needed |
| 1.7 / 2.4 / 2.5 | `packages/adapter-next/src/route-coupling.test.ts` | Unit | ✅ 10/10 adapter tests passing | ✅ Reversed-order cycle test written first | ✅ Output deterministic and cycle-safe | ✅ Two route findings with render cycles covered sorting and traversal | ✅ Reused sorted maps and path-set traversal |
| 3.1 | `packages/adapter-next/src/index.ts` | Typecheck | ✅ `pnpm --filter @rai/adapter-next typecheck` clean before final verify | ✅ Export requirement added before compile | ✅ `pnpm --filter @rai/adapter-next typecheck` passed | ➖ Structural export task | ➖ None needed |
| 3.2 / 4.1 / 4.2 | Docs + verification | Unit/quality | ✅ Targeted and full suite green before final return | ✅ Status/plan/task updates made after implementation proof | ✅ Full verification passed | ✅ `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `git diff --check` all passed | ➖ None needed |

## Test Summary

- **Total tests written**: 7 route-coupling unit tests.
- **Total tests passing**: 270 across 42 files via `pnpm test`.
- **Layers used**: Unit (7 new route-coupling tests); integration/E2E none for this pure analyzer slice.
- **Approval tests**: None — no behavior-preserving refactor-only task.
- **Pure functions created**: route metrics, render topology, reachability, threshold, fingerprint/evidence helpers.

## Verification

| Command | Result |
|---------|--------|
| `pnpm vitest run packages/adapter-next/src/client-boundary-bloat.test.ts packages/adapter-next/src/variant-guard.test.ts packages/adapter-next/src/enrich.test.ts` | ✅ 3 files, 10 tests passing safety net |
| `pnpm vitest run packages/adapter-next/src/route-coupling.test.ts` | ✅ 1 file, 7 tests passing |
| `pnpm test` | ✅ 42 files, 270 tests passing |
| `pnpm typecheck` | ✅ core, cli, adapter-next clean |
| `pnpm build` | ✅ workspace packages built |
| `pnpm lint` | ✅ core framework-free guard passed |
| `git diff --check` | ✅ no whitespace errors |

## Deviations from Design

- None that change behavior. Plan wording said `next.routeCoupling` config; implementation kept thresholds adapter-local via `createRouteCouplingAnalyzer({ thresholds })` because current slice is pure adapter analyzer and CLI adapter config wiring belongs to later Slice 6.

## Issues Found

- Evidence-string test initially matched `module` inside `span.astPath`; fixed test to evaluate evidence claims excluding syntax span metadata.

## Workload / PR Boundary

- Mode: single PR under 800-line review budget.
- Current work unit: P6 Slice 5 — route-coupling analyzer, tests, exports, docs/status, OpenSpec progress.
- Boundary: adapter-owned analyzer only; no core, persistence, T3/T4/T5, or CLI wiring changes.
- Estimated review budget impact: within requested 800-line budget; chain not needed.

## Status

16/16 tasks complete. Ready for verify.
