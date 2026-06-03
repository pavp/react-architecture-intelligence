# Delta for React Pattern Analyzers

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S2 MUST NOT emit findings for provider/context, controlled/uncontrolled, forms, data fetching, design-system usage, overlays beyond compound primitive evidence, or broad API convention families. Those families MAY be specified and implemented by later approved changes.

(Previously: P11-S1 deferred container/presenter along with provider/context, controlled/uncontrolled, forms, data fetching, design-system usage, overlays beyond compound primitive evidence, and broad API convention families.)

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
