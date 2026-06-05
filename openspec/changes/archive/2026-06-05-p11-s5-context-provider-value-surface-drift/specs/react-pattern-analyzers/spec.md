# Delta for React Pattern Analyzers

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S4 MUST add only generic framework-neutral pattern facts and MUST NOT emit new React analyzer findings. P11-S5 MUST add only the context provider value-surface drift analyzer for same-file local context binding/provider value-surface divergence. P11-S5 MUST NOT emit findings for forms, data-fetching, design-system usage, overlays beyond compound primitive evidence, broad API convention families, useContext consumer completeness, cross-file provider resolution, or provider/context claims outside observed same-file value-surface divergence. Those families MAY be specified and implemented by later approved changes that consume generic facts in adapter-owned analyzers.

(Previously: P11-S4 added generic framework-neutral facts and deferred future provider/context, forms, data-fetching, design-system usage, overlay, and broad API convention analyzers to later approved adapter-owned changes.)

#### Scenario: P11-S4 fact expansion emits no new analyzer findings

- GIVEN source code contains provider/context, forms, data-fetching, design-system usage, overlay, or broad API-convention syntax
- WHEN P11-S4 React pattern analyzers run
- THEN no new React pattern findings MUST be emitted for those families
- AND any findings that exist MUST come from already-approved analyzer rule ids.

#### Scenario: P11-S5 provider slice excludes other deferred families

- GIVEN source code contains provider/context syntax, form syntax, data-fetching syntax, design-system usage, overlay syntax, or broad API-convention syntax
- WHEN P11-S5 React pattern analyzers run
- THEN `react/context-provider-value-surface-drift` findings MUST be limited to observed same-file local context binding/provider value-surface divergence
- AND P11-S5 MUST NOT emit new findings for form, data-fetching, design-system, overlay, broad API-convention, useContext consumer-completeness, or cross-file provider-resolution claims.

#### Scenario: Future analyzers remain adapter-owned

- GIVEN P11-S4 adds generic fact kinds that future React analyzers can consume
- WHEN `@rai/core` and `@rai/adapter-react` boundaries are inspected
- THEN React interpretation MUST remain outside core
- AND future forms, data-fetching, design-system, overlay, broad API-convention, or additional provider/context findings MUST require a later approved adapter-owned change.
