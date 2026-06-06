# React Pattern Analyzers Specification

**Status**: Active (RFC 2119)
**Origin**: changes `p11-s1-compound-divergence`, `p11-s2-role-divergence`, `p11-s3-prop-surface-drift`, `p11-s4-generic-patterns`, `p11-s5-context-provider-value-surface-drift`, `p11-s6-form-control-surface-drift`, `p11-s7-data-fetching-surface-drift`, `p11-s8-overlay-control-surface-drift`, `p11-s9-design-system-usage-surface-drift` (2026-05-30 onwards)
**Scope**: React-specific pattern analyzers owned by the adapter layer, consuming framework-agnostic facts from core.

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

### Requirement: Context Provider Value-Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id `react/context-provider-value-surface-drift` in the `provider/context` analyzer family. The analyzer MUST consume observed `call-binding`, `call-argument`, and `jsx-attribute` facts to correlate local context bindings with same-file `<Local.Provider>` provider occurrences by local binding name. The analyzer MUST identify local identifier bindings initialized by bare `createContext(...)` calls and member-form callees ending in `.createContext(...)`. For each correlated local binding, the analyzer MUST derive the observed createContext default-argument surface, classify each provider value-attribute surface as direct `value`, no direct `value`, and/or spread/ambiguous, and emit `type: "opportunity"` findings only for observed value-surface divergence.

#### Scenario: Bare createContext binding with absent default and missing direct provider value is reported

- GIVEN a same-file `call-binding` fact binds local identifier `AuthContext` from bare callee `createContext`
- AND no same-call `call-argument` fact exists for argument index `0`
- AND same-file `jsx-attribute` facts show an `<AuthContext.Provider>` occurrence with no direct `value` attribute
- WHEN React pattern analyzers run
- THEN a `react/context-provider-value-surface-drift` finding MUST be emitted for `AuthContext`
- AND the finding MUST report that no createContext default argument was observed and no direct provider `value` attribute was observed.

#### Scenario: Member createContext binding participates in provider surface divergence

- GIVEN a same-file `call-binding` fact binds local identifier `ThemeContext` from a member-form callee ending in `.createContext`
- AND a same-call `call-argument` fact exists for argument index `0` with a bounded `argumentKind`
- AND same-file `jsx-attribute` facts show one `<ThemeContext.Provider>` occurrence with direct `value`
- AND same-file `jsx-attribute` facts show another `<ThemeContext.Provider>` occurrence with no direct `value`
- WHEN React pattern analyzers run
- THEN a `react/context-provider-value-surface-drift` finding MUST be emitted for `ThemeContext`
- AND the finding MUST include evidence that the binding came from a member `createContext` callee, the default argument was observed, and provider direct-value presence diverged.

#### Scenario: Spread provider attributes are treated as ambiguous surface evidence

- GIVEN a same-file local context binding has a correlated `<SettingsContext.Provider>` occurrence
- AND the provider occurrence has a JSX spread attribute with no directly observed `value` attribute
- WHEN the analyzer emits a `react/context-provider-value-surface-drift` finding for that binding
- THEN the provider occurrence MUST be represented as spread/ambiguous value-surface evidence
- AND the finding MUST NOT claim that the spread was expanded, that `value` is absent inside the spread object, or that runtime provider value behavior is known.

#### Scenario: Consistent direct provider value surfaces stay silent

- GIVEN a same-file local context binding has no observed createContext default argument
- AND every correlated same-file `<Local.Provider>` occurrence has a direct `value` attribute
- AND no correlated provider occurrence has spread/ambiguous value-surface evidence
- WHEN React pattern analyzers run
- THEN no `react/context-provider-value-surface-drift` finding MUST be emitted for that binding.

#### Scenario: Context binding without same-file provider stays silent

- GIVEN a local identifier binding is initialized by `createContext(...)` or `*.createContext(...)`
- AND no same-file `<Local.Provider>` occurrence is observed for that local binding name
- WHEN React pattern analyzers run
- THEN no `react/context-provider-value-surface-drift` finding MUST be emitted for that binding.

### Requirement: Context Provider Surface Evidence and Claim Boundaries

Context provider value-surface drift findings MUST be grounded in observed current-source syntax facts. Each emitted finding MUST include stable evidence for the local context binding name, source file, createContext call span when available, observed default-argument presence or absence, bounded `argumentKind` when present, provider spans when available, provider value-surface classifications, metrics, thresholds, and exceeded labels. Optional `useContext(...)` or `use(...)` hook evidence MAY be included as corroboration when already observed, but hook evidence MUST NOT be required for emission. Finding messages and evidence MUST describe only observed same-file value-surface divergence and MUST NOT claim cross-file symbol identity, runtime semantics, a bug, team intent, root cause, user impact, historical drift, consumer completeness, or required remediation.

#### Scenario: Evidence references observed default and provider surfaces

- GIVEN a context provider value-surface drift finding is emitted
- WHEN the finding message and evidence are inspected
- THEN the evidence MUST identify the local context binding name and source file
- AND the evidence MUST identify whether createContext argument index `0` was observed
- AND the evidence MUST include the bounded `argumentKind` when a default argument was observed
- AND the evidence MUST identify each correlated provider occurrence as direct `value`, no direct `value`, and/or spread/ambiguous according to observed JSX attributes.

#### Scenario: Hook evidence is corroborating only

- GIVEN same-file `useContext(...)` or `use(...)` hook facts reference a local context binding that also has provider value-surface divergence
- WHEN the finding is emitted
- THEN hook facts MAY appear as supporting evidence
- AND the finding MUST still be emitted or suppressed based on createContext and provider value-surface facts, not on hook-call presence.

#### Scenario: Cross-file provider usage is not correlated

- GIVEN a context binding is observed in one file
- AND a `<Local.Provider>` tag with the same local name is observed only in another file
- WHEN React pattern analyzers run
- THEN the analyzer MUST NOT correlate those facts as one context/provider subject
- AND no finding MUST be emitted from that cross-file name match alone.

#### Scenario: Semantic value inference is excluded

- GIVEN provider occurrences use direct `value` expressions with different expression shapes or object fields
- WHEN React pattern analyzers classify provider value surfaces
- THEN the analyzer MUST treat those occurrences as direct `value` surfaces only
- AND the analyzer MUST NOT infer semantic value shape, runtime equivalence, TypeScript types, object fields, or intended provider API.

### Requirement: Context Provider Determinism and Fingerprint Stability

Context provider value-surface drift analysis MUST be pure, synchronous, side-effect free, and deterministic over identical analysis input. Findings MUST use deterministic ordering, deterministic severity escalation from `info` to `warn` according to adapter-owned divergence-count thresholds, deterministic evidence ordering, and stable SHA fingerprints derived only from stable observed inputs such as rule id, file identity, local binding name, context call location when available, provider locations when available, default-argument surface, and provider value-surface classifications.

