# Proposal: P11-S2 React Container/Presenter Role Divergence

## Intent

Add the second P11 React pattern analyzer slice: `react/container-presenter-role-drift`. The analyzer should report only grounded current-source divergence between observed container/presenter role naming evidence and observed React syntax evidence, while keeping all React interpretation inside `@rai/adapter-react` and outside `@rai/core`.

## Motivation

P11-S1 proved the adapter-owned analyzer path with `react/compound-component-api-drift`. P11-S2 should extend that pattern to one additional family without expanding generic core facts or taking on the full React pattern roadmap.

Exploration selected container/presenter because existing graph data is enough for a narrow, deterministic slice:

| Evidence source | Use in this slice |
|-----------------|-------------------|
| `ComponentNode.name` and file path | Identify role-name evidence such as `*Container`, `*Presenter`, `*View`, `/containers/`, or `/presenters/`. |
| `hookCalls` | Identify observed state/data/effect hook usage in presenter-like components. |
| `childComponents` / render edges | Identify paired surfaces such as a container-like component rendering a presenter-like child. |
| `file`, `span`, and export metadata | Ground finding locations and stable evidence where available. |

The goal is not to decide whether a component is architecturally correct. The goal is to surface high-signal cases where the repository names a role one way and the observed syntax suggests a different role surface.

## Scope

### In scope

- Add a React adapter-owned analyzer for rule id `react/container-presenter-role-drift`.
- Keep implementation in `packages/adapter-react`; avoid `packages/core/**` by default.
- Detect only current-source, repo-local role-name/syntax divergence.
- Use existing graph facts and component metadata; do not require new core fact extraction.
- Require strong paired evidence before emitting a finding, for example:
  - a container-like component renders a presenter-like child; and
  - the presenter-like child has observed state/data/effect hook calls that conflict with a presentational role surface.
- Ground every finding in observed names, files, spans, hook names, and render relationships when available.
- Preserve deterministic ordering, stable fingerprints, and pure synchronous analyzer execution.
- Update OpenSpec deltas in later SDD phases for `react-pattern-analyzers` and `pattern-drift` if this proposal is approved.
- Add strict TDD coverage before implementation during apply.

### Out of scope / non-goals

- No provider/context analyzer.
- No controlled/uncontrolled analyzer.
- No forms analyzer.
- No data-fetching analyzer.
- No design-system usage analyzer.
- No overlay analyzer beyond existing compound primitive work.
- No broad API convention analyzer.
- No new MCP drift tool.
- No historical-drift behavior beyond existing snapshot comparison flows.
- No LLM inference, team-intent inference, root-cause claims, wrongdoing claims, user-impact claims, or required-remediation claims.
- No semantic symbol resolution expansion.
- No automatic config, memory, feedback, snapshot, or instruction-file writes from this analyzer.
- No React-specific catalog names, role labels, or rule logic inside `@rai/core`.

## Proposed analyzer semantics

The analyzer should treat roles as observed evidence, not truth. A role seed is a string or path convention visible in the current graph, such as:

- container-like: `*Container`, files or directories containing `container` / `containers`;
- presenter-like: `*Presenter`, `*View`, files or directories containing `presenter`, `presenters`, `view`, or `views`.

A finding should require corroborating evidence, not a single name match. The first slice should prefer paired surfaces:

1. identify a container-like component;
2. identify a presenter-like component rendered by that container-like component;
3. inspect observed hook calls on the presenter-like component;
4. emit only if the hook evidence crosses the approved high-signal policy.

Initial high-signal hook policy should be intentionally conservative. Candidate hook classes include React state/effect hooks and recognized data-fetching hooks already represented as hook calls. The design phase should choose the final allow/deny set and document why it is deterministic and low-noise.

Finding language should use bounded terms such as:

- “observed container/presenter role-name divergence”; and
- “presenter-like component has observed hook usage inside a container/presenter render pair.”

Finding language must not say:

- “wrong architecture”;
- “bad separation of concerns”;
- “the team intended this to be pure”;
- “this caused a bug”; or
- “you must refactor.”

## Affected areas

