# React Pattern Analyzers Specification

## Purpose

Define adapter-owned React pattern analyzers that convert framework-neutral pattern facts into deterministic React findings without moving React interpretation into `@rai/core`.

## Requirements

### Requirement: Adapter-Owned React Analyzer Boundary

React pattern analyzer behavior MUST live outside `packages/core`. React analyzers MUST consume only frozen `RepoGraph` data, project configuration, and adapter-owned catalog metadata. `@rai/core` MUST NOT import React adapter modules or contain React-specific catalog names, rule IDs, roles, variants, pattern labels, remediation, or intent claims.

#### Scenario: Core remains framework-agnostic

- GIVEN the React adapter package provides pattern analyzer behavior
- WHEN package dependencies, imports, and core graph/finding contracts are inspected
- THEN `@rai/core` MUST NOT import React adapter code
- AND React-specific pattern interpretation MUST remain outside core.

#### Scenario: Analyzer has no direct persistence writes

- GIVEN a React pattern analyzer returns findings or diagnostics
- WHEN analysis completes
- THEN all analyzer outputs MUST flow through the existing analyzer result path
- AND the analyzer MUST NOT write persistence, feedback, config, memory, snapshots, or instruction files directly.

### Requirement: Pure Deterministic React Analyzer Execution

React pattern analyzers MUST be pure, synchronous analyzers over their analysis input. Repeated analysis of identical input MUST produce equivalent findings, stable fingerprints, deterministic diagnostics, and deterministically ordered evidence. React analyzers MUST NOT use LLM inference, generic best-practice claims, wall-clock time, filesystem mutation, network state, or non-deterministic iteration to decide findings.

#### Scenario: Identical input is stable

- GIVEN identical source files, configuration, and graph pattern facts are analyzed twice
- WHEN React pattern analyzers run
- THEN returned findings MUST have equivalent rule IDs, severities, fingerprints, messages, and evidence values
- AND evidence arrays and map-like values MUST appear in deterministic order.

#### Scenario: Analyzer failures use existing diagnostics

- GIVEN a React pattern analyzer fails during execution
- WHEN the analyzer pipeline handles the failure
- THEN analysis MUST continue according to the existing diagnostic isolation contract
- AND the failure MUST NOT become a finding, memory write, config change, or unstructured process-side effect.

### Requirement: Compound Component API Divergence Detection

The first React pattern analyzer slice MUST be limited to compound component / compound primitive API divergence. The analyzer MUST derive candidate compound roots from observed repository facts, including static member assignment facts and dot-member JSX facts for the same root. It MUST derive `declaredParts` from observed member assignments and `usedParts` from observed JSX member usage. It MUST emit `react/compound-component-api-drift` findings only when the observed declared and used part sets disagree.

#### Scenario: Healthy compound usage produces no divergence finding

- GIVEN a compound root has observed static member assignments for each dot-member JSX part used in the repository
- WHEN React pattern analyzers run
- THEN no `react/compound-component-api-drift` finding MUST be emitted for that root.

#### Scenario: JSX-used part without declaration is reported

- GIVEN a compound root has dot-member JSX usage for a part with no matching observed static member assignment
- WHEN React pattern analyzers run
- THEN a `react/compound-component-api-drift` finding MUST be emitted for that root
- AND the finding MUST identify the part under `missingDeclarations` or an equivalent stable evidence field.

#### Scenario: Declared part without observed usage is handled as current-source divergence

- GIVEN a compound root has an observed static member assignment for a part that is not observed in dot-member JSX usage
- WHEN React pattern analyzers choose to surface that disagreement
- THEN the finding MUST identify the part under `unusedDeclarations` or an equivalent stable evidence field
- AND the finding MUST describe only observed current-repository divergence, not dead code, intended API shape, or required remediation.

### Requirement: Grounded Finding Evidence and Claims

React pattern findings MUST be grounded in existing graph and pattern facts. Each compound API divergence finding MUST include stable evidence for the root, relevant part names, source file identity, and available spans. Findings MUST NOT claim team intent, component ownership, symbol identity beyond observed names, historical drift, root cause, user impact, or remediation unless those claims are directly represented by existing facts.

#### Scenario: Evidence references source facts

- GIVEN a compound API divergence is detected from member-assignment and JSX pattern facts
- WHEN the finding is returned through CLI or MCP analysis output
- THEN the finding evidence MUST reference the observed fact-derived root and part names
- AND file/span references MUST be included when the underlying facts provide them.

#### Scenario: Claims remain evidence-bounded

