# Tasks: P11 React Pattern Analyzers + Pattern Drift

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520-740 additions + deletions for P11-S1; stop if implementation forecast rises above 800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: adapter-react analyzer + tests -> PR 2: CLI/MCP adapter composition + tests -> PR 3: snapshot/explain parity + docs/status |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |
| 800-line budget decision | Expected under active 800-line apply budget, but over 400-line review guard; stop before apply for maintainer split/strategy decision |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Scope Guardrails

- Strict TDD is required: every implementation task starts RED, then GREEN, TRIANGULATE, and REFACTOR evidence.
- Do not implement provider/context, controlled/uncontrolled, forms, data fetching, design-system, overlay, container/presenter, or broad API convention analyzers.
- Do not add React imports, React rule IDs, React catalog names, or React-specific evidence types to `packages/core`.
- Do not add a new MCP drift tool; use existing snapshot and `get_drift` behavior.
- Reuse `AdapterMetricEvidence`; do not add a new `Evidence` union variant in P11-S1.
- Protect unrelated local files: do not modify `.gitignore` or `.pi/`; if they appear in `git status`, leave them untouched and out of commits.

## Work Unit 0: Apply Preflight and Delivery Decision

- [x] Before code changes, inspect the worktree and confirm `.gitignore` and `.pi/` are not part of the P11 diff.
  - RED evidence expectation: record current relevant diff scope before adding tests.
  - GREEN evidence expectation: only planned P11 files are touched.
  - Verification: `git diff --check` at final verification; manual diff review for `.gitignore` and `.pi/`.
- [x] Stop before apply until the maintainer chooses `stacked-to-main`, `feature-branch-chain`, or `size-exception` for the forecasted >400-line work.
  - Default recommendation: stacked PRs to main because PR 1 can land adapter-local behavior, PR 2 can land composition, and PR 3 can land integration/docs.
  - Rollback boundary: no source changes before this decision.

## PR 1 / Work Unit 1: React Adapter Analyzer Infrastructure and Compound API Drift

Start state: `packages/adapter-react` has only catalog scaffolding and emits no findings.
Finish state: `@rai/adapter-react` exports a pure core-compatible React analyzer that emits deterministic `react/compound-component-api-drift` findings for missing declarations only.

### RED

- [x] Create failing analyzer tests in `packages/adapter-react/src/compound-component-api-drift.test.ts`.
  - Cover healthy `fixtures/react/compound-primitives/modal.tsx` and `popover.tsx` -> no `react/compound-component-api-drift` finding.
  - Cover divergent source or fixture `fixtures/react/compound-primitives/divergent.tsx` with `Modal.Trigger` declared and `Modal.Footer` used -> one finding with `missingDeclarations:Footer` in stable evidence.
  - Cover dot-member JSX without any same-root `member-assignment` -> no finding.
  - Cover unused-only declaration -> no finding in S1.
  - RED evidence: run `pnpm test -- packages/adapter-react/src/compound-component-api-drift.test.ts` and capture failures caused by missing analyzer/export behavior, not syntax errors.
- [x] Create failing adapter integration tests in `packages/adapter-react/src/core-adapter.test.ts`.
  - Assert `createReactCoreAnalyzers({ rootDir, files })` returns analyzer(s) with framework `react` and rule id `react/compound-component-api-drift`.
  - Assert analyzer findings flow through `analyzeRepo` when registered in `AnalyzerRegistry`.
  - RED evidence: run `pnpm test -- packages/adapter-react/src/core-adapter.test.ts` and capture missing `createReactCoreAnalyzers` failure.

### GREEN

- [x] Implement `packages/adapter-react/src/compound-component-api-drift.ts` with pure fact indexing over `ctx.graph.patternFacts`.
  - Use `member-assignment.object` + `property` for declared parts.
  - Use dot-member `jsx.tag`, split at final dot, for used root/part.
  - Require same root to have at least one declaration fact and one dot-member JSX usage before candidacy.
  - Emit one finding per root only when `missingDeclarations.length > 0`.
  - Severity: `info` for one missing declaration, `warn` for multiple missing declarations.
  - No filesystem reads/writes, memory writes, config writes, clock, randomness, network, or LLM calls.
- [x] Implement `packages/adapter-react/src/core-adapter.ts` exporting `createReactCoreAnalyzers(input)`.
  - Return `[compoundComponentApiDriftAnalyzer]` and accept `rootDir`/`files` for parity without using them for S1 decisions.
- [x] Update `packages/adapter-react/src/index.ts` exports.
  - Export `createReactCoreAnalyzers`, `COMPOUND_COMPONENT_API_DRIFT_RULE_ID`, and public types/helpers only when tests need them.
