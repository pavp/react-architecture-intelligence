# Proposal: P11 React Pattern Analyzers + Pattern Drift

## Intent

Turn the P10 React pattern intelligence foundation into the first deterministic React adapter findings while preserving the `@rai/core` framework boundary. This change should deliver one reviewable P11 slice: React adapter analyzer infrastructure, CLI/MCP adapter composition, one compound component / compound primitive API drift analyzer grounded in `RepoGraph.patternFacts`, and minimal repo-local pattern divergence semantics.

## Motivation

P10 made React-relevant syntax observable as generic, sorted, deduped, frozen `RepoGraph.patternFacts`, but it intentionally emitted no findings and made no React intent claims. P11 should start converting those facts into useful architecture feedback.

The full P11 roadmap includes compound components, container/presenter, controlled/uncontrolled, provider/context, forms, data fetching, design-system usage, overlays, and API conventions. Implementing all families in one pass would exceed the review budget and increase false-positive risk before the analyzer infrastructure is proven. A narrow first slice lets the project validate the adapter-owned analyzer pattern, fingerprint/evidence determinism, and drift terminology before adding more pattern families.

## Scope

### In scope

- Add React adapter analyzer infrastructure in `packages/adapter-react`.
- Compose React adapter analyzers into CLI/MCP analysis through the existing adapter-loading direction: adapters depend on `@rai/core`; `@rai/core` does not import React adapter code.
- Preserve existing Next adapter behavior and unavailable-adapter diagnostics while adding React adapter composition.
- Implement one concrete analyzer family: compound component / compound primitive API drift.
- Ground the analyzer in P10 `RepoGraph.patternFacts`, especially:
  - `member-assignment` facts such as `Modal.Trigger = ModalTrigger`;
  - `jsx` facts such as `<Modal.Trigger>` and related root/member JSX tags;
  - optional `import` and `export` facts for additional provenance when available, without requiring symbol resolution.
- Define minimal repo-local pattern divergence semantics for this slice:
  - derive observed declared compound parts from static member assignments;
  - derive observed used compound parts from dot-member JSX;
  - report deterministic divergences when observed usage and observed declarations disagree;
  - avoid claiming team intent, ownership, or remediation beyond observed facts.
- Let historical drift continue through existing snapshot persistence and `get_drift` once stable pattern findings are emitted.
- Add specs, design, tasks, tests, and docs/status updates needed for this first slice.

### Explicit non-goals

- No provider/context analyzer.
- No controlled/uncontrolled analyzer.
- No forms analyzer.
- No data-fetching analyzer.
- No design-system usage analyzer.
- No overlay analyzer beyond compound primitive fixture coverage.
- No container/presenter analyzer.
- No broad API convention analyzer.
- No LLM-derived findings, summaries, or remediations.
- No memory writes from React adapter analyzers.
- No React-specific imports, catalog names, or analyzer logic inside `packages/core`.
- No new MCP pattern query tool in the first slice.
- No symbol/type resolver expansion unless a later design explicitly accepts the scope.
- No new evidence union variant unless design proves `AdapterMetricEvidence` is insufficient for this slice.

## Proposed first-slice semantics

The first analyzer should use a rule id such as `react/compound-component-api-drift`.

A candidate compound family is repo-observed, not intent-inferred. The analyzer should only consider roots with corroborating facts, for example a root object that has at least one static member assignment and at least one dot-member JSX observation. From those facts it should derive:

- `declaredParts`: member names observed through static member assignments;
- `usedParts`: member names observed through dot-member JSX usage;
- `missingDeclarations`: JSX-used members with no matching observed static member assignment;
- `unusedDeclarations`: statically assigned members that are never observed in JSX, if the design keeps this conservative enough for the first slice.

The finding should describe the divergence as current-repo pattern divergence, not historical drift and not proof of intended API shape. Historical drift remains the existing snapshot comparison behavior.

## Capabilities for spec phase

### New capability: `react-pattern-analyzers`

The spec phase should add requirements for adapter-owned React analyzers that:

