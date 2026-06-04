# Proposal: P11-S3 React Controlled/Uncontrolled Prop-Surface Drift

## Status

proposed

## Intent

Add the third P11 React pattern analyzer slice: `react/controlled-uncontrolled-prop-surface-drift`.

The analyzer should report only a bounded current-source API-surface signal: a component exposes both controlled and uncontrolled prop names for the same state slot, such as `value` with `defaultValue`, `checked` with `defaultChecked`, or `open` with `defaultOpen`.

Implementation remains adapter-owned in `@rai/adapter-react`. `@rai/core` must remain framework-agnostic and unchanged by default.

## Motivation

P11-S1 proved the adapter-owned analyzer path with compound component API drift. P11-S2 added a second grounded analyzer for container/presenter role-name divergence. P11-S3 should continue the same pattern with the smallest high-value React family that current facts can support safely.

Controlled/uncontrolled prop-surface drift is the best fit because it can use existing component graph data without new core extraction:

| Evidence source | Use in this slice |
|-----------------|-------------------|
| `ComponentNode.propNames` | Detect approved controlled/default prop pairs on one component surface. |
| `ComponentNode.hookCalls` | Optional supporting evidence for local state hooks. |
| `ComponentNode.name`, `file`, `span`, `id` | Ground subject, fingerprint, and explanation text. |
| Existing analyzer composition | Surface findings through CLI/MCP without new CLI/MCP behavior. |

The goal is not to prove runtime controlled behavior or a bug. The goal is to surface a review-worthy API-shape signal where one component's observed prop names expose two state-ownership surfaces for the same slot.

## Scope

### In scope

- Add a React adapter-owned analyzer for rule id `react/controlled-uncontrolled-prop-surface-drift`.
- Detect only approved same-slot prop-name pairs observed in `ComponentNode.propNames`:
  - `value` + `defaultValue`
  - `checked` + `defaultChecked`
  - `open` + `defaultOpen`
- Include optional evidence for observed handler props:
  - `onChange`
  - `onValueChange`
  - `onCheckedChange`
  - `onOpenChange`
- Include optional evidence for state hooks such as `useState` and `useReducer` when observed.
- Emit deterministic findings with stable fingerprints and deterministic evidence order.
- Implement an analyzer-owned `Analyzer.explain` hook with evidence-first human wording.
- Register/export the analyzer through the React adapter composition path.
- Add strict TDD tests before implementation.
- Update OpenSpec and status/roadmap docs if implementation is verified.

### Out of scope / non-goals

- No provider/context analyzer.
- No forms analyzer.
- No data-fetching analyzer.
- No design-system usage analyzer.
- No overlay analyzer beyond existing compound primitive work.
- No broad API convention analyzer.
- No JSX attribute extraction.
- No TypeScript interface/type prop extraction.
- No runtime value inference.
- No semantic symbol resolution expansion.
- No changes to persistence, memory, snapshots, feedback, or MCP raw contracts.
- No React-specific rule logic, role labels, catalog names, or semantics inside `@rai/core`.
- No claim that supporting both controlled and uncontrolled props is wrong, buggy, unintended, or requires remediation.

## Proposed analyzer semantics

The analyzer treats prop names as observed syntax evidence only.

A finding should be emitted when one component has at least one approved controlled/default pair in `propNames`.

Initial approved pairs:

| Slot | Controlled prop | Uncontrolled/default prop |
|------|-----------------|---------------------------|
| value | `value` | `defaultValue` |
| checked | `checked` | `defaultChecked` |
| open | `open` | `defaultOpen` |

Severity policy:

- `info` when one mixed pair is observed.
- `warn` when more than one mixed pair is observed.

Finding language should use bounded terms such as:

- “observed controlled/uncontrolled prop-surface drift”;
- “component exposes both `value` and `defaultValue` prop names”; and
- “same component prop surface includes controlled/default prop names for the same slot.”

Finding language must not say:

- “this is a bug”;
- “this is wrong architecture”;
- “the team intended a different API”;
- “this causes runtime controlled/uncontrolled warnings”;
- “this must be refactored.”

## Human explanation

The analyzer must provide `Analyzer.explain` because `@rai/core` must not synthesize React-specific meaning for adapter-owned findings.

Example explanation summary:

```text
Input exposes both value and defaultValue prop names in the same component prop surface.
```

The explanation should include:

- component and file;
- mixed controlled/default pairs;
- optional handler props;
- optional local state hooks;
- observed metrics and threshold;
- explicit limits.

## Affected areas

