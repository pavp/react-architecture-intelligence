# Tasks: P9-S3a Current Analyzer Human Explanation Coverage

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Original forecast was 620-940 lines; live source/test/docs diff after apply is about 4,267 additions + 1,786 deletions, or about 2,960 additions + 479 deletions ignoring whitespace. OpenSpec artifacts add about 1,316 lines. |
| 400-line budget risk | High |
| Chained PRs recommended | Yes by default, but user approved an explicit larger size exception for this slice. |
| Suggested split | Not used for this delivery after user-approved size exception. |
| Delivery strategy | single-pr-size-exception |
| Chain strategy | size-exception |

Decision needed before apply: Resolved. User approved `single-pr`, `exception-ok` despite forecast and live diff exceeding the 400-line guard and active 1200-line budget.
Chained PRs recommended: Waived by user-approved size exception.
Chain strategy: size-exception.
400-line budget risk: High, accepted.

> Delivery note: Implementation exceeded the active 1200-line budget after formatting/test churn, but the user approved a larger size exception before review/verify continued.

## Scope Guard

- Stay inside `rai explain` / MCP `explain_finding` explanation coverage for current analyzer findings.
- Stop and flag before changing `doctor`, `install`, `backfill`, CLI usage/error UX, README onboarding, raw evidence schemas, MCP raw fields, persistence, snapshots, feedback, or analyzer truth.
- Preserve `@rai/core` framework neutrality: adapter-specific React/Next wording belongs in adapter-owned `Analyzer.explain` hooks.

## Work Units

### PR 1 candidate: core fallback and MCP contract preservation

Start: current `packages/core/src/explainability/explain.ts` emits generic known-kind summaries and raw adapter-metric labels.
Finish: known core evidence kinds have evidence-first summaries; unknown/adapter fallback is clearly raw; MCP raw fields remain unchanged.
Verification: focused core/MCP tests plus full validation before final handoff.
Rollback: revert `packages/core/src/explainability/explain.ts`, `packages/core/src/explainability/explain.test.ts`, and related `packages/core/src/mcp/tools.test.ts` edits.

### PR 2 candidate: React adapter-owned explanations

Start: `react/compound-component-api-drift` lacks an analyzer-owned explanation; container/presenter hook is already present.
Finish: compound drift has bounded hook-owned wording; container/presenter has regression coverage.
Verification: React adapter tests and core explain hook smoke through existing registry where cheap.
Rollback: revert React adapter module/test edits.

### PR 3 candidate: Next adapter hooks, composition, and CLI surface

Start: Next rule modules emit raw `adapter-metric` evidence and `core-adapter.ts` drops `Analyzer.explain`.
Finish: Next rules expose hook-owned explanations through composed registry, MCP/session, and one CLI `rai explain` assertion.
Verification: Next adapter/core-adapter/CLI tests plus full validation.
Rollback: revert Next adapter module/test edits and CLI test edit.

## Strict TDD Task List

### 0. Delivery gate before apply

- [ ] In `openspec/changes/p9-s3-human-output-coverage-audit/tasks.md`, resolve the forecast decision before implementation starts: choose the suggested chained PRs, a single PR under the active 1200-line budget, or an explicit size exception.

### 1. RED: core known evidence and fallback tests

- [ ] Add failing tests in `packages/core/src/explainability/explain.test.ts` for exact known core summaries:
  - `shared-extraction`: `2 components share similar source shape: PrimaryButton and SecondaryButton.` and not `^RAI found`.
  - `render-coupling`, `over-abstraction`, `hook-topology`, and `boundary-violation` use the templates from `openspec/changes/p9-s3-human-output-coverage-audit/design.md`.
- [ ] Add failing assertions in `packages/core/src/explainability/explain.test.ts` that known inspect-first guidance uses files/names/counts/config reasons and does not expose `fanIn=`, `propCount=`, `reachableDepth=`, or other raw assignment-style labels.
- [ ] Add failing tests in `packages/core/src/explainability/explain.test.ts` for bounded fallback:
  - unknown summary: `Unrecognized evidence kind "custom-evidence" for react/shared-extraction; showing raw evidence keys only.`
  - unknown limits include raw-facts wording and do not mention `team-a` or invented meaning.
  - `adapter-metric` fallback, when no hook exists, labels values as `raw adapter id`, `raw rule id`, `raw roles`, `raw metric keys`, `raw threshold keys`, and `raw topology exceeded keys`.
