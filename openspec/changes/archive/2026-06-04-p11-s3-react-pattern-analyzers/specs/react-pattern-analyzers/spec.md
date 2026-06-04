# Delta for React Pattern Analyzers

## ADDED Requirements

### Requirement: Controlled/Uncontrolled Prop-Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id `react/controlled-uncontrolled-prop-surface-drift`. The analyzer MUST inspect observed component prop names and emit findings only when a single component exposes an approved controlled prop and uncontrolled/default prop for the same state slot. The first approved pairs MUST be `value` with `defaultValue`, `checked` with `defaultChecked`, and `open` with `defaultOpen`. The analyzer MUST be pure and deterministic over its analysis input.

#### Scenario: Single controlled prop stays silent

- GIVEN a component has an observed prop surface containing `value`
- AND the same component does not have `defaultValue`
- WHEN React pattern analyzers run
- THEN no `react/controlled-uncontrolled-prop-surface-drift` finding MUST be emitted for the value slot.

#### Scenario: Single default prop stays silent

- GIVEN a component has an observed prop surface containing `defaultValue`
- AND the same component does not have `value`
- WHEN React pattern analyzers run
- THEN no `react/controlled-uncontrolled-prop-surface-drift` finding MUST be emitted for the value slot.

#### Scenario: Mixed value/defaultValue pair is reported

- GIVEN a component has observed prop names `value` and `defaultValue`
- WHEN React pattern analyzers run
- THEN a `react/controlled-uncontrolled-prop-surface-drift` finding MUST be emitted for that component
- AND the finding MUST identify the `value` / `defaultValue` pair in stable evidence.

#### Scenario: Mixed checked/defaultChecked pair is reported

- GIVEN a component has observed prop names `checked` and `defaultChecked`
- WHEN React pattern analyzers run
- THEN a `react/controlled-uncontrolled-prop-surface-drift` finding MUST be emitted for that component
- AND the finding MUST identify the `checked` / `defaultChecked` pair in stable evidence.

#### Scenario: Mixed open/defaultOpen pair is reported

- GIVEN a component has observed prop names `open` and `defaultOpen`
- WHEN React pattern analyzers run
- THEN a `react/controlled-uncontrolled-prop-surface-drift` finding MUST be emitted for that component
- AND the finding MUST identify the `open` / `defaultOpen` pair in stable evidence.

#### Scenario: Multiple mixed pairs are deterministic

- GIVEN a component has more than one approved controlled/default prop pair
- WHEN React pattern analyzers run repeatedly on identical input
- THEN returned findings MUST use deterministic rule ids, severity, fingerprints, messages, evidence order, metrics, thresholds, and exceeded labels.

### Requirement: Controlled/Uncontrolled Finding Evidence and Claims

Controlled/uncontrolled prop-surface drift findings MUST be grounded in observed current-source component facts. Each finding MUST include stable evidence for the component subject, observed mixed prop pairs, optional observed handler props, optional observed state-hook calls, metrics, thresholds, source file identity, and available component span. Finding messages and evidence MUST describe observed prop-surface drift only. They MUST NOT claim runtime controlled behavior, runtime React warnings, a bug, wrong architecture, team intent, semantic type information, root cause, user impact, historical change, or required remediation.

#### Scenario: Evidence references observed prop facts

- GIVEN a controlled/uncontrolled prop-surface finding is emitted
- WHEN the finding message and evidence are inspected
- THEN the evidence MUST identify the observed component name and file
- AND the evidence MUST identify the approved controlled/default prop pair or pairs
- AND file/span references MUST be included when the underlying component facts provide them.

#### Scenario: Supporting evidence does not become an emission requirement

- GIVEN a component has an approved controlled/default prop pair
- AND the component also has observed handler props or state-hook calls
- WHEN the finding is emitted
- THEN handler props and state-hook calls MAY appear as supporting evidence
- AND the finding MUST still be grounded primarily in the observed prop pair.

#### Scenario: Claims remain bounded to prop surface

- GIVEN a controlled/uncontrolled prop-surface finding is emitted
- WHEN CLI or MCP output presents the finding
- THEN the message MUST describe observed prop-name surface drift or equivalent current-source disagreement
- AND the message MUST NOT state that the component is runtime-controlled, runtime-uncontrolled, buggy, architecturally wrong, or required to be refactored.

### Requirement: Controlled/Uncontrolled Analyzer Scope Boundaries

The controlled/uncontrolled analyzer MUST run inside the React adapter and consume existing `RepoGraph` component metadata, prop names, hook calls, source files, spans, project configuration, and adapter-owned metadata. The analyzer MUST NOT require React-specific rule logic, catalog names, role labels, or fact extraction inside `@rai/core`. It MUST NOT write persistence, feedback, config, memory, snapshots, or instruction files directly.

#### Scenario: Core remains framework-agnostic for P11-S3

- GIVEN `react/controlled-uncontrolled-prop-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports, packages, and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain React-specific controlled/uncontrolled rule logic, rule ids, catalog names, role labels, or adapter imports.

#### Scenario: Analyzer output has no direct writes

- GIVEN the controlled/uncontrolled analyzer returns findings or diagnostics
- WHEN analysis completes
- THEN all outputs MUST flow through the existing analyzer result path
- AND the analyzer MUST NOT write configuration, memory, snapshots, feedback, persistence, or instruction files directly.

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S3 MUST NOT emit findings for provider/context, forms, data fetching, design-system usage, overlays beyond compound primitive evidence, or broad API convention families. Those families MAY be specified and implemented by later approved changes.

(Previously: P11-S2 deferred provider/context, controlled/uncontrolled, forms, data-fetching, design-system usage, overlays beyond compound primitive evidence, and broad API convention families.)

#### Scenario: Deferred family code does not create P11-S1 findings

- GIVEN source code contains provider/context, form, data-fetching, design-system, or container/presenter patterns
- WHEN P11-S1 React pattern analyzers run
- THEN no findings for those deferred React pattern families MUST be emitted
- AND any emitted React pattern finding MUST belong to the compound component API divergence family.

#### Scenario: P11-S2 deferred families remain silent

- GIVEN source code contains provider/context, controlled/uncontrolled, forms, data-fetching, design-system usage, overlays beyond compound primitive evidence, or broad API convention patterns
- WHEN P11-S2 React pattern analyzers run
- THEN no findings for those deferred React pattern families MUST be emitted
- AND any new P11-S2 React pattern finding MUST belong to `react/container-presenter-role-drift`.

#### Scenario: P11-S3 remaining deferred families remain silent

- GIVEN source code contains provider/context, forms, data-fetching, design-system usage, overlays beyond compound primitive evidence, or broad API convention patterns
- WHEN P11-S3 React pattern analyzers run
- THEN no findings for those deferred React pattern families MUST be emitted
- AND any new P11-S3 React pattern finding MUST belong to `react/controlled-uncontrolled-prop-surface-drift`.
