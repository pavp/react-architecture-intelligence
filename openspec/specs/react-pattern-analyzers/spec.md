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

### Requirement: Deferred React Pattern Families Stay Out of P11-S1

P11-S1 MUST NOT emit findings for provider/context, controlled/uncontrolled, forms, data fetching, design-system usage, overlays beyond compound primitive evidence, container/presenter, or broad API convention families. Those families MAY be specified and implemented by later approved changes.

#### Scenario: Deferred family code does not create P11-S1 findings

- GIVEN source code contains provider/context, form, data-fetching, design-system, or container/presenter patterns
- WHEN P11-S1 React pattern analyzers run
- THEN no findings for those deferred React pattern families MUST be emitted
- AND any emitted React pattern finding MUST belong to the compound component API divergence family.
