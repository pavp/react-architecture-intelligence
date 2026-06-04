# Explore: P11-S3 React Controlled/Uncontrolled Prop-Surface Drift

## Status

complete

## Executive summary

P11-S3 should implement the controlled/uncontrolled family as one narrow adapter-owned analyzer:

- Rule id: `react/controlled-uncontrolled-prop-surface-drift`
- Package owner: `packages/adapter-react`
- Finding claim: one component's observed prop surface exposes both controlled and uncontrolled prop names for the same state slot.
- Data source: existing `RepoGraph.components`, especially `ComponentNode.propNames`, optional `hookCalls`, component `file`, `span`, `id`, and `name`.
- Core impact: no `@rai/core` fact expansion required.
- Review size forecast: one PR, about 700-1000 changed lines if scope stays tight.

This slice is smaller and safer than provider/context, forms, data-fetching, design-system usage, deeper overlays, or broad API conventions because it can be grounded in current facts without inventing runtime behavior, symbol resolution, JSX attribute semantics, catalog membership, or team intent.

## Recommended slice

### Family

Controlled/uncontrolled React API surface.

### Rule id

`react/controlled-uncontrolled-prop-surface-drift`

### Analyzer ownership

`packages/adapter-react`

### Grounding facts available now

| Existing fact | Use |
|---------------|-----|
| `RepoGraph.components` | Iterate component surfaces deterministically. |
| `ComponentNode.propNames` | Detect observed paired prop names. |
| `ComponentNode.hookCalls` | Optional supporting evidence for local state hooks such as `useState` / `useReducer`. |
| `ComponentNode.file` / `span` / `id` / `name` | Ground subject, fingerprint, and inspect-first output. |

### Initial controlled/default slot pairs

- `value` + `defaultValue`
- `checked` + `defaultChecked`
- `open` + `defaultOpen`

### Optional supporting props

Handler props should be evidence only, not required for emission:

- `onChange`
- `onValueChange`
- `onCheckedChange`
- `onOpenChange`

### Detection sketch

1. Iterate components in deterministic order.
2. Inspect the observed `propNames` set for approved controlled/default pairs.
3. Emit a finding only when at least one approved pair is present in the same component.
4. Include optional handler props and state hooks as evidence when observed.
5. Use `info` for one mixed pair and `warn` for multiple mixed pairs.
6. Keep all claims bounded to current-source prop names.

### Evidence shape

Use existing `AdapterMetricEvidence`.

Suggested roles:

- `controlled-prop`
- `uncontrolled-prop`
- `controlled-uncontrolled-pair`
- optional `change-handler-prop`
- optional `state-hook`

Suggested metrics:

- `mixedPropPairs`
- `controlledProps`
- `uncontrolledProps`
- `handlerProps`
- `stateHookCalls`
- `propCount`

Suggested thresholds:

- `maxMixedPropPairs: 0`

Suggested topology exceeded values:

- `controlledUncontrolledPair:value/defaultValue`
- `controlledUncontrolledPair:checked/defaultChecked`
- `controlledUncontrolledPair:open/defaultOpen`

## Human explanation requirements

The analyzer should provide `Analyzer.explain` because core fallback must not invent React semantics for adapter metrics.

Example summary:

```text
Input exposes both value and defaultValue prop names in the same component prop surface.
```

Explanation should include:

- component and file;
- paired controlled/default props;
- optional handler props;
- optional state hooks;
- observed counts and threshold;
- explicit limits.

Limits must say the finding does not prove:

- runtime controlled behavior;
- a bug;
- wrong architecture;
- team intent;
- root cause;
- user impact;
- required remediation.

## Alternatives considered

### Provider/context

Current facts show some `createContext`, `useContext`, and `<X.Provider>` syntax, but the graph does not safely link context variables, provider values, consumer hook arguments, and ownership. A useful provider/context rule likely needs generic call-binding/call-arg facts and JSX attribute facts. Defer.

### Forms

Current JSX facts capture tags, not JSX attributes such as `value`, `defaultValue`, `name`, `action`, `method`, or `onSubmit`. A forms analyzer would require JSX attribute fact expansion. Defer.

### Data fetching

Hook and call names can show `useQuery`, `useSWR`, `fetch`, and similar syntax, but a standalone finding risks broad best-practice claims without enough role or route context. P11-S2 already uses high-signal data hooks safely inside a paired role divergence rule. Defer.

### Design-system usage

Imports and JSX tags can show package/tag usage, but there is no repo design-system catalog or config. Hardcoded popular packages would invent convention. Defer until catalog/config exists.

### Overlays beyond compound primitives

Dot-member JSX supports primitive part evidence, and P11-S1 already covers compound API declaration/usage drift. Deeper overlay correctness would need stronger ancestry, attribute, and catalog semantics. Defer.

### Broad API conventions

Too wide for one slice and too likely to exceed the current review budget. Defer.

## Likely files

### New

- `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.ts`
- `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts`
- optional `fixtures/react/controlled-uncontrolled/`

### Modified

- `packages/adapter-react/src/core-adapter.ts`
- `packages/adapter-react/src/index.ts`
- `packages/adapter-react/src/core-adapter.test.ts`
- `openspec/specs/react-pattern-analyzers/spec.md` during sync/archive
- `openspec/specs/explainability/spec.md` during sync/archive
- `docs/STATUS.md`
- `docs/ROADMAP.md`

### Avoid by default

- `packages/core/**`
- CLI/MCP implementation files unless integration coverage exposes a composition gap.

## Workload forecast

| Area | Forecast |
|------|----------|
| Analyzer + export/register | 220-320 lines |
| Unit tests + integration fixture | 300-450 lines |
| OpenSpec/docs | 150-250 lines |
| Total | 700-1000 changed lines |

This should fit the active 1200-line review budget if scope stays narrow.

## Risks

| Risk | Mitigation |
|------|------------|
| Many components intentionally support both controlled and uncontrolled props. | Use low severity and bounded wording; do not claim bug or remediation. |
| `propNames` only sees first-parameter destructuring, not TypeScript interface fields. | Accept as current-fact boundary; report only observed prop names. |
| Prop-level spans are unavailable. | Use component span and file only; do not claim exact prop spans. |
| `AdapterMetricEvidence.topology` is imperfect for prop-surface evidence. | Use `topology.exceeded` plus clear `subject`, `roles`, and `metrics`. |
| Scope creep into JSX attributes/types/runtime values. | Stop and redesign as generic fact-expansion change if needed. |

## Stop gates

Stop before apply if implementation requires any of these:

- JSX attribute extraction;
- TypeScript type/interface field extraction;
- runtime value inference;
- React semantics inside `@rai/core`;
- claims that the component is wrong, buggy, or must be refactored;
- forecast above 1200 changed lines without explicit user approval.

## Next recommended

1. Create proposal/spec/design/tasks for `p11-s3-react-pattern-analyzers`.
2. Specify controlled/uncontrolled requirement and update deferred-family scope.
3. Start apply with strict TDD: RED tests before implementation.
4. Implement adapter analyzer only and register/export it.
5. Verify adapter explain hook and normal analysis path.
6. Run full validation before PR.