- GIVEN a divergence finding is emitted for a React fixture
- WHEN the finding message and evidence are inspected
- THEN they MUST describe disagreement between observed declarations and observed JSX usage
- AND they MUST NOT assert that the team intended a different API, that a symbol was resolved semantically, or that a specific code change is required.

### Requirement: Container/Presenter Role-Name Divergence Detection

The React adapter MUST provide an adapter-owned analyzer for rule id `react/container-presenter-role-drift`. The analyzer MUST treat container/presenter roles as observed current-source evidence from component names and file/path strings, not as architectural truth or author intent. The analyzer MUST emit findings only when a container-like component renders a presenter-like component and the presenter-like component has observed high-signal state, effect, or data-hook syntax evidence that diverges from the presenter-like role surface. The analyzer MUST be pure and deterministic over its analysis input.

#### Scenario: Divergent paired role surface is reported

- GIVEN current repository facts contain a container-like component name or path
- AND that container-like component renders a presenter-like component identified by observed name or path evidence
- AND the presenter-like component has observed high-signal hook calls represented in the graph
- WHEN React pattern analyzers run
- THEN exactly the grounded `react/container-presenter-role-drift` findings for those paired surfaces MUST be emitted
- AND the findings MUST describe observed container/presenter role-name and syntax divergence.

#### Scenario: Healthy paired role surface stays silent

- GIVEN current repository facts contain a container-like component that renders a presenter-like component
- AND the presenter-like component does not have high-signal hook syntax evidence for this rule
- WHEN React pattern analyzers run
- THEN no `react/container-presenter-role-drift` finding MUST be emitted for that pair.

#### Scenario: Unpaired presenter-like hook usage stays silent

- GIVEN a presenter-like component has observed high-signal hook calls
- AND no observed container-like component renders that presenter-like component
- WHEN React pattern analyzers run
- THEN no `react/container-presenter-role-drift` finding MUST be emitted for that unpaired component.

#### Scenario: Container-like component without presenter pair stays silent

- GIVEN a container-like component has observed role-name or path evidence
- AND it does not render an observed presenter-like component
- WHEN React pattern analyzers run
- THEN no `react/container-presenter-role-drift` finding MUST be emitted for that component.

### Requirement: Container/Presenter Finding Evidence and Claims

Container/presenter role divergence findings MUST be grounded in observed graph facts. Each finding MUST include stable evidence for the observed container-like component, observed presenter-like component, role-name or path seeds, render relationship, hook names, source files, and spans when those values are available. Finding messages and evidence MUST use bounded language such as observed role-name/syntax divergence. Findings MUST NOT claim wrong architecture, bad separation of concerns, team intent, semantic identity beyond observed names, root cause, user impact, historical change, or required remediation.

#### Scenario: Evidence references observed role and syntax facts

- GIVEN a container/presenter role divergence finding is emitted
- WHEN the finding message and evidence are inspected
- THEN the evidence MUST identify the observed role-name or path seeds used for the container-like and presenter-like components
- AND the evidence MUST identify the observed hook names and render relationship that grounded the finding
- AND file/span references MUST be included when the underlying graph facts provide them.

#### Scenario: Claims remain bounded to current-source divergence

- GIVEN a container/presenter role divergence finding is emitted
- WHEN CLI or MCP output presents the finding
- THEN the message MUST describe observed container/presenter role-name and syntax divergence or equivalent current-source disagreement
- AND the message MUST NOT state that the code is architecturally wrong, that the team intended another design, that a bug was caused, or that refactoring is required.

### Requirement: Container/Presenter Analyzer Scope Boundaries

The container/presenter analyzer MUST run inside the React adapter and consume existing `RepoGraph` component metadata, render edges, hook calls, source files, spans, project configuration, and adapter-owned metadata. The analyzer MUST NOT require React-specific rule logic, catalog names, role labels, or fact extraction inside `@rai/core`. It MUST NOT write persistence, feedback, config, memory, snapshots, or instruction files directly.

#### Scenario: Core remains framework-agnostic for P11-S2

- GIVEN `react/container-presenter-role-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports, packages, and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain React-specific container/presenter roles, rule logic, rule IDs, catalog names, or adapter imports.

#### Scenario: Analyzer output has no direct writes

- GIVEN the container/presenter analyzer returns findings or diagnostics
- WHEN analysis completes
- THEN all outputs MUST flow through the existing analyzer result path
- AND the analyzer MUST NOT write configuration, memory, snapshots, feedback, persistence, or instruction files directly.

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