- [ ] Update/add failing MCP contract assertions in `packages/core/src/mcp/tools.test.ts` proving `explain_finding` preserves raw `finding`, raw `evidence`, `fingerprint`, rule id, severity/status, grounding fields, and memory overlay while explanation text changes.
- [ ] Run focused RED command and confirm only expected failures: `pnpm test packages/core/src/explainability/explain.test.ts packages/core/src/mcp/tools.test.ts`.

### 2. RED: React adapter-owned explanation tests

- [ ] Add failing hook tests in `packages/adapter-react/src/compound-component-api-drift.test.ts` that call `createCompoundComponentApiDriftAnalyzer().explain?.(...)` on an emitted finding and assert:
  - summary says `Modal.Footer` is used in JSX without observed `Modal.Footer` static member declaration.
  - inspect-first includes usage file, declared/used/missing part sets, `missing declarations observed: 1 (limit: 0)`, and observed counts.
  - limits do not claim intended public API, type resolution, runtime export behavior, required remediation, team intent, ownership, root cause, historical change, or user impact.
  - text does not match generic/internal patterns: `^RAI found .* evidence for`, `adapter:`, `rule:`, `metric ...:`, `threshold ...:`, or `exceeded topology:`.
- [ ] Add/keep regression in `packages/adapter-react/src/container-presenter-role-drift.test.ts` that existing explanation remains plain-language, evidence-first, and bounded, with no raw adapter-metric primary wording.
- [ ] Run focused RED command and confirm expected failures: `pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts`.

### 3. RED: Next adapter-owned explanation and composition tests

- [ ] Add failing explanation tests in `packages/adapter-next/src/client-boundary-bloat.test.ts` for `explainClientBoundaryBloatFinding` or analyzer hook output:
  - summary describes a client boundary above configured limits using observed count/limit wording.
  - inspect-first cites subject file, client role, direct child ids, reachable ids, crossed limits, and observed counts.
  - limits reject bundle-size, performance, bad architecture, required refactor, team intent, route ownership, root cause, historical change, and user impact claims.
- [ ] Add failing explanation tests in `packages/adapter-next/src/route-coupling.test.ts` for `explainRouteCouplingFinding` or analyzer hook output:
  - summary describes a route segment above configured limits using observed count/limit wording.
  - inspect-first cites subject file, route role, incoming/outgoing/direct/reachable/depth facts, and crossed limits.
  - limits reject import/module/data-fetching/prop-flow coupling claims beyond observed route tags and render topology.
- [ ] Add failing composition test in `packages/adapter-next/src/core-adapter.test.ts` proving `createNextCoreAnalyzers` preserves `Analyzer.explain` through `Session.explainFinding`; assert the Next summary is hook-owned, raw `evidence` and fingerprint remain deep-equal, and no primary `adapter: next`, `rule: next/...`, `metric ...:`, `threshold ...:`, or `exceeded topology:` appears.
- [ ] Add focused failing CLI assertion in `packages/cli/src/cli.test.ts` for `rai explain` on `NEXT_APP_ROUTER_BLOAT` (or another existing fixture) that includes a Next human summary and omits primary raw adapter-metric labels. If this fixture becomes too brittle, replace with a cheap smoke assertion in `scripts/smoke.sh` and document why in the test comment.
- [ ] Run focused RED command and confirm expected failures: `pnpm test packages/adapter-next/src/client-boundary-bloat.test.ts packages/adapter-next/src/route-coupling.test.ts packages/adapter-next/src/core-adapter.test.ts packages/cli/src/cli.test.ts`.

### 4. GREEN: implement core fallback wording only after RED