- [x] Add or adjust `fixtures/react/compound-primitives/divergent.tsx` only as the minimal divergent fixture needed by tests.
  - Keep fixture small; avoid unrelated overlay/provider/form/data-fetching patterns.
- [x] GREEN evidence: rerun `pnpm test -- packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` and show the new tests pass.

### TRIANGULATE

- [x] Add deterministic-ordering tests in `packages/adapter-react/src/compound-component-api-drift.test.ts`.
  - Reorder facts, roots, files, and parts; findings, fingerprints, roles, metrics, topology arrays, and `exceeded` tokens remain equivalent after blanking run-specific IDs.
  - Assert structural fingerprints are stable and sorted lexicographically in output.
- [x] Add evidence/claim-bound tests in `packages/adapter-react/src/compound-component-api-drift.test.ts`.
  - Evidence `kind` is `adapter-metric`, `adapterId` is `react`, and file/span references come from observed facts.
  - Evidence/message does not include remediation, team intent, symbol-resolution claims, historical drift claims, or dead-code claims.
- [x] Add frozen-graph read-only test in `packages/adapter-react/src/compound-component-api-drift.test.ts`.
  - Analyze a graph with frozen `patternFacts`; assert no mutation and equivalent input after analysis.
- [x] Add post-review fixture-level healthy parser/analyze coverage in `packages/adapter-react/src/core-adapter.test.ts`.
  - Parse `fixtures/react/compound-primitives/modal.tsx` and `popover.tsx`, assert expected pattern facts are present, and assert `react/compound-component-api-drift` remains silent for healthy fixture source.
  - Verification: `pnpm test -- packages/adapter-react/src/core-adapter.test.ts` passed, 59 files / 365 tests.
- [x] TRIANGULATE evidence: initial per-edge RED was not separately captured for every triangulation assertion; this is accepted as a documented strict-TDD deviation after post-review hardening.
  - Additional evidence: the post-review fixture-level healthy parser/analyze test exercises the real parser/analyzer path and passed with the focused command above.

### REFACTOR

- [x] Refactor helper functions inside `packages/adapter-react/src/compound-component-api-drift.ts` for deterministic sorting and stable evidence construction without changing test output.
- [x] Run PR 1 verification:
  - `pnpm test -- packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/core-adapter.test.ts packages/adapter-react/src/catalog.test.ts`
  - `pnpm typecheck`
  - `pnpm lint`
  - `git diff --check`
- [ ] Rollback boundary: revert `packages/adapter-react/src/compound-component-api-drift.ts`, `packages/adapter-react/src/core-adapter.ts`, related tests, `packages/adapter-react/src/index.ts`, and the divergent fixture; `packages/core` remains unchanged.

## PR 2 / Work Unit 2: CLI/MCP Adapter Composition for React

Start state: CLI loads only `@rai/adapter-next` through `packages/cli/src/adapters.ts`.
Finish state: CLI/backfill/MCP composition loads Next and React independently, preserving no-op optional adapter behavior and deterministic diagnostics.

### RED

- [x] Extend `packages/cli/src/adapters.test.ts` with failing loader tests.
  - Both Next and React available -> both analyzer rule IDs are registered in stable order.
  - React unavailable -> no diagnostic and Next analyzer still registers.
  - Next unavailable -> no diagnostic and React analyzer still registers.
  - Unexpected React import failure -> exactly one `adapter-load-skipped` diagnostic with `adapterId: "react"` and `packageName: "@rai/adapter-react"`; Next still registers.
  - Unexpected Next import failure -> existing deterministic diagnostic behavior remains and React still registers.
  - RED evidence: run `pnpm test -- packages/cli/src/adapters.test.ts` and capture failures against current single-importer loader.
- [x] Add failing dependency expectation for `packages/cli/package.json` if the test suite or build exposes the missing `@rai/adapter-react` workspace dependency.
  - RED evidence: typecheck/build failure or explicit test expectation before package update.

### GREEN

- [x] Refactor `packages/cli/src/adapters.ts` around independent adapter descriptors.
  - Descriptors: `@rai/adapter-next` with `createNextCoreAnalyzers`; `@rai/adapter-react` with `createReactCoreAnalyzers`.
  - Load each adapter independently; missing optional adapter packages are no-op.
  - Unexpected failures produce deterministic `adapter-load-skipped` diagnostics for only the failed adapter.
  - Registry factory appends adapter analyzers after base analyzers in stable descriptor order: Next, then React.
- [x] Update `packages/cli/package.json` dependencies to include `@rai/adapter-react: workspace:*`.
- [x] GREEN evidence: rerun `pnpm test -- packages/cli/src/adapters.test.ts` and show composition tests pass.