- MUST live outside `packages/core`.
- MUST consume only frozen `RepoGraph` data, configuration, and adapter-owned catalog metadata.
- MUST be deterministic, pure, and synchronously executable under the existing analyzer pipeline.
- MUST emit stable findings with stable fingerprints and deterministically ordered evidence.
- MUST avoid memory writes and avoid LLM or best-practice inference.
- SHOULD start with the compound component / compound primitive API drift family only.

### New capability: `pattern-drift`

The spec phase should define pattern drift terminology clearly:

- Repo-local pattern divergence means a current-source finding derived from disagreements between observed pattern facts in the same repository.
- Historical drift means the existing snapshot comparison exposed through `get_drift`.
- The first slice MUST NOT add a new MCP drift tool; it SHOULD rely on stable findings so existing snapshot drift can compare pattern findings over time.

### Modified capability: CLI/MCP adapter composition

The spec phase should update adapter-composition expectations so CLI and MCP analysis paths include React adapter analyzers when the adapter is available, while preserving:

- existing Next adapter composition;
- deterministic diagnostics for unexpected adapter import failures;
- no-op behavior when an optional adapter is unavailable;
- no adapter imports from `packages/core`.

## Impact

- Users can receive the first React pattern finding from P10 facts instead of only raw syntax facts.
- CLI and MCP analysis can include React adapter findings through adapter composition.
- Snapshot persistence can track historical changes in the new pattern findings using existing drift machinery.
- Explainability can surface raw adapter evidence without adding an LLM narrative or inventing remediation.
- The React adapter becomes a real analyzer host while `@rai/core` remains framework-agnostic.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/adapter-react/src/` | New/modified | Add analyzer factory/infrastructure and compound component API drift analyzer. |
| `packages/adapter-react/src/catalog.ts` | Modified if needed | Reuse or minimally extend React catalog scaffolding for compound primitive metadata. |
| `packages/adapter-react/src/*.test.ts` | New/modified | Add strict TDD coverage for analyzer infrastructure, divergence detection, deterministic ordering, and no-finding healthy cases. |
| `packages/cli/src/adapters.ts` | Modified | Compose React adapter analyzers alongside existing Next adapter analyzers. |
| `packages/cli/src/*.test.ts` | Modified | Verify adapter composition, unavailable-adapter behavior, and deterministic diagnostics. |
| MCP analysis entrypoints | Indirectly modified | MCP should receive the same composed analyzer set through existing CLI/session construction; no new drift tool is planned. |
| `fixtures/react/compound-primitives/` | Modified if needed | Add or adjust one divergent fixture to cover API drift. |
| `openspec/changes/p11-react-pattern-analyzers-pattern-drift/` | New/modified | Add proposal, design, tasks, and focused spec deltas for the first slice. |
| `docs/STATUS.md` / `docs/ROADMAP.md` | Modified after apply | Record completed P11 slice and remaining deferred families. |
| `packages/core` | Avoid by default | Core should remain unchanged unless design explicitly approves a generic, non-React evidence shape. |

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Full P11 scope exceeds budget | High | Limit apply to compound component API drift and defer all other pattern families. |
| Core boundary drift | Medium | Keep React analyzer/catalog logic in `packages/adapter-react`; preserve lint guard expectations. |
| False positives from syntax-only facts | Medium | Require corroborating facts and phrase findings as observed divergence, not intent or identity proof. |
| Drift terminology confusion | Medium | Spec repo-local pattern divergence separately from historical snapshot drift. |
| Evidence shape churn | Medium | Prefer existing `AdapterMetricEvidence` for S1; defer richer generic evidence until needed. |
| Fingerprint/evidence noise | Medium | Sort roots, parts, files, spans, maps, and evidence before emitting findings. |
| Adapter activation gaps | Medium | Add React adapter composition tests across CLI/MCP-relevant construction seams. |
| Review budget pressure | Medium | Keep S1 narrow; split before apply if design/tasks forecast exceeds accepted budgets. |

## Rollback notes

Rollback should be straightforward because the slice adds adapter-owned findings and composition only:

1. Unregister/remove React adapter analyzer composition from CLI/MCP analysis setup.
2. Revert `packages/adapter-react` analyzer files and tests.
3. Keep or revert fixture additions depending on whether they are useful for future P11 slices.
4. Leave P10 `RepoGraph.patternFacts` intact; they are foundation data and remain framework-neutral.
5. If pattern findings were persisted during local runs, ignore or delete snapshots containing the new `react/compound-component-api-drift` rule id; no memory writes should exist.
6. Revert OpenSpec/status updates for the P11 slice if the change is abandoned.

Existing core analyzers, Next adapter behavior, memory feedback semantics, and historical drift tooling should remain unaffected.

## Dependencies

- P10 `RepoGraph.patternFacts` and React catalog scaffold.
- Existing analyzer registry and pipeline diagnostic isolation.
- Existing CLI adapter composition pattern from `@rai/adapter-next`.
- Existing snapshot persistence and `get_drift` historical drift behavior.
- Existing explainability support for adapter evidence.
- Strict TDD required by `openspec/config.yaml`.

No new runtime dependency is expected for the first slice.

## Review workload forecast assumptions

Active OpenSpec apply budget is 800 changed lines. Repo and loaded `chained-pr`/`work-unit-commits` guardrails still prefer splitting PRs above 400 changed lines unless a maintainer accepts a size exception.

Forecast for the recommended first slice:

| Work unit | Expected size | Notes |
|-----------|---------------|-------|
| React adapter analyzer composition | Small/medium | Analyzer factory, exports, CLI adapter composition, tests. |
| Compound component API drift analyzer | Medium | Fact indexing, divergence derivation, findings, fixture tests, deterministic ordering tests. |
| Specs/docs/status | Small/medium | Focused OpenSpec deltas and status/roadmap updates after apply. |

Assumptions keeping the slice under 800 lines:

- reuse `AdapterMetricEvidence` instead of adding a new core evidence type;
- do not add new MCP tools;
- do not implement additional P11 pattern families;
- do not expand symbol/type resolution;
- keep fixtures minimal and targeted;
- group tests with the behavior they verify.

If detailed design/tasks forecast exceeds 800 changed lines, split before apply. If implementation exceeds 400 changed lines, use work-unit commits and either chained PRs or an explicit maintainer size exception.

## Delivery slice recommendation

Deliver P11-S1 only:

1. **Adapter composition slice:** add `@rai/adapter-react` analyzer factory and load it through the same CLI/MCP composition seam used for other adapters.
2. **Analyzer slice:** add `react/compound-component-api-drift` over `RepoGraph.patternFacts`, with deterministic findings and tests.
3. **Spec/docs slice:** document repo-local pattern divergence semantics, historical drift relationship, non-goals, and deferred P11 families.

Do not proceed to provider/context, forms, data fetching, design-system, overlay, or API convention analyzers until P11-S1 is designed, implemented, and verified. If the S1 implementation forecast grows beyond budget, split into chained PRs with the adapter composition work first and the concrete analyzer second.

## Success criteria

- [ ] OpenSpec design/spec/tasks define React adapter analyzers and pattern divergence with RFC 2119 requirements and Given/When/Then scenarios.
- [ ] React analyzer infrastructure lives in `packages/adapter-react`, and `packages/core` remains framework-agnostic.
- [ ] CLI/MCP analysis paths compose React adapter analyzers without regressing Next adapter loading.
- [ ] `react/compound-component-api-drift` emits findings only for grounded divergences between observed static member declarations and observed JSX dot-member usage.
- [ ] Healthy compound primitive fixtures do not emit drift findings.
- [ ] Divergent fixtures emit deterministic findings with stable fingerprints, stable evidence order, and file/span references.
- [ ] Historical drift continues through existing snapshot/`get_drift` behavior; no new drift MCP tool is required for S1.
- [ ] No React adapter analyzer writes memory or uses LLM inference.
- [ ] Verification passes: `pnpm test`, `pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`.