| Area | Impact | Notes |
|------|--------|-------|
| `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.ts` | New | Analyzer and explanation hook. |
| `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts` | New | Strict TDD tests for detection, silence cases, determinism, immutability, evidence, and explanation. |
| `packages/adapter-react/src/core-adapter.ts` | Modified | Register analyzer in React adapter composition. |
| `packages/adapter-react/src/core-adapter.test.ts` | Modified | Prove normal adapter composition includes the analyzer and preserves explanation hook. |
| `packages/adapter-react/src/index.ts` | Modified | Export analyzer/rule id if consistent with existing package exports. |
| `openspec/changes/p11-s3-react-pattern-analyzers/` | New/modified | Proposal, spec, design, tasks, later apply/verify/sync/archive. |
| `openspec/specs/react-pattern-analyzers/spec.md` | Later sync | Add P11-S3 controlled/uncontrolled requirements after verification. |
| `openspec/specs/explainability/spec.md` | Later sync | Add coverage requirement for the new adapter-owned explanation. |
| `docs/STATUS.md` / `docs/ROADMAP.md` | Later apply/docs | Record P11-S3 completion and next work after verification. |
| `packages/core/**` | Avoid | Core should remain unchanged unless a later approved design proves generic facts are required. |
| CLI/MCP implementation | Avoid | Existing analyzer composition and explanation paths should carry the new rule. |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Intentional dual-mode components are common | Medium | Medium | Use low severity and bounded wording; describe review signal only. |
| `propNames` misses typed `props` object fields | High | Low | Report only observed destructured props; document false-negative boundary. |
| Prop-level spans are unavailable | High | Low | Use component span/file only; do not claim exact prop source spans. |
| Evidence shape uses adapter metric topology for prop evidence | Medium | Low | Keep roles/metrics clear and use `topology.exceeded` only for stable threshold labels. |
| Scope creep into forms/JSX attrs/types | Medium | High | Stop and redesign as a separate fact-expansion change if required. |
| Review size grows beyond active budget | Medium | Medium | Pause after tasks if forecast stays above 400 changed lines and before apply if it approaches/exceeds the active budget. |

## Rollback plan

1. Remove `react/controlled-uncontrolled-prop-surface-drift` from the React adapter analyzer list.
2. Revert the analyzer, tests, and any fixture additions.
3. Revert OpenSpec deltas and status/roadmap docs for P11-S3 if abandoned before archive.
4. Leave P11-S1 compound and P11-S2 container/presenter analyzers intact.
5. Since the analyzer must not write persistence, feedback, config, snapshots, memory, or instruction files directly, rollback should not require data migration.

## Strict TDD validation notes

Strict TDD is active. Apply must start with failing tests before implementation.

Minimum RED tests:

- component with only `value` emits no finding;
- component with only `defaultValue` emits no finding;
- component with `value` and `defaultValue` emits one grounded finding;
- component with `checked` and `defaultChecked` emits one grounded finding;
- component with `open` and `defaultOpen` emits one grounded finding;
- component with multiple mixed pairs escalates to `warn` and deterministic evidence order;
- handler props and state hooks are recorded only as supporting evidence;
- repeated identical input returns stable rule id, severity, fingerprint, message, and evidence order;
- reversed graph/component ordering returns equivalent findings;
- analyzer does not mutate frozen graph input;
- analyzer-owned explanation is plain-language, evidence-first, and bounded;
- adapter composition includes the analyzer and preserves its explanation hook;
- deferred P11 families remain silent.

Required verification commands after implementation:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## Success criteria

- [ ] OpenSpec proposal is approved for P11-S3 with one new rule id: `react/controlled-uncontrolled-prop-surface-drift`.
- [ ] Analyzer behavior is implemented only in `packages/adapter-react` unless later design explicitly approves generic core work.
- [ ] Findings emit only for approved controlled/default prop-name pairs on one component.
- [ ] Findings include stable evidence for component, file/span, pairs, optional handlers, optional state hooks, metrics, thresholds, and exceeded labels.
- [ ] Findings describe observed prop-surface drift only.
- [ ] Findings do not claim runtime behavior, warnings, bugs, team intent, root cause, user impact, historical change, or required remediation.
- [ ] Existing P11-S1 and P11-S2 analyzer behavior remains unchanged.
- [ ] Deferred React families remain silent.
- [ ] Existing CLI/MCP raw contracts remain unchanged.
- [ ] Strict TDD and full verification commands pass before archive.

## Deferred families

The following P11 families remain deferred and must not emit new findings in P11-S3:

- provider/context;
- forms;
- data fetching;
- design-system usage;
- overlays beyond compound primitive evidence;
- broad API conventions.
