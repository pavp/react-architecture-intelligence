# Delta for React Pattern Analyzers

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S4 MUST add only generic framework-neutral pattern facts and MUST NOT emit new React analyzer findings. P11-S5 MUST add only the context provider value-surface drift analyzer for same-file local context binding/provider value-surface divergence. P11-S6 MUST add only the `react/form-control-surface-drift` analyzer for same-file native form submit-surface divergence and same-element-type controlled/uncontrolled control-binding divergence. P11-S6 MUST NOT emit findings for data-fetching, design-system usage, overlays beyond compound primitive evidence, broad API convention families, `e.preventDefault()` handler-body analysis, `useRef`-backed uncontrolled fields, cross-file form composition, library form components, or any claim outside observed same-file form/control attribute-surface divergence. Those families MAY be specified and implemented by later approved changes that consume generic facts in adapter-owned analyzers.

(Previously: the slice scoping covered P11-S1 through P11-S5 only and deferred forms, data-fetching, design-system usage, overlay, and broad API convention analyzers to later approved adapter-owned changes.)

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

#### Scenario: Future analyzers remain adapter-owned

- GIVEN P11-S4 adds generic fact kinds that future React analyzers can consume
- WHEN `@rai/core` and `@rai/adapter-react` boundaries are inspected
- THEN React interpretation MUST remain outside core
- AND future data-fetching, design-system, overlay, or broad API-convention findings MUST require a later approved adapter-owned change.
