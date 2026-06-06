# Tasks: P11-S6 react/form-control-surface-drift

Phase: tasks · Persistence: hybrid · Strict TDD ACTIVE (runner: `pnpm test` / vitest)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~590–670 (impl ~280–320, test ~280–320, registry +6, docs ~20) |
| 400-line budget risk | High (vs 400 default); within this project's 800-line budget |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast (project 800-line budget) |
| Chain strategy | size-exception not needed (under 800) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

Rationale: ~600 lines exceeds the 400 default but fits this project's 800-line review budget. New analyzer + paired test file are a single cohesive work unit (ADR-2: tests must land with the behavior). Splitting would force shipping an unwired/untested analyzer. Single PR is correct.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Analyzer + tests + registry + explain + docs | PR 1 | One work-unit commit set; tests with behavior; base = main |

## Phase 1: Failing Tests (Strict TDD — RED)

- [x] 1.1 Create `packages/adapter-react/src/form-control-surface-drift.test.ts`; copy P11-S5 harness verbatim (`runFacts`, `jsx`, `jsxAttribute`, `adapterEvidence`, `presented`, `normalize`, `freezeFacts`, `compareRoles`, `span`) from `context-provider-value-surface-drift.test.ts` (lines ~646–684).
- [x] 1.2 Author Family-1 cases: F1 positive (onSubmit expr + action) → 1 finding `info`, `metrics.formSubmitSurfaceDrift===1`; F1 neg handler-only; F1 neg declarative-only; F1 absent-onSubmit neg (E2). Run `pnpm test` → RED (module missing).
- [x] 1.3 Author Family-2 cases: value/defaultValue positive; checked/defaultChecked positive; uniform-controlled neg (E7); uniform-uncontrolled neg; per-tag isolation neg (E13); absent-value counts (E4); spread-ignored neg (E5).
- [x] 1.4 Author scope/regression cases: silence no-form-elements (`<div>`); cross-file isolation (E11); severity warn boundary (F1+F2, `exceeded.length>1`); determinism (forward vs reversed, same runId); structural stability across span shift (equal structural, differing positional); frozen-facts-not-mutated; bounded explanation (non-null summary, sorted `groundingFields`, `glossary.length===groundingFields.length`, forbidden-vocabulary regex); null explanation for non-matching ruleId. Confirm whole suite is RED.

## Phase 2: Implementation (GREEN)

- [x] 2.1 Create `packages/adapter-react/src/form-control-surface-drift.ts`: `@rai/core` imports (`explainTerm` + types per design §2); copy helpers verbatim (`sha`, `sortedUnique`, `spanContains`, `compareFacts`, `compareRoles`, `compareFindings`, `uniqueRoles`, `formatList`, `severityFor`).
- [x] 2.2 Add semantic constants: `FORM_CONTROL_SURFACE_DRIFT_RULE_ID="react/form-control-surface-drift"`, `FORM_TAG`, `SUBMIT_HANDLER_ATTR`, `DECLARATIVE_SUBMIT_ATTRS`, `CONTROL_TAGS`, `CONTROL_BINDING_PAIRS` (with `tags` allow-set per ADR-4).
- [x] 2.3 Implement fact guards + per-file compute: Family-1 co-presence gate (onSubmit non-absent AND action/method any valueKind); Family-2 per `(pair,tag)` mixed-pair detection; `exceeded = sortedUnique([...f1,...f2])`; silence gate `exceeded.length>0`.
- [x] 2.4 Build Finding: file-level subject `react:form-control-surface:${file}`; `primarySpan` (lowest contributing `span.start`, tie-broken `compareFacts`); fingerprint triple (structural span/id-free, nominal name-only, positional file+span); `AdapterMetricEvidence` metrics/thresholds/topology; sorted+deduped roles; `severity = count>1?warn:info`; `findings.sort(compareFindings)`. Run `pnpm test` → non-explain cases GREEN.
- [x] 2.5 Implement `explain(finding)`: guard ruleId+evidence.kind; branched summary (both/submit-only/control-single/control-multi); 6 bounded `limits`; `groundingFields=Object.keys(evidence).sort()`; `glossary=groundingFields.map(explainTerm)`. Run `pnpm test` → full suite GREEN.

## Phase 3: Registration

- [x] 3.1 `packages/adapter-react/src/index.ts`: add export block `{ FORM_CONTROL_SURFACE_DRIFT_RULE_ID, createFormControlSurfaceDriftAnalyzer } from "./form-control-surface-drift.js"` after the `CONTROLLED_UNCONTROLLED` block (line 26), before `createReactCoreAnalyzers` (line 27) — preserves alphabetical order.
- [x] 3.2 `packages/adapter-react/src/core-adapter.ts`: add `import { createFormControlSurfaceDriftAnalyzer } from "./form-control-surface-drift.js";` (after line 5) and append `createFormControlSurfaceDriftAnalyzer(),` to the `createReactCoreAnalyzers()` array (after line 19).

## Phase 4: Verification Gate

- [x] 4.1 Run `pnpm test` (record new total count), `pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint` (confirms core framework-free guard) — all green.
- [x] 4.2 `git diff --check`; confirm ZERO diff under `packages/core/` (design §9 no-core-change guarantee). Run `./scripts/smoke.sh --build` only if output is CLI/MCP-visible (analyzer is additive; likely skip — noted: additive change, no CLI/MCP output changed).

## Phase 5: Documentation

- [x] 5.1 Update `docs/STATUS.md` and `docs/ROADMAP.md` P11 section to record P11-S6 shipped (mirror how P11-S5 was recorded); include `react/form-control-surface-drift` and new test total (63 files / 438 tests).

## Fix Pass (post-verify C1) — 2026-06-06

Verify returned FAIL with CRITICAL C1: spec OQ2 (single-form silent) violated by shipped impl. OQ2-decision locked by maintainer: SILENT wins.

- [x] FP1 RED: add 5 guard tests — single-form silent (onSubmit+action), single-form silent (onSubmit+method), two-form FIRES (positive regression guard), OQ3 form-with-neither silent, React-19 single action={fn} silent. Confirmed 2 tests RED against current impl.
- [x] FP2 GREEN: amend Family-1 gate in `computeExceeded` to require >=2 distinct `<form>` elements using `spanContains` span-containment to assign attrs to parent form; cross-form divergence check. All 26 tests GREEN.
- [x] FP3 CLEANUP: remove dead `hasControlDrift` local (line 474, verify S1); remove unused `file`/`fileJsx` params from `collectContributingAttrIds`; remove unused `file` param from `collectContributingJsxIds`; remove `void spanContains` suppression (now `spanContains` is actually called). Typecheck passes.
- [x] FP4 SYNC: amend `design.md` ADR-3, E8, and Family-1 pseudocode to state locked decision; amend `spec.md` body requirement to explicitly require different form elements. Spec/design/code now agree.
- [x] FP5 GATE: `pnpm test` (63 files / 443 tests), `pnpm typecheck`, `pnpm build`, `node scripts/check-core-framework-free.mjs` — all green. Zero core diff.
