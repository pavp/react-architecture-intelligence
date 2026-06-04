# Design: P11-S3 React Controlled/Uncontrolled Prop-Surface Drift

## Status

designed

## Executive summary

P11-S3 adds one React adapter-owned analyzer: `react/controlled-uncontrolled-prop-surface-drift`.

The analyzer inspects existing component prop-name facts and emits a finding when one component exposes approved controlled/default prop names for the same slot. It does not infer runtime behavior, TypeScript types, JSX attributes, React warnings, author intent, or required remediation.

The implementation should be isolated to `packages/adapter-react` and should provide an analyzer-owned explanation hook so core does not invent React-specific meaning for adapter-metric evidence.

## Inputs

### Required input

- `AnalysisContext.graph.components`
- `ComponentNode.id`
- `ComponentNode.name`
- `ComponentNode.file`
- `ComponentNode.span`
- `ComponentNode.propNames`
- `ComponentNode.hookCalls`
- `AnalysisContext.runId`
- `AnalysisContext.commitSha`
- `AnalysisContext.analysisVersion`

### Not required

- JSX attributes
- TypeScript interface or type fields
- runtime values
- symbol resolution
- source-file text
- filesystem writes
- config writes
- persistence writes

## Rule id

```text
react/controlled-uncontrolled-prop-surface-drift
```

## Detection model

### Approved pairs

```ts
const CONTROLLED_DEFAULT_PAIRS = [
  { slot: "value", controlled: "value", uncontrolled: "defaultValue" },
  { slot: "checked", controlled: "checked", uncontrolled: "defaultChecked" },
  { slot: "open", controlled: "open", uncontrolled: "defaultOpen" },
];
```

A component crosses the threshold when both names in at least one pair appear in `component.propNames`.

### Supporting handler props

Handler props are supporting evidence only. They must not be required for emission.

```ts
const HANDLER_PROPS = [
  "onChange",
  "onValueChange",
  "onCheckedChange",
  "onOpenChange",
];
```

### Supporting state hooks

State hooks are supporting evidence only. They must not be required for emission.

```ts
const STATE_HOOKS = ["useState", "useReducer"];
```

## Algorithm

1. Copy and sort `ctx.graph.components` by file, span start, then component name.
2. For each component:
   1. Copy and sort `propNames`.
   2. Build an observed prop set.
   3. Find approved controlled/default pairs present in the set.
   4. If no pairs are present, continue.
   5. Collect supporting handler props from the set.
   6. Collect supporting state hooks from `hookCalls`.
   7. Build deterministic roles, metrics, thresholds, and exceeded labels.
   8. Build a stable subject fingerprint from component identity and pair labels.
   9. Emit one finding for the component.
3. Sort findings by structural fingerprint, then subject file/name if needed.

## Severity

- `info` when one mixed pair is observed.
- `warn` when two or more mixed pairs are observed.

No `error` severity in this slice.

## Evidence

Use existing `AdapterMetricEvidence`.

### Subject

```ts
subject: {
  id: `react:controlled-uncontrolled:${component.id}`,
  name: component.name,
  file: component.file,
  span: component.span,
  fingerprint: subjectFingerprint,
}
```

### Roles

Roles should be deterministic and sorted by role, variant, then file.

Suggested roles:

- `controlled-prop` with variant equal to the controlled prop name.
- `uncontrolled-prop` with variant equal to the default prop name.
- `controlled-uncontrolled-pair` with variant like `value/defaultValue`.
- `change-handler-prop` with variant equal to each observed handler prop.
- `state-hook` with variant equal to each observed state hook.

All roles use the component file because prop-level spans are not available.

### Metrics

```ts
metrics: {
  mixedPropPairs,
  controlledProps,
  uncontrolledProps,
  handlerProps,
  stateHookCalls,
  propCount,
}
```

### Thresholds

```ts
thresholds: {
  maxMixedPropPairs: 0,
}
```

### Topology

`AdapterMetricEvidence.topology` is retained for adapter compatibility, but this rule is not a graph-topology rule.

Use:

```ts
topology: {
  directChildIds: [],
  reachableNodeIds: [],
  exceeded: [
    "controlledUncontrolledPair:value/defaultValue",
  ],
}
```

## Fingerprints and ids

### Finding id

Include run id so finding ids remain run-scoped:

```text
sha(runId | ruleId | component.id | subjectFingerprint)
```