#### Scenario: Identical context/provider input produces stable output

- GIVEN identical source files, graph facts, configuration, and adapter metadata are analyzed twice
- WHEN `react/context-provider-value-surface-drift` runs
- THEN both runs MUST return equivalent findings with the same rule id, type, severity, fingerprint, message, metrics, thresholds, exceeded labels, and evidence values
- AND provider evidence MUST appear in deterministic order.

#### Scenario: Severity escalation follows deterministic divergence counts

- GIVEN two context bindings have different counts of observed provider value-surface divergence
- WHEN context provider value-surface findings are emitted
- THEN each finding severity MUST be selected by the same adapter-owned threshold rules
- AND repeated runs MUST NOT vary severity because of iteration order, file traversal order, wall-clock time, or nondeterministic data structures.

#### Scenario: Fingerprints do not include unstable text

- GIVEN a context provider value-surface finding is emitted
- WHEN the finding fingerprint is computed
- THEN the fingerprint MUST be a stable SHA value derived from stable observed syntax-fact inputs
- AND the fingerprint MUST NOT depend on wall-clock time, process ids, object identity, serialized map insertion order, or LLM-generated text.

### Requirement: Context Provider Analyzer Scope Boundaries

The context provider value-surface analyzer MUST run inside `@rai/adapter-react` and MUST NOT require React-specific rule logic, analyzer ids, catalog labels, provider labels, or React semantics inside `@rai/core`. Analyzer output MUST flow through existing analysis, CLI, MCP, and finding plumbing without adding a new MCP drift tool or changing persistence, feedback, memory, snapshot, or generic finding contracts unless existing analyzer wiring requires only additive adapter registration.

#### Scenario: Core remains framework-agnostic for P11-S5

- GIVEN `react/context-provider-value-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports, packages, graph contracts, and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain React-specific context/provider rule logic, rule ids, catalog names, provider labels, or adapter imports.

#### Scenario: Analyzer output has no direct writes

- GIVEN the context provider value-surface analyzer returns findings or diagnostics
- WHEN analysis completes
- THEN all outputs MUST flow through the existing analyzer result path
- AND the analyzer MUST NOT write configuration, memory, snapshots, feedback, persistence, documentation, or instruction files directly.

#### Scenario: Existing CLI and MCP paths carry findings without a new drift tool

- GIVEN the React adapter is loaded by existing analysis paths
- AND `react/context-provider-value-surface-drift` emits a finding
- WHEN CLI or MCP analysis output is requested through existing supported flows
- THEN the finding MAY be surfaced through those existing flows
- AND no new MCP drift tool MUST be required for this analyzer.

### Requirement: Form Control Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id `react/form-control-surface-drift`. The analyzer MUST consume observed `jsx` and `jsx-attribute` facts (lowercase native HTML tags only) and produce one file-scoped finding per drifting file anchored on subject `react:form-control-surface:${file}`. It MUST detect two signal families per file: (1) form submit-surface divergence — at least one `<form>` element carrying `onSubmit` (non-absent `valueKind`) AND a **different** `<form>` element in the same file carrying `action` or `method`; a single `<form>` element carrying both surfaces simultaneously MUST NOT emit (OQ2 — see scenario below); (2) control-binding surface divergence — native controls of the SAME element type (`input`, `select`, `textarea`) using both a controlled attr (`value`/`checked`) and its matching uncontrolled attr (`defaultValue`/`defaultChecked`). Findings MUST be `type: "opportunity"` and emitted only when `topology.exceeded.length > 0`.

#### Scenario: Mixed form submit surfaces across two forms are reported

- GIVEN a file has one `<form onSubmit={...}>` with non-absent `valueKind`
- AND the same file has another `<form action="/x">` or `<form method="post">`
- WHEN React pattern analyzers run
- THEN one `react/form-control-surface-drift` finding MUST be emitted for that file
- AND the finding MUST report a form submit-surface divergence signal.

#### Scenario: Single form carrying both onSubmit and action stays silent

- GIVEN a file's only `<form>` element carries BOTH `onSubmit` and `action`
- AND no other `<form>` element exists in the file
- WHEN React pattern analyzers run
- THEN no `react/form-control-surface-drift` finding MUST be emitted for submit-surface divergence (single-element ambiguity is out of scope, OQ2).

#### Scenario: A form with neither submit surface is not drift

- GIVEN a file contains a `<form>` with neither `onSubmit`, `action`, nor `method`
- AND no other form carries a divergent submit surface
- WHEN React pattern analyzers run
- THEN absence of a submit surface MUST NOT be treated as a divergence signal (OQ3).

#### Scenario: Mixed value and defaultValue inputs are reported

- GIVEN a file has one `<input value={...}>` and another `<input defaultValue={...}>`
- WHEN React pattern analyzers run
- THEN one `react/form-control-surface-drift` finding MUST be emitted for that file
- AND the finding MUST report a control-binding surface divergence for element type `input` on the `value`/`defaultValue` pair.

#### Scenario: Mixed checked and defaultChecked are reported per matching pair

- GIVEN a file has one `<input checked={...}>` and another `<input defaultChecked={...}>`
- WHEN React pattern analyzers run
- THEN a divergence signal MUST be emitted for the `checked`/`defaultChecked` pair on element type `input`.

#### Scenario: Consistent single surface stays silent

- GIVEN every `<input>` in a file uses only `value` (or every one uses only `defaultValue`)
- AND no element type mixes controlled and uncontrolled attrs
- AND all forms share one submit surface
- WHEN React pattern analyzers run
- THEN no `react/form-control-surface-drift` finding MUST be emitted.

#### Scenario: No native form elements stays silent

- GIVEN a file contains no `<form>`, `<input>`, `<select>`, or `<textarea>` native elements
- WHEN React pattern analyzers run
- THEN no `react/form-control-surface-drift` finding MUST be emitted.

### Requirement: Form Control Surface Evidence and Claim Boundaries

Findings MUST be grounded only in observed current-source `jsx`/`jsx-attribute` facts. Severity MUST be `warn` when `divergenceCount > 1` and `info` otherwise. Evidence MUST describe ONLY observed attribute names and element types. Finding text, the `explain` hook, and evidence MUST NOT claim runtime controlled/uncontrolled behavior, React warnings, a bug, an error, defect, team intent, root cause, user impact, historical drift, or required remediation. The analyzer MUST document as known limitations that `parentTag` is the immediate lexical parent only (controls inside fragments/conditionals inside a `<form>` may not carry `parentTag === "form"`), that `<input type="hidden">` / `type="submit">` are NOT excluded (OQ4 deferred), and that all `action` attributes are treated as one submit surface regardless of `valueKind`, including React 19 `action={fn}` server actions (OQ5).

#### Scenario: Evidence references observed names and types only

- GIVEN a `react/form-control-surface-drift` finding is emitted
- WHEN the evidence is inspected
- THEN it MUST identify the file, the observed element types, and the observed attribute names that diverged
- AND it MUST NOT assert runtime binding behavior, a React warning, or any required code change.

#### Scenario: Severity escalates on multiple divergences

- GIVEN a file has exactly one divergence signal
- WHEN the finding is emitted
- THEN `severityRaw` MUST be `info`
- AND GIVEN a file with more than one divergence signal, `severityRaw` MUST be `warn`.

#### Scenario: Documented limitations are not silently filtered

- GIVEN a `<form action={serverAction}>` with `valueKind: "expression"` co-occurs with `<form onSubmit={...}>`
- WHEN the analyzer evaluates submit surfaces
- THEN the `action` MUST count toward submit-surface divergence regardless of `valueKind`
- AND the analyzer MUST NOT split `action` by `valueKind` and MUST NOT exclude `<input type="hidden">`/`type="submit">` from control-surface comparison.

### Requirement: Form Control Surface Determinism and Scope Boundaries

The analyzer MUST be pure, synchronous, side-effect free, and deterministic over identical input: no filesystem, network, memory, config, clock, random, or LLM writes. Findings MUST use deterministic ordering, sorted and frozen evidence, deterministic severity, and stable SHA fingerprints — structural (content-stable, whitespace-insensitive), nominal (name-only), positional (file+span) — derived only from stable observed inputs. The analyzer MUST run inside `@rai/adapter-react`, load via the same registry factory as other React analyzers (`createReactCoreAnalyzers()` in `core-adapter.ts`), require NO `@rai/core` changes, and add NO new MCP tool.

#### Scenario: Identical input produces stable output

- GIVEN identical source files, graph facts, and configuration are analyzed twice
- WHEN `react/form-control-surface-drift` runs
- THEN both runs MUST return equivalent findings with the same rule id, type, severity, fingerprints, metrics, and evidence values in deterministic order.

#### Scenario: Fingerprints exclude unstable inputs

- GIVEN a finding is emitted and the source is reformatted with whitespace-only edits
- WHEN the structural fingerprint is recomputed
- THEN it MUST be unchanged
- AND no fingerprint MUST depend on wall-clock time, process ids, map insertion order, or LLM-generated text.

#### Scenario: Core stays framework-agnostic and wiring stays additive

- GIVEN `react/form-control-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain form-related rule logic, rule ids, or adapter imports
- AND the analyzer MUST be surfaced through existing CLI/MCP flows with NO new MCP tool.

