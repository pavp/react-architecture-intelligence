# Spec Delta: P11-S8 react/overlay-control-surface-drift

**Change**: `p11-s8-overlay-control-surface-drift`
**Extends**: `openspec/specs/react-pattern-analyzers/spec.md`
**Status**: Proposed (RFC 2119)
**Type**: Delta — ADDED requirements + one MODIFIED requirement extending per-slice scoping to P11-S8.

This delta describes WHAT MUST be true after the change is applied. It does not prescribe
implementation. The analyzer is adapter-owned (`@rai/adapter-react`), file-scoped, and reads only
observed `jsx`/`jsx-attribute` pattern facts (JSX USAGE site). It MUST NOT read component definition
metadata (`ctx.graph.components` / `component.propNames`) — that DEFINITION site is P11-S3's domain.

---

## ADDED Requirements

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

---

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S4 MUST add only generic framework-neutral pattern facts and MUST NOT emit new React analyzer findings. P11-S5 MUST add only the context provider value-surface drift analyzer for same-file local context binding/provider value-surface divergence. P11-S6 MUST add only the `react/form-control-surface-drift` analyzer for same-file native form submit-surface divergence and same-element-type controlled/uncontrolled control-binding divergence. P11-S7 MUST add only the `react/data-fetching-surface-drift` analyzer for same-file co-presence of a raw-fetch `call` callee family and a query-hook `hook-call` name family. P11-S7 MUST NOT emit findings for runtime fetch behavior, waterfalls, performance, import/library identity, cross-file co-presence, `useEffect`-driven fetch patterns, axios-vs-fetch client detection, design-system usage, overlays, broad API convention families, or any claim outside observed same-file call-name-surface divergence. P11-S8 MUST add only the `react/overlay-control-surface-drift` analyzer for same-file JSX-usage-site open-state divergence and handler-name divergence across capitalized overlay component elements drawn from the adapter-owned `OVERLAY_TAGS` set. P11-S8 MUST NOT emit findings from component-definition prop declarations (the P11-S3 domain), from lowercase native tags (the P11-S6 domain), from dotted compound member usage (the P11-S1 domain), or for runtime overlay/modal behavior, portal rendering, focus trapping, accessibility, library identity, cross-file co-presence, design-system usage, data-fetching, or broad API convention families. Those families MAY be specified and implemented by later approved changes that consume generic facts in adapter-owned analyzers.

(Previously: the slice scoping covered P11-S1 through P11-S7 only and deferred design-system usage, overlay, and broad API convention analyzers to later approved adapter-owned changes.)

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

#### Scenario: Future analyzers remain adapter-owned

- GIVEN P11-S4 adds generic fact kinds that future React analyzers can consume
- WHEN `@rai/core` and `@rai/adapter-react` boundaries are inspected
- THEN React interpretation MUST remain outside core
- AND future design-system, axios-client, or broad API-convention findings MUST require a later approved adapter-owned change.
