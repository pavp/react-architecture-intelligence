# Tasks: P11-S5 Context Provider Value-Surface Drift

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 780-1,080 additions + deletions for new analyzer, strict tests, adapter wiring, exports, and status notes; likely above active 600-line review budget |
| Review budget lines | 600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: unregistered analyzer + analyzer unit tests → PR 2: adapter registration/export + parsed integration test + docs/status |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Phase 0 — Delivery Gate

- [x] Decide before `sdd-apply` whether P11-S5 uses the suggested PR chain or a single-PR size exception against the active 600-line review budget. → Maintainer approved SINGLE PR with explicit size exception; budget waived for this change. Chaining tasks below are intentionally skipped.
- [~] If chaining is selected, keep PR 1 limited to `packages/adapter-react/src/context-provider-value-surface-drift.ts` and `packages/adapter-react/src/context-provider-value-surface-drift.test.ts`; finish with targeted analyzer tests passing and rollback by deleting both files. → N/A (single PR).
- [~] If chaining is selected, keep PR 2 limited to `packages/adapter-react/src/core-adapter.ts`, `packages/adapter-react/src/index.ts`, `packages/adapter-react/src/core-adapter.test.ts`, and completion docs; finish with full verification and rollback by removing registration/export/docs edits. → N/A (single PR).

## Phase 1 — RED: Analyzer Unit Test Surface

- [x] Add failing Vitest coverage in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` with fact builders for `call-binding`, `call-argument`, `jsx`, `jsx-attribute`, optional `hook-call`, `Span`, and frozen `AnalysisContext` graph fixtures.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` for bare `createContext`, absent default argument, same-file `<AuthContext.Provider>` with no direct `value`, `type: "opportunity"`, `severityRaw: "info"`, and exceeded token prefix `noDefaultArgumentAndProviderNoDirectValue:`.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` for `React.createContext` with observed arg0 `argumentKind`, mixed provider direct-value presence, evidence roles/metrics/thresholds, and exceeded token `mixedProviderDirectValuePresence:ThemeContext`.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` for provider spread ambiguity, requiring `providerSpreadAmbiguous:` evidence and forbidding spread-expansion, hidden-value, runtime-absence, bug, remediation, intent, root-cause, user-impact, and historical-drift wording in finding/explanation text.
- [x] Run `pnpm test packages/adapter-react/src/context-provider-value-surface-drift.test.ts` and confirm these RED tests fail because `packages/adapter-react/src/context-provider-value-surface-drift.ts` is not implemented yet. → RED confirmed: suite failed to load (module missing).

## Phase 2 — GREEN: Minimal Analyzer Behavior

- [x] Create `packages/adapter-react/src/context-provider-value-surface-drift.ts` exporting `CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID` and `createContextProviderValueSurfaceDriftAnalyzer()` with pure synchronous `analyze(ctx)` and `explain(finding)` methods.
- [x] Implement adapter-local fact guards in `packages/adapter-react/src/context-provider-value-surface-drift.ts` for `call-binding`, `call-argument`, `jsx`, `jsx-attribute`, and optional `hook-call` facts without adding React semantics to `packages/core/**`.
- [x] Implement same-file `(file, localName)` correlation in `packages/adapter-react/src/context-provider-value-surface-drift.ts` for bare `createContext` and suffix `.createContext` call bindings, same-call arg0 association, and `<Local.Provider>` JSX occurrence enumeration.
- [x] Implement provider surface classification in `packages/adapter-react/src/context-provider-value-surface-drift.ts` as `direct-value`, `missing-direct-value`, `direct-value-with-spread`, or `spread-ambiguous`, treating `valueKind: "absent"` on a named `value` attribute as direct surface and spreads as ambiguity only.
- [x] Implement divergence labels, `info`/`warn` severity by exceeded-token count, `AdapterMetricEvidence`, sorted topology ids, stable SHA fingerprints, bounded message text, and analyzer-owned explanation in `packages/adapter-react/src/context-provider-value-surface-drift.ts`.
- [x] Run `pnpm test packages/adapter-react/src/context-provider-value-surface-drift.test.ts` and make the initial analyzer tests pass without wiring the analyzer into `createReactCoreAnalyzers` yet if using chained PR 1. → GREEN: 5/5 unit tests pass.