### Requirement: Data-Fetching Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id `react/data-fetching-surface-drift`. The analyzer MUST consume observed `call` and `hook-call` facts and produce one file-scoped finding per qualifying file anchored on subject `react:data-fetching-surface:${file}`. A file MUST qualify only when it has at least one `call` fact whose callee is in the adapter-owned FETCH_CALLEES set (`fetch`, `window.fetch`, `globalThis.fetch`) AND at least one `hook-call` fact whose name is in the adapter-owned QUERY_HOOK_NAMES set (`useQuery`, `useLazyQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `useSWR`, `useInfiniteSWR`, `useSWRInfinite`, `useSWRMutation`, `useApolloQuery`, `useLazyApolloQuery`). The query-hook family discriminator MUST be the `hook-call` fact, NOT `call-binding`. Findings MUST be `type: "opportunity"` and emitted at most once per qualifying file.

#### Scenario: Co-present fetch and query-hook are reported

- GIVEN a file has a `call` fact with callee `fetch` AND a `hook-call` fact named `useQuery`
- WHEN React pattern analyzers run
- THEN exactly one `react/data-fetching-surface-drift` finding MUST be emitted for that file
- AND the finding MUST report observed call-name-surface divergence for the file.

#### Scenario: Destructured query hook with no call-binding is still detected

- GIVEN a file has a `call` fact with callee `fetch`
- AND the file has a `hook-call` fact named `useQuery` produced by `const { data } = useQuery(...)` with NO accompanying `call-binding` fact
- WHEN React pattern analyzers run
- THEN one `react/data-fetching-surface-drift` finding MUST be emitted for that file
- AND emission MUST be driven by the `hook-call` fact, not by any `call-binding` fact.

#### Scenario: window.fetch and globalThis.fetch qualify as fetch callees

