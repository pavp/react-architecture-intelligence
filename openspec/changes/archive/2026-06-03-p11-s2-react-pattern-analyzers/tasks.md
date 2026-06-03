# Tasks: P11-S2 React Container/Presenter Role Divergence

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Original implementation/docs forecast was 620-950; post-apply implementation/docs are about 1,153 changed lines; full relevant payload with OpenSpec artifacts is about 2,099 changed lines. |
| 400-line budget risk | High |
| Chained PRs recommended | Yes by default, but maintainer approved an explicit larger size exception for the full OpenSpec-inclusive payload. |
| Suggested split | Not used for this delivery after maintainer size exception. |
| Delivery strategy | single-pr-size-exception |
| Chain strategy | size-exception |

Decision needed before apply: Resolved. Implementation used `single-pr`, `exception-ok` under 1200; final delivery uses explicit larger size exception because full payload exceeds 1200 when OpenSpec artifacts are counted.
Chained PRs recommended: Waived by maintainer size exception.
Chain strategy: size-exception.
400-line budget risk: High, accepted.

Active SDD budget note: implementation-only payload is under the user-provided 1200-line apply budget, but full relevant payload with OpenSpec exceeds 1200. Maintainer approved a larger size exception for this single change.

## Stop Gates

- Stop and ask for a design decision before implementation if `packages/core/**` must change.
- Stop and ask for a delivery decision if the live diff forecast grows beyond 1200 changed lines.
- Do not add provider/context, controlled/uncontrolled, forms, data-fetching, design-system, overlay, or broad API-convention findings in this change.

## Work-Unit Split and Boundaries

| Work unit | Start | Finish | Verification | Rollback |
|---|---|---|---|---|
| WU1: adapter-local analyzer | No `container-presenter-role-drift` module exists | `packages/adapter-react/src/container-presenter-role-drift.ts` exists with strict unit tests passing by direct factory call | Focused Vitest run for `packages/adapter-react/src/container-presenter-role-drift.test.ts`; no `packages/core/**` diff | Remove the new analyzer module and unit test file |
| WU2: adapter composition + fixtures + docs | WU1 complete | `createReactCoreAnalyzers()` returns compound first, container/presenter second; fixture integration passes; docs reflect P11-S2 completion | Focused Vitest run for `packages/adapter-react/src/core-adapter.test.ts`, then full verify commands | Revert wiring/export/fixture/docs changes; WU1 may remain or be reverted depending on chain choice |

## Strict TDD Tasks

### RED

1. Create failing unit tests in `packages/adapter-react/src/container-presenter-role-drift.test.ts`.
   - Import the not-yet-existing `createContainerPresenterRoleDriftAnalyzer` and `CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID` from `./container-presenter-role-drift.js`.
   - Add local builders for `AnalysisContext`, `ComponentNode`, `GraphEdge`, `PatternHookCallFact`, spans, and normalized findings.
   - Assert a healthy `UserContainer -> UserView` pair with no high-signal hooks emits no findings.
   - Assert `UserContainer -> UserView` where `UserView.hookCalls` contains `useState` emits exactly one `react/container-presenter-role-drift` finding.
   - Assert unpaired presenter-like hook usage stays silent.
   - Assert a container-like component without a presenter-like direct render edge stays silent.
   - Expected RED: module/factory/rule id do not exist.

2. Extend the same unit test file for evidence, hook policy, determinism, and mutation.
   - Verify emitted evidence includes `container-component`, `presenter-component`, role-seed roles, `render-pair`, `presenter-high-signal-hook`, metrics, thresholds, topology ids, subject file, and subject span.
   - Verify high-signal exact hooks include at least `useState`, `useEffect`, and `useQuery`; low-signal hooks `useMemo`, `useContext`, `useTheme`, and `useMediaQuery` stay silent.
   - Verify suffix seeds require non-empty prefixes: `UserContainer`, `UserPresenter`, and `UserView` match; exact `Container`, exact `Presenter`, exact `View`, and `Overview` do not.
   - Verify path segment seeds match `src/containers/User.tsx` and `src/views/User.tsx`, but not `src/containerized/User.tsx`.
   - Verify reversed component, edge, and pattern-fact order returns equivalent normalized findings and sorted role/topology arrays.
   - Freeze graph arrays/objects before analysis and assert the analyzer does not mutate input.
   - Serialize finding/evidence and assert prohibited claim words are absent: `wrong`, `bad separation`, `team intent`, `historical`, `must refactor`, `root cause`, `bug caused`.