| Area | Impact | Notes |
|------|--------|-------|
| `packages/adapter-react/src/` | New/modified | Add container/presenter role divergence analyzer and wire it through existing React adapter analyzer exports. |
| `packages/adapter-react/src/*.test.ts` | New/modified | Add strict TDD tests for healthy pairs, divergent pairs, determinism, and input immutability. |
| `fixtures/react/container-presenter/` | New | Add minimal fixtures for healthy and divergent container/presenter role surfaces if fixture coverage is needed. |
| `openspec/changes/p11-s2-react-pattern-analyzers/` | Modified | Add proposal now; later phases should add design, tasks, and spec deltas. |
| `openspec/specs/react-pattern-analyzers/spec.md` | Later spec delta | Extend P11 requirements from compound-only to include container/presenter role divergence. |
| `openspec/specs/pattern-drift/spec.md` | Later spec delta | Clarify that this analyzer reports current-source repo-local divergence, not historical drift. |
| `docs/STATUS.md` / `docs/ROADMAP.md` | Later apply/docs | Record completion and remaining deferred P11 families after implementation is verified. |
| `packages/core/**` | Avoid | Core should remain framework-agnostic and unchanged unless a later approved design explicitly needs generic, non-React data. |
| `packages/cli/**` / MCP entrypoints | Avoid by default | Existing React adapter composition from P11-S1 should carry the analyzer; touch only if integration coverage reveals a gap. |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Role names can look like intent inference | Medium | High | Phrase roles as observed name/path evidence only; do not claim author intent or required architecture. |
| Hook usage in presenter-like components can be noisy | Medium | Medium | Require paired container/presenter evidence and conservative hook policy; start with high-signal cases only. |
| Overlap with generic coupling or complexity analyzers | Low | Medium | Keep rule limited to React role-name/syntax divergence, not generic component quality. |
| Core boundary drift | Low | High | Implement in `packages/adapter-react`; add/reuse tests or import checks that prove `@rai/core` has no React adapter imports. |
| Non-deterministic evidence order | Medium | Medium | Sort role candidates, hook evidence, render pairs, and findings before returning. |
| Review workload exceeds active budget | Low | Medium | Keep S2 to one rule id; if apply forecast grows beyond 1200 changed lines, pause before implementation and ask for a delivery split decision. |
| User confusion with historical drift | Medium | Medium | Use “current-source divergence” language and preserve existing `get_drift` snapshot semantics. |

## Rollback plan

1. Remove `react/container-presenter-role-drift` from the React adapter analyzer list.
2. Revert the container/presenter analyzer, tests, and fixtures.
3. Revert OpenSpec deltas and status/roadmap notes for P11-S2 if the change is abandoned before archive.
4. Leave P11-S1 compound analyzer and P10 generic pattern facts intact.
5. If local analysis snapshots were created during development, ignore or delete snapshots that contain `react/container-presenter-role-drift`; the analyzer itself should not create memory, config, or feedback writes.

## Strict TDD validation notes

Strict TDD is active for this project. Apply must start with failing tests before implementation.

Minimum RED tests for the apply phase:

- healthy container/presenter pair emits no `react/container-presenter-role-drift` finding;
- presenter-like component with high-signal hook usage inside a paired container/presenter render surface emits one grounded finding;
- unpaired presenter-like component with hooks does not emit the rule in the first slice;
- container-like component without presenter-like render pair does not emit the rule;
- finding evidence includes observed role names, component names, file references, hook names, and spans when available;
- repeated identical input returns stable rule id, severity, fingerprint, message, and evidence order;
- reversed graph/component ordering returns equivalent findings;
- analyzer does not mutate frozen graph input;
- adapter analyzer failures continue through existing diagnostic isolation and do not become findings or writes;
- `@rai/core` remains free of React adapter imports and React-specific rule logic.

Required verification commands after implementation:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## Success criteria

- [ ] OpenSpec proposal is approved for P11-S2 with one rule id: `react/container-presenter-role-drift`.
- [ ] Analyzer behavior is implemented only in `packages/adapter-react` unless later design explicitly approves generic core work.
- [ ] Healthy container/presenter fixtures stay silent.
- [ ] Divergent paired fixtures emit deterministic, evidence-grounded findings.
- [ ] Findings describe observed role-name/syntax divergence only.
- [ ] Findings do not claim team intent, root cause, wrongdoing, semantic identity, historical change, or required remediation.
- [ ] Existing P11-S1 compound analyzer behavior remains unchanged.
- [ ] Deferred P11 families remain silent.
- [ ] Existing MCP historical drift behavior remains snapshot-based; no new drift tool is added.
- [ ] Strict TDD and full verification commands pass before archive.

## Deferred families

The following P11 families remain deferred and should not emit findings in P11-S2:

| Family | Deferred reason |
|--------|-----------------|
| provider/context | Current facts do not ground `useContext(SomeContext)` bindings strongly enough without argument/binding expansion. |
| controlled/uncontrolled | Needs JSX attribute evidence such as `value`, `defaultValue`, `checked`, and handlers. |
| forms | Needs JSX attributes, events, submit/action semantics, and likely form-library conventions. |
| data fetching | Possible later from call/import facts, but wording and repo-local convention evidence need a separate design. |
| design-system usage | Needs explicit project catalog/config to avoid hardcoded ecosystem assumptions. |
| overlays beyond compound primitives | Needs catalog growth and likely additional JSX/portal evidence. |
| broad API conventions | Too broad for one strict-TDD slice and high ambiguity risk. |

## Next SDD step

Write the design for `p11-s2-react-pattern-analyzers`, including the exact role-seed policy, hook-signal policy, evidence shape, deterministic ordering rules, and tests-to-implementation mapping.