- GIVEN a file has a `call` fact with callee `window.fetch` or `globalThis.fetch` AND a `hook-call` fact named `useMutation`
- WHEN React pattern analyzers run
- THEN one `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Fetch-only file stays silent

- GIVEN a file has one or more `call` facts with callee in FETCH_CALLEES
- AND the file has no `hook-call` fact whose name is in QUERY_HOOK_NAMES
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Query-hook-only file stays silent

- GIVEN a file has one or more `hook-call` facts whose name is in QUERY_HOOK_NAMES
- AND the file has no `call` fact with callee in FETCH_CALLEES
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Non-query hooks alongside fetch stay silent

- GIVEN a file has a `call` fact with callee `fetch`
- AND the file's only hook-call facts are `useState`, `useEffect`, or `useMemo` (none in QUERY_HOOK_NAMES)
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Cross-file co-presence stays silent

- GIVEN one file has a `call` fact with callee `fetch` and no qualifying hook-call
- AND a different file has a `hook-call` fact named `useQuery` and no qualifying fetch call
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for either file (each file is evaluated independently).

### Requirement: Data-Fetching Surface Evidence and Claim Boundaries

Findings MUST be grounded only in observed current-source `call` and `hook-call` facts. Severity MUST always be `info`. Evidence and the `explain` hook MUST describe ONLY the observed call-name families (fetch callee names and query-hook names) that co-appear in the file. Finding text, the `explain` hook output, and the `explain` hook `limits[]` MUST NOT claim runtime fetch behavior, request waterfalls, performance impact, that the file uses two data-fetching libraries, import or library identity semantics, that the calls interact, co-execute, or conflict, a bug, error, defect, team intent, root cause, user impact, historical drift, or any required remediation or migration.

#### Scenario: Evidence references observed call names only

- GIVEN a `react/data-fetching-surface-drift` finding is emitted
- WHEN the evidence is inspected
- THEN it MUST identify the file and the observed fetch callee names and query-hook names that co-appeared
- AND it MUST NOT assert library identity, runtime behavior, or any required code change.

#### Scenario: Severity is always info

- GIVEN any qualifying file emits a `react/data-fetching-surface-drift` finding
- WHEN the finding is emitted
- THEN `severityRaw` MUST be `info` (single binary signal; no escalation).

#### Scenario: Explain output respects the forbidden-vocabulary boundary

- GIVEN a `react/data-fetching-surface-drift` finding is emitted and its `explain` hook is invoked
- WHEN the serialized explanation (summary, whyItMatters, inspectFirst, and `limits[]`) is inspected
- THEN it MUST NOT contain runtime-behavior, waterfall, performance, "two libraries", import/library-identity, conflict/interaction, bug/defect, intent, root-cause, user-impact, or migration/remediation language
- AND the `explain` hook MUST return null for any finding whose ruleId is not `react/data-fetching-surface-drift`.

### Requirement: Data-Fetching Surface Determinism and Scope Boundaries

The analyzer MUST be pure, synchronous, side-effect free, and deterministic over identical input: no filesystem, network, memory, config, clock, random, or LLM writes. Findings MUST use deterministic ordering, sorted and frozen evidence, deterministic severity, and stable SHA fingerprints — structural (sorted observed fetch-callee + query-hook names plus file identity, span-shift-resistant), nominal (file-only), and positional (file+span) — derived only from stable observed inputs. The analyzer MUST run inside `@rai/adapter-react`, load via the same `createReactCoreAnalyzers()` registry factory in `core-adapter.ts` as other React analyzers, require NO `@rai/core` changes, and add NO new MCP tool.

#### Scenario: Identical input produces stable output

- GIVEN identical source files, graph facts, and configuration are analyzed twice
- WHEN `react/data-fetching-surface-drift` runs
- THEN both runs MUST return equivalent findings with the same rule id, type, severity, fingerprints, metrics, and evidence values in deterministic order.

#### Scenario: Fingerprints exclude unstable inputs and resist span shifts

- GIVEN a finding is emitted and the source is edited so observed spans shift without changing the observed fetch-callee or query-hook names
- WHEN the structural fingerprint is recomputed
- THEN it MUST be unchanged
- AND no fingerprint MUST depend on wall-clock time, process ids, map insertion order, or LLM-generated text.

#### Scenario: Core stays framework-agnostic and wiring stays additive

- GIVEN `react/data-fetching-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain data-fetching rule logic, rule ids, FETCH_CALLEES/QUERY_HOOK_NAMES catalog names, or adapter imports
- AND the analyzer MUST be surfaced through existing CLI/MCP flows with NO new MCP tool.

### Requirement: Overlay Control Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id
`react/overlay-control-surface-drift`. The analyzer MUST consume observed `jsx` and `jsx-attribute`
pattern facts for capitalized overlay component tags only and produce one file-scoped
`type: "opportunity"` finding per qualifying file anchored on subject
`react:overlay-control-surface:${file}`. The adapter-owned `OVERLAY_TAGS` set MUST be exactly
`{Dialog, Modal, Popover, Drawer, Sheet, Tooltip, AlertDialog, HoverCard, DropdownMenu, ContextMenu,
Combobox, Select}` (capitalized component tags). Tag matching MUST be case-sensitive, so lowercase
native tags such as `select`, `form`, `input`, and `textarea` MUST NOT match (those remain P11-S6's
domain). The adapter-owned open-state pair MUST be the controlled attribute `open` with the
uncontrolled attribute `defaultOpen`. The adapter-owned `OVERLAY_HANDLER_NAMES` set MUST be exactly
`{onOpenChange, onClose, onDismiss}` and MUST NOT include `onToggle`. A file MUST qualify only when it
has at least two distinct overlay JSX elements (each a `jsx` fact whose tag is in `OVERLAY_TAGS`) AND
at least one of the following gates fires:

- **Gate A — open-state cross-element divergence:** one overlay element carries `open` with a non-absent
  `valueKind` AND a DIFFERENT overlay element carries `defaultOpen`. A single overlay element carrying
  BOTH `open` and `defaultOpen` MUST NOT alone satisfy Gate A; cross-element divergence is required and
  MUST be established by lexical span containment (`spanContains`), mirroring the P11-S6 cross-element
  discipline.
- **Gate B — handler-name surface divergence:** at least two distinct overlay elements use different
  handler-name tokens drawn from `OVERLAY_HANDLER_NAMES`.

Findings MUST be emitted only when at least one gate fires (the exceeded-token set is non-empty).

#### Scenario: Open-state cross-element divergence is reported

- GIVEN a file has one `<Dialog open={...}>` overlay element with a non-absent `open` `valueKind`
- AND the same file has a DIFFERENT `<Popover defaultOpen>` overlay element
- WHEN React pattern analyzers run
- THEN exactly one `react/overlay-control-surface-drift` finding MUST be emitted for that file
- AND the finding MUST report an open-state surface divergence signal grounded in the observed `open`
  and `defaultOpen` attribute names and the observed overlay tags.

#### Scenario: Handler-name divergence across two overlay elements is reported

- GIVEN a file has one overlay element carrying `onOpenChange`
- AND the same file has a DIFFERENT overlay element carrying `onClose` or `onDismiss`
- WHEN React pattern analyzers run
- THEN exactly one `react/overlay-control-surface-drift` finding MUST be emitted for that file
- AND the finding MUST report a handler-name surface divergence signal grounded in the observed
  handler-name tokens and observed overlay tags.

#### Scenario: Single overlay carrying both open and defaultOpen stays silent

- GIVEN a file's overlay elements include a single `<Dialog open={...} defaultOpen>` that carries BOTH
  `open` and `defaultOpen`
- AND no DIFFERENT overlay element in the file carries the complementary open-state attribute
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for open-state divergence
  (cross-element divergence is required; a lone dual-surface element does not satisfy Gate A).

#### Scenario: Uniform open-state surface stays silent

- GIVEN every overlay element in a file uses only `open` (or every overlay element uses only
  `defaultOpen`)
- AND no overlay element uses a divergent handler-name token
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for that file.

#### Scenario: Uniform single handler-name surface stays silent

- GIVEN every overlay element in a file that carries a handler uses the same single handler-name token
  from `OVERLAY_HANDLER_NAMES` (for example, all use `onOpenChange`)
- AND no open-state cross-element divergence exists
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for that file.

#### Scenario: Fewer than two distinct overlay elements stays silent

- GIVEN a file contains fewer than two distinct overlay JSX elements whose tag is in `OVERLAY_TAGS`
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for that file, regardless of the
  attributes the single overlay element carries.

#### Scenario: No overlay tags stays silent

- GIVEN a file contains no JSX elements whose tag is in `OVERLAY_TAGS`
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for that file.

#### Scenario: Lowercase native tags are not matched

- GIVEN a file contains lowercase native tags such as `<form>`, `<input>`, `<select>`, or `<textarea>`
  carrying `value`/`defaultValue` or other attributes