3. Add failing adapter integration tests in `packages/adapter-react/src/core-adapter.test.ts`.
   - Import `CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID` from `./container-presenter-role-drift.js`.
   - Update the stable metadata test to expect analyzer order: `react/compound-component-api-drift` first, `react/container-presenter-role-drift` second.
   - Add or extend source-level tests using `analyzeRepo` / `createReactSession` so a divergent fixture emits the new rule and a healthy fixture stays silent.
   - Create test fixtures if needed:
     - `fixtures/react/container-presenter/healthy.tsx`
     - `fixtures/react/container-presenter/divergent.tsx`
   - Expected RED: new analyzer is not wired or implemented.

### GREEN

4. Implement `packages/adapter-react/src/container-presenter-role-drift.ts`.
   - Export `CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID = "react/container-presenter-role-drift"` and `createContainerPresenterRoleDriftAnalyzer(): Analyzer`.
   - Read only `ctx.graph.components`, `ctx.graph.edges`, and `ctx.graph.patternFacts`; no filesystem, network, clock, randomness, config writes, memory writes, feedback writes, snapshot writes, or source-file parsing.
   - Detect container-like seeds from component/file suffix `Container` with non-empty prefix and exact path segments `container` / `containers`.
   - Detect presenter-like seeds from component/file suffix `Presenter` or `View` with non-empty prefix and exact path segments `presenter`, `presenters`, `view`, or `views`.
   - Build findings only for direct `renders` edges from a container-like component to a presenter-like component.
   - Filter presenter hooks with the conservative exact allowlist from `openspec/changes/p11-s2-react-pattern-analyzers/design.md`.
   - Group multiple high-signal hooks into one finding per render pair.
   - Reuse `AdapterMetricEvidence`; do not add new core evidence variants.
   - Generate deterministic severity, subject, roles, metrics, thresholds, topology, and SHA-256 fingerprints.
   - Copy arrays before sorting so frozen graph input remains untouched.

5. Wire the analyzer through React adapter exports.
   - Modify `packages/adapter-react/src/core-adapter.ts` to register `createCompoundComponentApiDriftAnalyzer()` first and `createContainerPresenterRoleDriftAnalyzer()` second.
   - Modify `packages/adapter-react/src/index.ts` to export the new rule id and factory.
   - Do not change `packages/core/**`.
   - Do not change CLI production code unless the integration tests prove the existing adapter seam fails to compose the analyzer.

### TRIANGULATE

6. Run focused tests and close coverage gaps without broadening scope.
   - Run focused Vitest coverage for:
     - `packages/adapter-react/src/container-presenter-role-drift.test.ts`
     - `packages/adapter-react/src/core-adapter.test.ts`
   - If parse-level render edges or hook facts behave differently than unit builders, adjust only adapter tests/fixtures or analyzer fallback logic inside `packages/adapter-react/src/container-presenter-role-drift.ts`.
   - If hook-call spans cannot be matched safely through `PatternHookCallFact`, keep presenter component span fallback; do not expand core facts.

7. Add optional CLI/MCP parity test only if adapter-react integration is insufficient.
   - Discovery target: existing adapter composition tests in `packages/cli/src/cli.test.ts`.
   - If needed, add a test-only assertion that the installed React adapter analyzer set can surface `react/container-presenter-role-drift` through the normal CLI/MCP analysis path.
   - Do not add CLI production behavior for P11-S2 unless a failing test proves composition is broken.

### REFACTOR

8. Refactor for readability and deterministic maintenance.
   - Keep helpers local to `packages/adapter-react/src/container-presenter-role-drift.ts` unless shared by an existing adapter file.
   - Ensure comparator helpers, role de-duplication, path tokenization, hook allowlist, and fingerprint construction are small and deterministic.
   - Ensure tests assert behavior, not implementation-private helper names.
   - Re-run focused adapter tests after refactor.

9. Update docs only after tests pass.
   - Modify `docs/STATUS.md` to mark P11-S2 complete, record rule id `react/container-presenter-role-drift`, note latest verification commands/results, and keep core boundary unchanged.
   - Modify `docs/ROADMAP.md` to move container/presenter from deferred P11 families to delivered P11-S2 and leave other P11 families deferred.
   - Do not update `CLAUDE.md` for live roadmap status.

10. Run final verification before archive/apply completion.
    - `pnpm test && pnpm test:launcher`
    - `pnpm typecheck`
    - `pnpm build`
    - `pnpm lint`
    - `git diff --check`
    - Confirm no `packages/core/**` diff unless a separate approved design decision exists.
    - Confirm `openspec/changes/p11-s2-react-pattern-analyzers/specs/react-pattern-analyzers/spec.md` scenarios are covered by tests.