## Phase 3 — TRIANGULATE: Edge Cases and Determinism

- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` proving consistent direct provider `value` surfaces stay silent, context bindings without same-file providers stay silent, and cross-file `<Local.Provider>` name matches are not correlated.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` proving direct `value` expression/valueKind shape differences alone are not semantic divergence and duplicate same-file `(file, localName)` createContext bindings are suppressed.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` proving reversed fact order, nested attribute order, roles, topology ids, exceeded tokens, and finding order produce deterministic normalized output.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` proving frozen facts, frozen spans, and frozen graph arrays are read without mutation.
- [x] Add failing tests in `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` proving optional `useContext(...)` and `use(...)` hook evidence may appear only as corroboration and never changes emission/suppression decisions. → Fixed a real bug: consumer args were excluded by the createContext-only filter; added `isConsumerArgumentFact`.
- [x] Update `packages/adapter-react/src/context-provider-value-surface-drift.ts` until all triangulation tests pass while preserving current-source, same-file, no-runtime-semantics claim boundaries.
- [x] Run `pnpm test packages/adapter-react/src/context-provider-value-surface-drift.test.ts` after each triangulation batch. → GREEN: 16/16 tests pass.

## Phase 4 — RED/GREEN: Adapter Wiring and Parsed Integration

- [x] Add failing metadata coverage in `packages/adapter-react/src/core-adapter.test.ts` expecting `react/context-provider-value-surface-drift` as the fourth analyzer after compound, container/presenter, and controlled/uncontrolled analyzers. → RED confirmed (3 vs expected 4), then GREEN after wiring.
- [x] Add failing parsed TSX integration coverage in `packages/adapter-react/src/core-adapter.test.ts` proving `createSession` / `analyzeRepo` emits a context provider finding through existing React adapter loading from source containing `createContext` and same-file `<Local.Provider>` value-surface divergence. → RED confirmed (0 findings), then GREEN after wiring.
- [x] Export the rule id and analyzer factory from `packages/adapter-react/src/index.ts` and import/register `createContextProviderValueSurfaceDriftAnalyzer()` in `packages/adapter-react/src/core-adapter.ts` after the existing three React analyzers.
- [x] Run `pnpm test packages/adapter-react/src/core-adapter.test.ts packages/adapter-react/src/context-provider-value-surface-drift.test.ts` and make adapter wiring/integration tests pass. → GREEN: 26/26 across analyzer + adapter + catalog tests.

## Phase 5 — REFACTOR: Boundaries, Catalog, and Documentation

- [x] Inspect `packages/adapter-react/src/catalog.ts` and `packages/adapter-react/src/catalog.test.ts` to confirm `FACT_KINDS` already covers `call-binding`, `call-argument`, `jsx`, and `jsx-attribute`; edit only if tests prove the expected list is stale. → Confirmed present; no change needed (catalog.test green).
- [x] Refactor `packages/adapter-react/src/context-provider-value-surface-drift.ts` helpers for deterministic sorted copies, sorted unique ids, stable span tokens, and no mutation of `ctx.graph.patternFacts`. → Uses copied/sorted arrays, `sortedUnique`, stable `spanTokenFor`; frozen-input test passes.
- [x] Inspect `packages/core/**` with `grep` or equivalent to confirm no P11-S5 React context/provider rule id, provider labels, or adapter imports were added to core. → grep returned no matches in `packages/core/src`.
- [x] Update `docs/STATUS.md` with the P11-S5 implementation/verification result after tests pass, and update `docs/ROADMAP.md` only if the roadmap currently tracks P11-S5 completion status. → Both updated (STATUS table + P11-S5 section; ROADMAP P11 row + delivered list).
- [x] Run `pnpm test packages/adapter-react/src/context-provider-value-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts packages/adapter-react/src/catalog.test.ts` as targeted verification. → 3 files / 26 tests pass.
- [x] Run full verification with `pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; capture results for the SDD verify phase. → pnpm test 62 files/416 tests; test:launcher ok; typecheck/build/lint Done; git diff --check clean.