- AND it contains no capitalized overlay tag from `OVERLAY_TAGS`
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for that file
- AND those lowercase native tags MUST remain exclusively within P11-S6's `react/form-control-surface-drift`
  domain (case-sensitive matching; `"select"` is not `"Select"`).

### Requirement: Overlay Control Surface Non-Overlap With Prop-Surface Drift

The `react/overlay-control-surface-drift` analyzer MUST derive emission exclusively from observed
`jsx`/`jsx-attribute` pattern facts at the JSX USAGE site. It MUST NOT read component definition
metadata — specifically `ctx.graph.components` or `component.propNames` — to decide overlay findings.
This keeps the analyzer strictly complementary to P11-S3
(`react/controlled-uncontrolled-prop-surface-drift`), which operates only on the component DEFINITION
site (a component DECLARING both `open` and `defaultOpen` as its own props). A file's component
definitions and a file's JSX usage are independent surfaces; the overlay analyzer MUST ground its
decision in JSX usage only.

#### Scenario: Component declaring open and defaultOpen with no overlay JSX usage stays silent

- GIVEN a component DEFINITION in a file DECLARES both `open` and `defaultOpen` in its `propNames`
  (the P11-S3 DEFINITION-site condition)
- AND that file contains fewer than two distinct overlay JSX elements whose tag is in `OVERLAY_TAGS`
- WHEN React pattern analyzers run
- THEN no `react/overlay-control-surface-drift` finding MUST be emitted for that file
- AND the analyzer MUST NOT read `ctx.graph.components` / `component.propNames` to manufacture an
  overlay finding (the prop-declaration case belongs to P11-S3, not P11-S8).

#### Scenario: Overlay JSX usage divergence is detected without any component-definition input

- GIVEN a file renders `<Dialog open={x} />` beside a DIFFERENT `<Popover defaultOpen />`
- AND no overlay component DEFINITION in the file declares both `open` and `defaultOpen` in its
  `propNames`
- WHEN React pattern analyzers run
- THEN one `react/overlay-control-surface-drift` finding MUST be emitted for that file from the observed
  JSX-attribute facts alone
- AND emission MUST NOT depend on any `ctx.graph.components` / `component.propNames` data.

### Requirement: Overlay Control Surface Evidence and Claim Boundaries

Findings MUST be grounded only in observed current-source `jsx`/`jsx-attribute` facts. Severity MUST be
`warn` when the observed divergence-signal count is greater than `1` and `info` otherwise. Evidence, the
finding message, the `explain` hook output, and the `explain` hook `limits[]` MUST describe ONLY the
observed overlay tag names and observed attribute names (open-state attribute names and handler-name
tokens) that co-appear in the file. Finding text and explanation MUST NOT claim runtime overlay or modal
behavior, portal rendering, focus trapping, accessibility / ARIA / keyboard behavior, library identity
(which library a `<Dialog>` came from), correct API for a library version, a bug, error, defect, team
intent, root cause, user impact, historical drift, or any required remediation or migration.

#### Scenario: Evidence references observed overlay tags and attribute names only

- GIVEN a `react/overlay-control-surface-drift` finding is emitted
- WHEN the evidence is inspected
- THEN it MUST identify the file, the observed overlay tag names, and the observed attribute names
  (open-state attributes and/or handler-name tokens) that diverged
- AND it MUST NOT assert library identity, runtime overlay behavior, accessibility behavior, or any
  required code change.

#### Scenario: Severity escalates on multiple divergence signals

- GIVEN a file has exactly one overlay divergence signal
- WHEN the finding is emitted
- THEN `severityRaw` MUST be `info`
- AND GIVEN a file with more than one overlay divergence signal, `severityRaw` MUST be `warn`.

#### Scenario: Explain output respects the forbidden-vocabulary boundary

- GIVEN a `react/overlay-control-surface-drift` finding is emitted and its `explain` hook is invoked
- WHEN the serialized explanation (summary, whyItMatters, inspectFirst, and `limits[]`) is inspected
- THEN it MUST NOT contain runtime-behavior, modal/overlay-behavior, portal, focus-trap,
  accessibility/ARIA/keyboard, library-identity, correct-API-for-version, conflict/interaction,
  bug/defect, intent, root-cause, user-impact, or migration/remediation language
- AND the `explain` hook MUST return null for any finding whose ruleId is not
  `react/overlay-control-surface-drift`.

### Requirement: Overlay Control Surface Determinism and Scope Boundaries

The analyzer MUST be pure, synchronous, side-effect free, and deterministic over identical input: no
filesystem, network, memory, config, clock, random, or LLM writes. Findings MUST use deterministic
ordering, sorted and frozen evidence, deterministic severity, and stable SHA fingerprints — structural
(sorted observed divergence tokens plus sorted observed overlay tags plus sorted observed attribute
names plus file identity, span-shift-resistant), nominal (file identity only), and positional
(file+span) — derived only from stable observed inputs. The analyzer MUST run inside
`@rai/adapter-react`, load via the same `createReactCoreAnalyzers()` registry factory in
`core-adapter.ts` as other React analyzers, require NO `@rai/core` changes, and add NO new MCP tool.

#### Scenario: Identical input produces stable output

- GIVEN identical source files, graph facts, and configuration are analyzed twice
- WHEN `react/overlay-control-surface-drift` runs
- THEN both runs MUST return equivalent findings with the same rule id, type, severity, fingerprints,
  metrics, and evidence values in deterministic order.

#### Scenario: Fingerprints exclude unstable inputs and resist span shifts

- GIVEN a finding is emitted and the source is edited so observed spans shift without changing the
  observed overlay tags, open-state attribute names, or handler-name tokens
- WHEN the structural fingerprint is recomputed
- THEN it MUST be unchanged
- AND no fingerprint MUST depend on wall-clock time, process ids, map insertion order, or LLM-generated
  text.

#### Scenario: Core stays framework-agnostic and wiring stays additive