### TRIANGULATE

- [x] Add or update CLI/MCP parity coverage in `packages/cli/src/cli.test.ts`.
  - Use `fixtures/react/compound-primitives` or a minimal temp React fixture containing grounded compound API divergence.
  - Assert `buildCliMcpServer(...).session.analyzeRepo(...)` includes `react/compound-component-api-drift` through the same registry factory as `runAnalyze`.
  - Assert diagnostics remain diagnostics and do not inflate finding counts.
  - TRIANGULATE evidence: test fails before composition, passes after descriptor loader is wired.
- [ ] Add backfill/snapshot parity coverage in `packages/cli/src/cli.test.ts` if it stays within the PR 2 review budget; otherwise leave it for PR 3.
  - Assert snapshot-producing analysis can persist the React finding and existing drift comparison can observe added/removed stable findings without a new drift tool.

### REFACTOR

- [x] Keep adapter loader types generic enough for Next/React but avoid abstraction not needed by two descriptors.
- [x] Run PR 2 verification:
  - `pnpm test -- packages/cli/src/adapters.test.ts packages/cli/src/cli.test.ts`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm lint`
  - `git diff --check`
- [ ] Rollback boundary: remove React descriptor from `packages/cli/src/adapters.ts`, remove `@rai/adapter-react` from `packages/cli/package.json`, and revert CLI tests; PR 1 adapter-local analyzer can remain landed.

## PR 3 / Work Unit 3: Snapshot/Explainability Parity and Docs/Status

Start state: React findings exist and CLI composition is wired; documentation still reflects P10 as latest completed phase and P11 as next.
Finish state: historical drift/explainability expectations are covered or explicitly delegated to existing adapter-metric tests, and docs record completed P11-S1 with deferred families.

### RED

- [ ] Add focused integration coverage where not already covered by PR 1/PR 2.
  - `packages/cli/src/cli.test.ts`: `rai explain <file>` or `buildCliMcpServer` exposes React finding file refs via `AdapterMetricEvidence` subject/roles.
  - `packages/cli/src/cli.test.ts` or existing snapshot test seam: persisted React finding participates in existing snapshot/get_drift comparison.
  - RED evidence: tests fail because React findings are not yet reachable through the chosen path or file refs are incomplete.

### GREEN

- [ ] Make only minimal non-core adjustments needed for the integration tests.
  - Prefer evidence construction changes in `packages/adapter-react/src/compound-component-api-drift.ts` over core changes.
  - Do not modify `packages/core/src/types.ts`, `packages/core/src/mcp/tools.ts`, or `packages/core/src/explainability/*` unless an existing generic adapter-metric bug is discovered and approved separately.
- [ ] GREEN evidence: new integration tests pass with no new MCP drift tool and no new evidence union variant.

### TRIANGULATE

- [ ] Add regression assertions for terminology.
  - Current-source finding text/evidence uses repo-local divergence/current-source disagreement wording.
  - Historical change wording appears only in existing `get_drift` results from snapshots.
  - TRIANGULATE evidence: wording assertion fails before the final message/evidence adjustment and passes after.

### REFACTOR

- [ ] Update `docs/STATUS.md`.
  - Record P11-S1 completed, commands run, and remaining deferred P11 families.
  - Keep P0-P10 history intact.
- [ ] Update `docs/ROADMAP.md`.
  - Note P11-S1 delivered compound component API divergence only.
  - Keep provider/context, controlled/uncontrolled, forms, data fetching, design-system, overlays, container/presenter, and API conventions as future P11/P12+ slices.
- [x] Do not update `.gitignore` or `.pi/`.
- [ ] Run PR 3 verification:
  - `pnpm test && pnpm test:launcher`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm lint`
  - `git diff --check`
- [ ] Rollback boundary: revert docs/status and the PR 3 integration tests/adapter evidence adjustments; PR 1 and PR 2 can remain if their tests still pass.

## Final Verification for the Complete P11-S1 Chain

- [x] Run the required strict-TDD verification commands from a clean intended diff:
  - `pnpm test && pnpm test:launcher`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm lint`
  - `git diff --check`
- [x] Review the final diff for boundary invariants:
  - No `packages/core` React imports or React-specific rule/catalog names.
  - No new MCP drift tool.
  - No memory, feedback, config, snapshot, instruction, filesystem, network, clock, randomness, or LLM writes from React analyzer code.
  - Stable fingerprints/evidence across repeated identical input.
  - `.gitignore` and `.pi/` untouched.
- [x] If any single PR exceeds 400 changed lines, stop for maintainer approval before opening/reviewing it unless the approved chain strategy already covers the split.