### Structural fingerprint

Include rule id, component file/name, and sorted mixed-pair labels:

```text
sha(ruleId | component.file | component.name | pair labels...)
```

### Nominal fingerprint

Use component name plus pair labels:

```text
sha(component.name | pair labels...)
```

### Positional fingerprint

Use component file and component span start/end:

```text
sha(component.file | span.start | span.end)
```

This keeps identity stable without requiring prop-level spans.

## Analyzer explanation hook

The analyzer must implement `explain(finding)` and return an `ExplanationEnvelope` only for matching rule id and `adapter-metric` evidence.

### Summary shape

For one pair:

```text
Input exposes both value and defaultValue prop names in the same component prop surface.
```

For multiple pairs:

```text
Input exposes multiple controlled/default prop-name pairs in the same component prop surface: value/defaultValue and checked/defaultChecked.
```

### Why it matters

```text
This is worth checking because controlled and default prop names describe different observed state-ownership surfaces for the same component API slot.
```

### Inspect-first examples

- `Input in src/Input.tsx`
- `mixed prop pair observed: value/defaultValue`
- `handler props observed: onChange`
- `state hooks observed: useState`
- `observed counts: 1 mixed pair, 2 controlled/default props, 1 handler prop, 1 state hook`
- `threshold crossed: mixed prop pairs 1 (limit: 0)`

### Limits

Must include limits equivalent to:

- This does not prove runtime controlled behavior, runtime React warnings, a bug, wrong architecture, or required remediation.
- RAI only compares observed component prop names in current source.
- RAI does not infer team intent, root cause, user impact, historical change, or semantic type information from this finding alone.

### Grounding fields

Use sorted keys from `AdapterMetricEvidence`, as prior adapter analyzers do.

## Determinism and immutability

The analyzer must:

- copy arrays before sorting;
- never mutate `ctx.graph`, `components`, `propNames`, `hookCalls`, evidence, config, persistence, memory, snapshots, or feedback;
- use deterministic sort order for components, roles, labels, and findings;
- set `createdAt: 0` like existing deterministic analyzers;
- avoid wall-clock time, filesystem reads/writes, network, and LLM inference.

## Adapter composition

Add the analyzer to the React adapter analyzer list in `packages/adapter-react/src/core-adapter.ts`.

Existing CLI and MCP composition should carry it without CLI/MCP implementation changes. Tests should prove analyzer and explanation hook survive adapter composition.

## Core boundary

No `packages/core/**` source change should be needed. The analyzer uses existing framework-neutral graph data.

If implementation requires new core facts, stop and redesign. Acceptable future expansion would need to be generic, non-React, and separately specified.

## Tests

### Analyzer tests

Create `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts`.

Test groups:

- silent cases:
  - only `value`;
  - only `defaultValue`;
  - handler props without mixed pair;
  - state hooks without mixed pair.
- finding cases:
  - `value/defaultValue`;
  - `checked/defaultChecked`;
  - `open/defaultOpen`;
  - multiple mixed pairs with `warn` severity.
- evidence:
  - subject file/span/name;
  - roles for pair, controlled prop, uncontrolled prop, optional handler, optional state hook;
  - metrics and thresholds;
  - exceeded labels.
- determinism:
  - identical graph returns equivalent findings;
  - reversed component/prop/hook input still returns equivalent evidence order.
- immutability:
  - frozen graph and nested arrays are not mutated.
- explanation:
  - summary is plain-language;
  - inspect-first cites pairs/handlers/hooks/counts;
  - limits are bounded and do not claim runtime behavior or remediation.

### Adapter composition tests

Extend `packages/adapter-react/src/core-adapter.test.ts` to verify:

- normal composition includes the new analyzer;
- composed analyzer emits the finding for a minimal graph/input;
- composed analyzer's explanation hook is available and used.

### Existing behavior guard

Run current adapter tests to prove P11-S1 and P11-S2 behavior remains unchanged.

## Verification

Required:

```bash
pnpm test packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

Optional if CLI/MCP-facing fixture is added:

```bash
./scripts/smoke.sh --build
```

## Review workload

Forecast remains 700-1000 changed lines:

- analyzer and export/register: 220-320 lines;
- tests: 300-450 lines;
- OpenSpec/docs: 150-250 lines.

This is above the 400-line review-risk trigger but expected under the current active 1200-line budget. Pause before apply for delivery approval or split decision.