- GIVEN `react/overlay-control-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain overlay rule logic, rule ids, `OVERLAY_TAGS`/`OVERLAY_HANDLER_NAMES`
  catalog names, or adapter imports
- AND the analyzer MUST be surfaced through existing CLI/MCP flows with NO new MCP tool.

#### Scenario: Analyzer output has no direct writes

- GIVEN the overlay control surface analyzer returns findings or diagnostics
- WHEN analysis completes
- THEN all outputs MUST flow through the existing analyzer result path
- AND the analyzer MUST NOT write configuration, memory, snapshots, feedback, persistence, documentation,
  or instruction files directly.

### Requirement: Design-System Usage Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id
`react/design-system-usage-surface-drift`. The analyzer MUST consume observed `jsx` and
`jsx-attribute` pattern facts for capitalized non-dotted component tags only and produce one
file-scoped `type: "opportunity"` finding per qualifying file anchored on subject
`react:design-system-usage-surface:${file}`. The tag guard MUST be case-sensitive: a tag MUST match
only when its first character is uppercase AND the tag string does NOT contain a `.` (no dotted member
form). Lowercase native tags (`div`, `span`, `button`, `form`, `input`, `select`, `textarea`) MUST NOT
match (those remain P11-S6's domain). Dotted member tags (`<Modal.Trigger>`) MUST NOT match (those
remain P11-S1's domain).

The adapter-owned `VARIANT_PROPS` set MUST be exactly `{variant, size, color, tone, intent,
appearance}`. The adapter-owned `RAW_STYLE_PROPS` set MUST be exactly `{className, style}`. These two
sets MUST be disjoint. Additions to either set are out of scope for this change and MUST require a
later approved calibration cycle, NOT an ad-hoc broadening.

A file MUST qualify only when, for at least one capitalized non-dotted tag `T`, ALL of the following
hold:

- The file contains at least two distinct JSX usages of `T` (each a `jsx` fact whose tag is `T`). A
  single usage of `T` MUST NOT qualify.
- At least one usage of `T` carries a `VARIANT_PROP` name AND at least one OTHER usage of `T` carries a
  `RAW_STYLE_PROP` name, established by lexical span containment (`spanContains`), mirroring the
  P11-S6/S8 cross-element discipline.
- Genuine cross-usage divergence exists: at least one usage of `T` is variant-bearing without any
  raw-style prop, OR at least one usage of `T` is raw-style-bearing without any variant prop. A single
  usage carrying BOTH a `VARIANT_PROP` and a `RAW_STYLE_PROP` MUST NOT alone satisfy the gate.

A bare attribute whose `valueKind` is `absent` MUST still count as a present prop-name token for both
`VARIANT_PROPS` and `RAW_STYLE_PROPS` membership (the prop-name token is observed in source regardless
of value, mirroring the P11-S8 bare-`open` precedent). For each qualifying tag `T` the analyzer MUST
record a divergent token `stylingVariantSurfaceDrift:{T}:{file}`. Findings MUST be emitted only when
the exceeded-token set is non-empty (`topology.exceeded.length > 0`).

#### Scenario: Variant-on-one-Button and className-on-another-Button is reported

- GIVEN a file has one `<Button variant={...}>` usage carrying only a `VARIANT_PROP`
- AND the same file has a DIFFERENT `<Button className={...}>` usage carrying only a `RAW_STYLE_PROP`
- WHEN React pattern analyzers run
- THEN exactly one `react/design-system-usage-surface-drift` finding MUST be emitted for that file
- AND the finding MUST record the divergent token `stylingVariantSurfaceDrift:Button:${file}` and report
  observed variant-style vs raw-style prop-surface divergence for tag `Button`.

#### Scenario: Bare variant attribute counts as a variant-style prop name

- GIVEN a file has one `<Card variant>` usage whose `variant` attribute `valueKind` is `absent`
- AND the same file has a DIFFERENT `<Card className={...}>` usage carrying a `RAW_STYLE_PROP`
- WHEN React pattern analyzers run
- THEN one `react/design-system-usage-surface-drift` finding MUST be emitted for that file
- AND the bare `variant` attribute MUST count as a present `VARIANT_PROP` name regardless of its absent
  value.

#### Scenario: Single usage carrying both variant and raw-style props stays silent

- GIVEN a file's only `<Button>` usage is a single `<Button variant={...} className={...}>` carrying
  BOTH a `VARIANT_PROP` and a `RAW_STYLE_PROP`
- AND no other `<Button>` usage exists in the file
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for that file (a single
  dual-surface usage is not cross-usage divergence; the gate requires a variant-only usage or a
  raw-only usage across distinct usages).

#### Scenario: Uniform variant-only surface across usages stays silent

- GIVEN every `<Button>` usage in a file carries only a `VARIANT_PROP` (for example, all carry
  `variant`) and no usage carries a `RAW_STYLE_PROP`
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for that file.

#### Scenario: Uniform raw-style-only surface across usages stays silent

- GIVEN every `<Button>` usage in a file carries only a `RAW_STYLE_PROP` (for example, all carry
  `className`) and no usage carries a `VARIANT_PROP`
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for that file.

#### Scenario: All usages carrying both surfaces stays silent

- GIVEN every `<Button>` usage in a file carries BOTH a `VARIANT_PROP` and a `RAW_STYLE_PROP`
- AND no usage is variant-only and no usage is raw-only
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for that file (no genuine
  cross-usage divergence exists).

#### Scenario: Fewer than two usages of a tag stays silent

- GIVEN a file contains fewer than two distinct JSX usages of a capitalized non-dotted tag `T`
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for tag `T`, regardless of
  the props the single usage carries.

#### Scenario: Lowercase native tags are not matched

- GIVEN a file contains lowercase native tags such as `<div>`, `<span>`, or `<button>` carrying
  `variant`/`className`/`style` attributes
- AND it contains no capitalized non-dotted tag with the divergent surface
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for that file
- AND those lowercase native tags MUST remain outside this analyzer's domain (case-sensitive matching;
  `"button"` is not `"Button"`).

#### Scenario: Dotted member tags are not matched

- GIVEN a file contains a dotted member tag such as `<Modal.Trigger variant={...}>` and another
  `<Modal.Content className={...}>`
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for those tags
- AND dotted member tags MUST remain exclusively within P11-S1's compound-component domain
  (`tag.includes(".")` excludes them).

#### Scenario: No present variant prop stays silent

- GIVEN a file has two or more `<Card>` usages and at least one carries a `RAW_STYLE_PROP`
- AND no usage of `<Card>` carries any `VARIANT_PROP` name
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for tag `Card`.

#### Scenario: No present raw-style prop stays silent

- GIVEN a file has two or more `<Card>` usages and at least one carries a `VARIANT_PROP`
- AND no usage of `<Card>` carries any `RAW_STYLE_PROP` name
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for tag `Card`.

### Requirement: Design-System Usage Surface Non-Overlap With Prop-Surface Drift

The `react/design-system-usage-surface-drift` analyzer MUST derive emission exclusively from observed
`jsx`/`jsx-attribute` pattern facts at the JSX USAGE site. It MUST NOT read component definition
metadata — specifically `ctx.graph.components` or `component.propNames` — to decide design-system usage
surface findings. This keeps the analyzer strictly complementary to P11-S3
(`react/controlled-uncontrolled-prop-surface-drift`), which operates only on the component DEFINITION
site (a component DECLARING props such as `value`/`defaultValue` in its own `propNames`). A file's
component definitions and a file's JSX usage are independent surfaces; the design-system usage analyzer
MUST ground its decision in JSX usage only. The `VARIANT_PROPS`/`RAW_STYLE_PROPS` tracked attribute
names MUST also be disjoint from the controlled/uncontrolled pairs that P11-S3 tracks
(`value`/`defaultValue`, `checked`/`defaultChecked`, `open`/`defaultOpen`).

#### Scenario: Component declaring variant and className in propNames with no divergent JSX usage stays silent

- GIVEN a component DEFINITION in a file DECLARES both `variant` and `className` in its `propNames`
- AND that file does NOT contain at least two capitalized non-dotted JSX usages of a single tag with the
  cross-usage variant-vs-raw divergence
- WHEN React pattern analyzers run
- THEN no `react/design-system-usage-surface-drift` finding MUST be emitted for that file
- AND the analyzer MUST NOT read `ctx.graph.components` / `component.propNames` to manufacture a finding
  (the prop-declaration case belongs to P11-S3, not P11-S9).

#### Scenario: Design-system usage divergence is detected without any component-definition input

- GIVEN a file renders `<Badge variant={x} />` beside a DIFFERENT `<Badge className="..." />`
- AND no component DEFINITION in the file declares the corresponding props in its `propNames`
- WHEN React pattern analyzers run
- THEN one `react/design-system-usage-surface-drift` finding MUST be emitted for that file from the
  observed JSX-attribute facts alone
- AND emission MUST NOT depend on any `ctx.graph.components` / `component.propNames` data.

### Requirement: Design-System Usage Surface Evidence, Groundability, and Claim Boundaries

Findings MUST be grounded only in observed current-source `jsx`/`jsx-attribute` facts. Severity MUST be
`warn` when more than one tag is divergent (more than one `stylingVariantSurfaceDrift:{tag}:{file}`
token) and `info` when exactly one tag is divergent. Evidence, the finding message, the `explain` hook
output, and the `explain` hook `limits[]` MUST describe ONLY the observed prop names (such as `variant`,
`size`, `className`, `style`) and the observed capitalized non-dotted tag names that co-appear in the
file.

Finding text and explanation MUST NOT claim design-system membership, component-library identity, which
library a tag came from, theming, runtime or CSS styling behavior, that a raw-style prop overrides or
takes precedence over a variant-style prop, that the prop surfaces interact or are mutually exclusive, a
bug, error, defect, incorrectness, team intent, root cause, user impact, historical drift, or any
required remediation or migration. The serialized `explain` output (summary, whyItMatters, inspectFirst,
and `limits[]`) MUST NOT contain the forbidden substrings `design system component`, `component
library`, `themed`, `override`, `conflict`, or `incorrect`, and MUST NOT contain `bug`, `wrong`, `must
refactor`, `must migrate`, `runtime behavior`, `root cause`, or `you should`. The `limits[]` array MUST
phrase these constraints as negated disclaimers WITHOUT embedding any banned substring (mirroring the
P11-S7/P11-S8 substring-regex lesson: a disclaimer such as "does not claim a conflict" still contains
the banned substring `conflict` and MUST be reworded). The `limits[]` array MUST also document that
spread attributes (`{...props}`) are invisible to static facts and are not resolved, and that the
analyzer makes no design-system membership inference.

#### Scenario: Evidence references observed prop names and tag names only

- GIVEN a `react/design-system-usage-surface-drift` finding is emitted
- WHEN the evidence is inspected
- THEN it MUST identify the file, the observed capitalized non-dotted tag names, and the observed
  variant-style and raw-style prop names that diverged
- AND it MUST NOT assert design-system membership, component-library identity, theming, runtime styling
  behavior, override precedence, or any required code change.

#### Scenario: Severity escalates on multiple divergent tags

- GIVEN a file has exactly one divergent tag (one `stylingVariantSurfaceDrift:{tag}:{file}` token)
- WHEN the finding is emitted
- THEN `severityRaw` MUST be `info`
- AND GIVEN a file with more than one divergent tag, `severityRaw` MUST be `warn`.

#### Scenario: Explain output respects the forbidden-vocabulary boundary

- GIVEN a `react/design-system-usage-surface-drift` finding is emitted and its `explain` hook is invoked
- WHEN the serialized explanation (summary, whyItMatters, inspectFirst, and `limits[]`) is inspected
- THEN it MUST NOT contain the forbidden substrings `design system component`, `component library`,
  `themed`, `override`, `conflict`, or `incorrect`
- AND it MUST NOT contain bug/defect, wrong/incorrectness, migration/remediation, runtime/CSS-styling,
  override-precedence, library-identity, intent, root-cause, or user-impact language
- AND the `limits[]` array MUST disclaim spread-attribute invisibility and the absence of design-system
  membership inference WITHOUT embedding any banned substring
- AND the `explain` hook MUST return null for any finding whose ruleId is not
  `react/design-system-usage-surface-drift`.

### Requirement: Design-System Usage Surface Determinism and Scope Boundaries

The analyzer MUST be pure, synchronous, side-effect free, and deterministic over identical input: no
filesystem, network, memory, config, clock, random, or LLM writes. Findings MUST use deterministic
ordering, sorted and frozen evidence, deterministic severity, and stable SHA fingerprints — structural
(sorted observed divergence tokens plus sorted observed divergent tag names plus sorted observed
divergent prop names plus file identity, span-shift-resistant), nominal (file identity only), and
positional (file+span) — derived only from stable observed inputs. The analyzer MUST run inside
`@rai/adapter-react`, load via the same `createReactCoreAnalyzers()` registry factory in
`core-adapter.ts` as other React analyzers, require NO `@rai/core` changes, and add NO new MCP tool.

#### Scenario: Identical input produces stable output

- GIVEN identical source files, graph facts, and configuration are analyzed twice
- WHEN `react/design-system-usage-surface-drift` runs
- THEN both runs MUST return equivalent findings with the same rule id, type, severity, fingerprints,
  metrics, and evidence values in deterministic order.

#### Scenario: Fingerprints exclude unstable inputs and resist span shifts

- GIVEN a finding is emitted and the source is edited so observed spans shift without changing the
  observed divergent tag names, variant-style prop names, or raw-style prop names
- WHEN the structural fingerprint is recomputed
- THEN it MUST be unchanged
- AND no fingerprint MUST depend on wall-clock time, process ids, map insertion order, or LLM-generated
  text.

#### Scenario: Reads frozen pattern facts without mutating them

- GIVEN the analyzer is given frozen `jsx`/`jsx-attribute` facts
- WHEN `react/design-system-usage-surface-drift` runs
- THEN it MUST produce findings without mutating the input facts or their spans.

#### Scenario: Core stays framework-agnostic and wiring stays additive

- GIVEN `react/design-system-usage-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain design-system usage rule logic, rule ids,
  `VARIANT_PROPS`/`RAW_STYLE_PROPS` catalog names, or adapter imports