- [ ] Update `packages/core/src/explainability/explain.ts` to implement deterministic helpers from design: `formatList`, `formatRatio`, component refs, raw-key formatting, and existing `plural` behavior.
- [ ] Update `packages/core/src/explainability/explain.ts` known evidence branches for `shared-extraction`, `render-coupling`, `over-abstraction`, `hook-topology`, and `boundary-violation` using the exact evidence-first summaries, why text, inspect-first order, and limits from `design.md`.
- [ ] Update `packages/core/src/explainability/explain.ts` unknown and no-hook `adapter-metric` fallback so it exposes only explicitly raw facts and never synthesizes React/Next meaning.
- [ ] Run `pnpm test packages/core/src/explainability/explain.test.ts packages/core/src/mcp/tools.test.ts` until green.

### 5. GREEN: implement React adapter hook only after RED

- [ ] Update `packages/adapter-react/src/compound-component-api-drift.ts` to add pure `Analyzer.explain` support for `react/compound-component-api-drift`, deriving missing/declared/used parts, files, counts, limits, grounding fields, and glossary from existing `AdapterMetricEvidence` only.
- [ ] Ensure `createCompoundComponentApiDriftAnalyzer()` returns the hook without changing analyzer findings, evidence shape, fingerprints, diagnostics, or sorting.
- [ ] Keep `packages/adapter-react/src/container-presenter-role-drift.ts` semantics unchanged unless the new regression exposes generic/internal wording.
- [ ] Run `pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts` until green.

### 6. GREEN: implement Next hooks and propagation only after RED

- [ ] Update `packages/adapter-next/src/client-boundary-bloat.ts` with pure `explainClientBoundaryBloatFinding` and attach or export it for core adapter composition without changing raw finding/evidence output.
- [ ] Update `packages/adapter-next/src/route-coupling.ts` with pure `explainRouteCouplingFinding` and attach or export it for core adapter composition without changing raw finding/evidence output.
- [ ] Update `packages/adapter-next/src/core-adapter.ts` so `adaptNextAnalyzer` accepts optional `explain?: Analyzer["explain"]` and `createNextCoreAnalyzers` passes the route/client-boundary explanation functions through.
- [ ] Run `pnpm test packages/adapter-next/src/client-boundary-bloat.test.ts packages/adapter-next/src/route-coupling.test.ts packages/adapter-next/src/core-adapter.test.ts packages/cli/src/cli.test.ts` until green.

### 7. TRIANGULATE: cross-surface contract checks

- [ ] Re-run all focused tests from tasks 1-3 together: `pnpm test packages/core/src/explainability/explain.test.ts packages/core/src/mcp/tools.test.ts packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-next/src/client-boundary-bloat.test.ts packages/adapter-next/src/route-coupling.test.ts packages/adapter-next/src/core-adapter.test.ts packages/cli/src/cli.test.ts`.
- [ ] Inspect changed tests in `packages/core/src/mcp/tools.test.ts` and `packages/cli/src/cli.test.ts` to confirm raw JSON/MCP fields remain asserted and no new schema expectations were added.
- [ ] If any implementation needs `packages/core/src/types.ts`, DB schema, snapshot schema, feedback schema, or MCP schema edits, stop and flag scope expansion before continuing.

### 8. REFACTOR: remove duplication without widening scope

- [ ] Refactor small formatting helpers only inside touched modules (`packages/core/src/explainability/explain.ts`, `packages/adapter-react/src/compound-component-api-drift.ts`, `packages/adapter-next/src/client-boundary-bloat.ts`, `packages/adapter-next/src/route-coupling.ts`) after all focused tests are green.
- [ ] Keep helper naming deterministic and local unless multiple touched modules truly need shared code; avoid new packages or public APIs.
- [ ] Re-run the focused tests after refactor.

### 9. Full verification before apply completion

- [ ] Run `pnpm test && pnpm test:launcher`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `rtk proxy pnpm lint`.
- [ ] Run `./scripts/smoke.sh --build`.
- [ ] Run `git diff --check`.
- [ ] Update `docs/STATUS.md` only after verification succeeds, if the apply phase requires a user-visible status update.
