# Tasks: P6 Slice 5 — next/route-coupling

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 420-560 |
| 800-line budget risk | Low |
| 400-line guard risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; keep tests with analyzer |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium
800-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RED adapter contract tests | PR 1 | `packages/adapter-next/src/route-coupling.test.ts`; no production code yet |
| 2 | Pure analyzer + export | PR 1 | `route-coupling.ts`, `index.ts`; no core or persistence writes |
| 3 | Docs/status/plan + verification | PR 1 | docs/status/plan updates and full command proof |

## Phase 1: RED Tests

- [x] 1.1 Create `packages/adapter-next/src/route-coupling.test.ts` with failing App Router finding test for `RouteSegment` render topology breach.
- [x] 1.2 Add failing Pages Router finding test using same rule id `next/route-coupling` and route-owned topology only.
- [x] 1.3 Add failing silence tests for below-threshold and equality cases across fan-in, fan-out, direct children, reachable nodes, reachable depth.
- [x] 1.4 Add failing mixed-router and non-Next diagnostic skip tests: diagnostic only, zero route-coupling findings.
- [x] 1.5 Add failing metric-only evidence test: route IDs, role data, topology counts, thresholds, render edge refs; no import/module/call/prop-flow claims.
- [x] 1.6 Add failing pure analyzer test proving outputs are return values only and no persistence/T3/T4/T5 write seams are called.
- [x] 1.7 Add failing determinism/cycle test with reversed graph order and render cycle.

## Phase 2: GREEN Analyzer

- [x] 2.1 Create `packages/adapter-next/src/route-coupling.ts` with `ROUTE_COUPLING_RULE_ID`, thresholds, input/analyzer types, and factory defaults.
- [x] 2.2 Implement variant guard for App/Pages support plus mixed/non-Next `variant-mismatch` diagnostics.
- [x] 2.3 Implement sorted `RouteSegment` lookup from `enrichment.roleIndex` and component existence filtering.
- [x] 2.4 Implement render-edge maps and cycle-safe metrics for fan-in, fan-out, direct children, reachable nodes, reachable depth.
- [x] 2.5 Implement deterministic severity, findings, fingerprints, and `AdapterMetricEvidence` using render-topology terms only.

## Phase 3: Exports and Docs

- [x] 3.1 Export analyzer factory, rule id, input, threshold, and analyzer types from `packages/adapter-next/src/index.ts`.
- [x] 3.2 Update `docs/superpowers/STATUS.md` and relevant P6 plan/status docs with Slice 5 scope and verification notes.

## Phase 4: Verification

- [x] 4.1 Run `pnpm test` and record passing evidence.
- [x] 4.2 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; fix failures before apply completion.