- AND the analyzer MUST be surfaced through existing CLI/MCP flows with NO new MCP tool.

#### Scenario: Analyzer output has no direct writes

- GIVEN the design-system usage surface analyzer returns findings or diagnostics
- WHEN analysis completes
- THEN all outputs MUST flow through the existing analyzer result path
- AND the analyzer MUST NOT write configuration, memory, snapshots, feedback, persistence, documentation,
  or instruction files directly.

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S4 MUST add only generic framework-neutral pattern facts and MUST NOT emit new React analyzer findings. P11-S5 MUST add only the context provider value-surface drift analyzer for same-file local context binding/provider value-surface divergence. P11-S6 MUST add only the `react/form-control-surface-drift` analyzer for same-file native form submit-surface divergence and same-element-type controlled/uncontrolled control-binding divergence. P11-S7 MUST add only the `react/data-fetching-surface-drift` analyzer for same-file co-presence of a raw-fetch `call` callee family and a query-hook `hook-call` name family. P11-S7 MUST NOT emit findings for runtime fetch behavior, waterfalls, performance, import/library identity, cross-file co-presence, `useEffect`-driven fetch patterns, axios-vs-fetch client detection, design-system usage, overlays, broad API convention families, or any claim outside observed same-file call-name-surface divergence. P11-S8 MUST add only the `react/overlay-control-surface-drift` analyzer for same-file JSX-usage-site open-state divergence and handler-name divergence across capitalized overlay component elements drawn from the adapter-owned `OVERLAY_TAGS` set. P11-S8 MUST NOT emit findings from component-definition prop declarations (the P11-S3 domain), from lowercase native tags (the P11-S6 domain), from dotted compound member usage (the P11-S1 domain), or for runtime overlay/modal behavior, portal rendering, focus trapping, accessibility, library identity, cross-file co-presence, design-system usage, data-fetching, or broad API convention families. P11-S9 MUST add only the `react/design-system-usage-surface-drift` analyzer for same-file JSX-usage-site cross-usage divergence between variant-style prop names (`VARIANT_PROPS`) and raw-style prop names (`RAW_STYLE_PROPS`) on capitalized non-dotted component tags. P11-S9 MUST NOT emit findings from component-definition prop declarations (the P11-S3 domain), from lowercase native tags (the P11-S6 domain), from capitalized overlay open-state/handler usage (the P11-S8 domain), from dotted compound member usage (the P11-S1 domain), or for design-system or component-library membership identity, import resolution, theming, runtime or CSS styling behavior, override precedence between prop surfaces, data-fetching, overlays, or broad API convention families. Those families MAY be specified and implemented by later approved changes that consume generic facts in adapter-owned analyzers.

