# Spec Delta: P11-S9 — react/design-system-usage-surface-drift

**Status**: Proposed (RFC 2119)
**Change**: `p11-s9-design-system-usage-surface-drift`
**Extends**: `openspec/specs/react-pattern-analyzers/spec.md`
**Persistence**: hybrid · Engram topic: `sdd/p11-s9-design-system-usage-surface-drift/spec`

This delta describes WHAT MUST be true after the change is applied. It is additive to the canonical
React Pattern Analyzers spec. It ADDS three new requirements for the
`react/design-system-usage-surface-drift` analyzer and MODIFIES the existing
"Deferred React Pattern Families Stay Scoped by Slice" requirement to extend per-slice scoping to
P11-S9. No prior requirement is removed.

---

## ADDED Requirements

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

---

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