(Previously: the slice scoping covered P11-S1 through P11-S8 only and deferred broad API convention analyzers to later approved adapter-owned changes.)

#### Scenario: P11-S4 fact expansion emits no new analyzer findings

- GIVEN source code contains provider/context, forms, data-fetching, design-system usage, overlay, or broad API-convention syntax
- WHEN P11-S4 React pattern analyzers run
- THEN no new React pattern findings MUST be emitted for those families
- AND any findings that exist MUST come from already-approved analyzer rule ids.

#### Scenario: P11-S6 form slice excludes other deferred families

- GIVEN source code contains form syntax, data-fetching syntax, design-system usage, overlay syntax, or broad API-convention syntax
- WHEN P11-S6 React pattern analyzers run
- THEN `react/form-control-surface-drift` findings MUST be limited to observed same-file form submit-surface and same-element-type control-binding divergence
- AND P11-S6 MUST NOT emit new findings for data-fetching, design-system, overlay, broad API-convention, cross-file form composition, or library form-component claims.

#### Scenario: P11-S7 data-fetching slice excludes other deferred families

- GIVEN source code contains data-fetching syntax (raw fetch and query hooks), `useEffect`-driven fetch syntax, axios client calls, design-system usage, overlay syntax, or broad API-convention syntax
- WHEN P11-S7 React pattern analyzers run
- THEN `react/data-fetching-surface-drift` findings MUST be limited to observed same-file co-presence of a FETCH_CALLEES `call` and a QUERY_HOOK_NAMES `hook-call`
- AND P11-S7 MUST NOT emit new findings for `useEffect`-driven fetch patterns, axios-vs-fetch detection, cross-file co-presence, design-system, overlay, or broad API-convention claims.

#### Scenario: P11-S8 overlay slice excludes other deferred families

- GIVEN source code contains capitalized overlay JSX usage, lowercase native form/control syntax, dotted compound member usage, component prop declarations of `open`/`defaultOpen`, data-fetching syntax, design-system usage, or broad API-convention syntax
- WHEN P11-S8 React pattern analyzers run
- THEN `react/overlay-control-surface-drift` findings MUST be limited to observed same-file JSX-usage-site open-state cross-element divergence and handler-name divergence across capitalized `OVERLAY_TAGS` elements
- AND P11-S8 MUST NOT emit new findings from component-definition prop declarations (P11-S3), lowercase native tags (P11-S6), dotted compound member usage (P11-S1), data-fetching, design-system, or broad API-convention claims.

#### Scenario: P11-S9 design-system usage slice excludes other deferred families

- GIVEN source code contains capitalized non-dotted JSX usage carrying variant-style and raw-style props, lowercase native form/control syntax, capitalized overlay open-state/handler syntax, dotted compound member usage, component prop declarations, data-fetching syntax, or broad API-convention syntax
- WHEN P11-S9 React pattern analyzers run
- THEN `react/design-system-usage-surface-drift` findings MUST be limited to observed same-file JSX-usage-site cross-usage divergence between `VARIANT_PROPS` and `RAW_STYLE_PROPS` on capitalized non-dotted component tags
- AND P11-S9 MUST NOT emit new findings from component-definition prop declarations (P11-S3), lowercase native tags (P11-S6), capitalized overlay open-state/handler usage (P11-S8), dotted compound member usage (P11-S1), data-fetching (P11-S7), design-system or component-library membership identity, import resolution, theming, runtime or CSS styling behavior, override precedence, or broad API-convention claims.

#### Scenario: Future analyzers remain adapter-owned

- GIVEN P11-S4 adds generic fact kinds that future React analyzers can consume
- WHEN `@rai/core` and `@rai/adapter-react` boundaries are inspected
- THEN React interpretation MUST remain outside core
- AND future axios-client or broad API-convention findings MUST require a later approved adapter-owned change.
