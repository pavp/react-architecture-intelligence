# Design: P11-S9 — react/design-system-usage-surface-drift

Phase: design · Persistence: hybrid · Engram topic: `sdd/p11-s9-design-system-usage-surface-drift/design`

This design is implementation-ready. Every structural claim below was verified against the
P11-S8 template (`overlay-control-surface-drift.ts` + `.test.ts`), the P11-S6 reference
(`form-control-surface-drift.ts`), the P11-S3 non-overlap reference
(`controlled-uncontrolled-prop-surface-drift.ts`), and the core fact shapes
(`packages/core/src/types.ts`).

---

## 1. Architecture Approach

**Pattern**: Pure synchronous analyzer over `AnalysisContext`, adapter-owned, file-scoped,
per-capitalized-tag bucketed. Direct structural clone of P11-S8 `overlay-control-surface-drift.ts`.

**Layering / boundaries**:
- Lives entirely in `packages/adapter-react/`. ZERO changes to `packages/core/**`.
- Reads ONLY `ctx.graph.patternFacts` (kinds `jsx` and `jsx-attribute`).
- NEVER reads `ctx.graph.components` — that is P11-S3's definition-site domain. The import list
  in the new module MUST NOT include `ComponentNode`, and the analyze body MUST NOT reference
  `ctx.graph.components`. This is the central non-overlap enforcement (see §9).
- Composes into the pipeline via the existing `createReactCoreAnalyzers()` factory array in
  `core-adapter.ts` (registry-factory composition, no pipeline edit).

**Determinism**: identical facts → identical findings. Facts are sorted via `compareFacts`
before processing; all collected token/tag/name lists are `sortedUnique`; the structural
fingerprint is span/id free (JSON of sorted arrays).

---

## 2. Module Layout (ADR-1)

| Item | Value |
|------|-------|
| Source file | `packages/adapter-react/src/design-system-usage-surface-drift.ts` |
| Test file | `packages/adapter-react/src/design-system-usage-surface-drift.test.ts` |
| Factory | `createDesignSystemUsageSurfaceDriftAnalyzer(): Analyzer` |
| Rule id constant | `DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID = "react/design-system-usage-surface-drift"` |
| Subject prefix | `react:design-system-usage-surface:${file}` |
| `index.ts` | export `{ DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID, createDesignSystemUsageSurfaceDriftAnalyzer }` |
| `core-adapter.ts` | +1 import, +1 array entry `createDesignSystemUsageSurfaceDriftAnalyzer(), // P11-S9` |

Naming mirrors P11-S8 exactly. The analyzer object shape is identical:
`{ ruleId, framework: "react", analyze, explain }`.

**Imports from `@rai/core`** (mirror S8, MINUS any component type):
`explainTerm`, and types `AdapterMetricEvidence`, `AnalysisContext`, `Analyzer`, `AnalyzerResult`,
`ExplanationEnvelope`, `Finding`, `PatternFact`, `PatternJsxAttributeFact`, `PatternJsxFact`,
`PresentedFinding`, `Severity`, `Span`. `createHash` from `node:crypto`.
**Do NOT import `ComponentNode`.**

---

## 3. Constants (ADR-2)

Module-level frozen sets:

```ts
// Variant-style prop name tokens (adapter-owned; observed syntax only).
const VARIANT_PROPS: ReadonlySet<string> = Object.freeze(
  new Set(["variant", "size", "color", "tone", "intent", "appearance"]),
);

// Raw-style prop name tokens.
const RAW_STYLE_PROPS: ReadonlySet<string> = Object.freeze(
  new Set(["className", "style"]),
);

// Calibration discipline (OQ4): additions to VARIANT_PROPS or RAW_STYLE_PROPS require a
// P12 calibration cycle. Do not expand ad-hoc — each new token broadens FP surface.
```

The OQ4 comment is mandatory and MUST appear verbatim in the source above the sets.

**Tracked-attribute set** = `VARIANT_PROPS ∪ RAW_STYLE_PROPS`. These sets are fully disjoint
from S3 (`value/defaultValue/checked/defaultChecked/open/defaultOpen` + handler props),
S6 (`onSubmit/action/method` + control bindings), and S8
(`open/defaultOpen` + `onOpenChange/onClose/onDismiss`). No tracked token overlaps.

---

## 4. Fact Reads & Bucketing (ADR-3)

### Tag guard (the candidate-element predicate)

A tag is a candidate iff:

```ts
function isCandidateTag(tag: string): boolean {
  return tag.length > 0 && tag[0] === tag[0].toUpperCase() && tag[0] !== tag[0].toLowerCase()
    && !tag.includes(".");
}
```

Plain-English: first character is an uppercase letter AND the tag contains no dot. This matches
`Button`, `Card`, `Badge`; rejects lowercase native tags (`div`, `button`) and dotted compound
members (`Modal.Trigger`). The `tag[0] !== tag[0].toLowerCase()` clause guards against a
leading non-letter character (e.g. `$x`) being treated as "uppercase" by `toUpperCase()`.

### Fact guards (mirror S8 `isJsxFact` / `isJsxAttributeFact`)

```ts
function isJsxFact(fact: PatternFact): fact is PatternJsxFact {
  return fact.kind === "jsx" && isCandidateTag((fact as PatternJsxFact).tag);
}

function isJsxAttributeFact(fact: PatternFact): fact is PatternJsxAttributeFact {
  if (fact.kind !== "jsx-attribute") return false;
  const a = fact as PatternJsxAttributeFact;
  return isCandidateTag(a.tag)
    && (VARIANT_PROPS.has(a.name) || RAW_STYLE_PROPS.has(a.name));
}
```

### Bucketing

- Per-file: build `files = sortedUnique([...jsxFacts.map(f=>f.file), ...attrFacts.map(f=>f.file)])`,
  iterate file by file (S8 parity). No cross-file correlation.
- Per-tag within a file: group `fileJsx` by `tag` into a `Map<string, PatternJsxFact[]>`.
- Attr-to-element mapping: `spanContains(element.span, attr.span)` (file equality + child span
  within container span) — identical to S8/S6. An attribute belongs to the element whose span
  contains it. This is how "which usage of `<Button>` owns which prop" is determined.

### Explicit non-read

`ctx.graph.components` is NEVER referenced. The `analyze` function reads
`ctx.graph.patternFacts` only (plus `ctx.runId`, `ctx.commitSha`, `ctx.analysisVersion` for the
finding envelope — identical to S8).

---

## 5. Divergence Computation (ADR-4)

`computeExceeded(file, fileJsx, fileAttrs): string[]` returns a sorted-unique token list.
One token per divergent tag: `stylingVariantSurfaceDrift:{tag}:{file}`.

### Algorithm (pseudocode)

```
tokens = []
byTag = group fileJsx by tag                       // Map<tag, element[]>

for each (tag, elements) in byTag, iterated in sorted-tag order:
    if elements.length < 2: continue                // OQ: single usage → SILENT (cross-usage required)

    // Map each element to the surfaces it carries, via spanContains.
    elsWithVariant = Set<elementId>()
    elsWithRaw     = Set<elementId>()
    for each el in elements:
        for each a in fileAttrs where a.tag === tag:
            if not spanContains(el.span, a.span): continue
            if VARIANT_PROPS.has(a.name):  elsWithVariant.add(el.id)
            if RAW_STYLE_PROPS.has(a.name): elsWithRaw.add(el.id)

    // Gate: some element carries a variant AND some element carries a raw prop ...
    if elsWithVariant.size === 0 or elsWithRaw.size === 0: continue   // uniform → SILENT

    // ... AND genuine cross-usage divergence: at least one element is variant-WITHOUT-raw
    // OR at least one element is raw-WITHOUT-variant. A set of elements that ALL carry both
    // does NOT fire (OQ2: single-element-both, and all-usages-carry-both, are SILENT).
    variantWithoutRaw = exists id in elsWithVariant where not elsWithRaw.has(id)
    rawWithoutVariant = exists id in elsWithRaw     where not elsWithVariant.has(id)
    if not (variantWithoutRaw or rawWithoutVariant): continue          // all-both → SILENT

    tokens.push(`stylingVariantSurfaceDrift:${tag}:${file}`)

return sortedUnique(tokens)
```

### Why the gate is shaped this way

- `elements.length < 2` rejects single-usage tags. Cross-usage divergence is undefined for one
  element. (OQ: single usage SILENT.)
- `elsWithVariant.size > 0 && elsWithRaw.size > 0` requires BOTH surfaces present somewhere on
  the tag. Uniform-variant-only and uniform-raw-only are SILENT.
- `variantWithoutRaw || rawWithoutVariant` requires a genuine split: at least one usage that
  diverges from the "carries both" state. If every usage carries both `variant` and `className`,
  there is no divergence between usages — SILENT (OQ2 extended). A single `<Button variant
  className>` with no other usage also cannot fire because it fails `elements.length < 2`.

### Severity

```
divergenceCount = exceeded.length          // number of divergent tags
severity = divergenceCount > 1 ? "warn" : "info"
```

Mirrors `severityFor` from S8/S6. One divergent tag → `info`; two or more → `warn`.

### Evidence collection (sorted, unique — for FP stability and presentation)

- `observedTags = sortedUnique(fileJsx.map(f => f.tag))` — all candidate tags in the file.
- `divergentTags = sortedUnique(exceeded.map(token → tag segment))` — tags that fired. Extract
  the middle segment of `stylingVariantSurfaceDrift:{tag}:{file}` by splitting on the FIRST and
  LAST colon is unsafe if a file path contains colons; instead the tag is captured directly when
  building tokens (store a parallel `Map<token, tag>` or rebuild from `byTag` keys that fired).
  **Decision**: keep a `divergentTags: string[]` accumulated alongside `tokens` inside
  `computeExceeded`-equivalent logic, OR return a richer structure. To stay faithful to the S8
  string-token contract, the analyzer derives `divergentTags` by re-deriving from `byTag`:
  a tag is divergent iff its token is in `exceeded`. Token format `stylingVariantSurfaceDrift:`
  prefix is stripped, then the tag is everything up to `:${file}` suffix (file is known, so
  `token.slice(prefix.length, token.length - (":" + file).length)`). This is colon-safe because
  `file` is the exact known suffix.
- `divergentVariantProps = sortedUnique(fileAttrs.filter(a => VARIANT_PROPS.has(a.name) && tag of a is divergent).map(a => a.name))`
- `divergentRawProps = sortedUnique(fileAttrs.filter(a => RAW_STYLE_PROPS.has(a.name) && tag of a is divergent).map(a => a.name))`

---

## 6. Subject + Finding Shape (ADR-5)

### Subject

```ts
const subjectId = `react:design-system-usage-surface:${file}`;
```

File-level subject (one finding per file, OQ6 PER-FILE), `name = file`, `file = file`,
`span = primarySpan`, `fingerprint = structuralFp`.

### Fingerprint triple (EXACT strings feeding each SHA — P11-S8 parity)

```ts
// divergenceTypes: token prefixes (the single type "stylingVariantSurfaceDrift"), unique+sorted
const divergenceTypes = exceeded
  .map((t) => t.slice(0, t.indexOf(":")))
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();

const structuralFp = sha(JSON.stringify({
  ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
  file,
  divergenceTypes,        // sorted unique token-type prefixes
  divergentTags,          // sorted unique tags that fired
  observedVariantProps: divergentVariantProps,  // sorted unique variant prop names on divergent tags
  observedRawProps: divergentRawProps,          // sorted unique raw prop names on divergent tags
}));

const fingerprint = {
  structural: structuralFp,
  nominal:    sha(file),
  positional: sha([file, primarySpan.start, primarySpan.end].join("|")),
};
```

This is the S8 shape: `nominal = sha(file)`, `positional = sha([file, start, end].join("|"))`,
`structural = sha(JSON.stringify({...span-free sorted arrays...}))`.

### Span anchor decision

`primarySpan` = the span with the **lowest `span.start`** among contributing facts, tie-broken
by `compareFacts`. Implemented by `primarySpanFor`: gather contributing facts (all divergent-tag
jsx elements + their tracked variant/raw attrs), sort by `compareFacts`, then by `span.start`
ascending, take `[0].span`. Fallback to `fileJsx[0].span` or a synthetic
`{ file, start: 0, end: 0, kind: "jsx", astPath: "" }` if empty. **This matches P11-S8's
`primarySpanFor` exactly** and guarantees `structural` is stable under pure span shifts while
`positional` changes.

### Finding envelope (S8 parity)

```ts
{
  id: sha([ctx.runId, RULE_ID, file, structuralFp].join("|")),
  ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
  type: "opportunity",
  fingerprint,
  analysisVersion: ctx.analysisVersion,
  fpAlgoVersion: 1,
  producingRunId: ctx.runId,
  commitSha: ctx.commitSha,
  severityRaw: severity,
  evidence,        // AdapterMetricEvidence (below)
  createdAt: 0,
}
```

### AdapterMetricEvidence

```ts
{
  kind: "adapter-metric",
  adapterId: "react",
  ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
  subject: { id: subjectId, name: file, file, span: primarySpan, fingerprint: structuralFp },
  roles: uniqueRoles(roles).sort(compareRoles),   // one role per candidate element + per divergent prop
  metrics: {
    candidateElements: fileJsx.length,
    divergentTagCount: divergentTags.length,
    divergenceSignals: divergenceCount,
    observedTagCount: observedTags.length,
    variantPropCount: divergentVariantProps.length,
    rawPropCount: divergentRawProps.length,
  },
  thresholds: {
    minUsagesForDrift: 2,
    maxDivergenceSignals: 0,
  },
  topology: {
    directChildIds: sortedUnique(contributingJsxIds),   // jsx ids of divergent-tag elements
    reachableNodeIds: sortedUnique(contributingAttrIds), // attr ids of tracked props on divergent tags
    exceeded: [...exceeded].sort(),
  },
}
```

Roles (mirror S8 role construction, neutral vocabulary):
- `{ role: "styled-element", variant: tag, file }` for each candidate jsx element.
- `{ role: "variant-prop", variant: name, file }` for each variant prop on a divergent tag.
- `{ role: "raw-style-prop", variant: name, file }` for each raw prop on a divergent tag.

Findings array returned `.sort(compareFindings)` (by structural, nominal, positional) — S8 parity.

---

## 7. Explain Hook (ADR-6) — GROUNDABILITY (central acceptance criterion)

Adapter-owned `explainDesignSystemUsageSurfaceDrift(finding): ExplanationEnvelope | null`.
Returns `null` unless `finding.ruleId === RULE_ID && finding.evidence.kind === "adapter-metric"`.

Envelope fields: `summary`, `whyItMatters`, `inspectFirst`, `limits[]`, `groundingFields`
(`Object.keys(evidence).sort()`), `glossary` (`groundingFields.map(explainTerm)`). Identical
shape to S8.

### CRITICAL: forbidden-vocabulary regex is SUBSTRING-based

The S8 explain test asserts (verified verbatim at `overlay-control-surface-drift.test.ts:389`):

```
/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|runtime behavior|two libraries|React warning|you should|root cause/i
```

Plus the proposal's GROUNDABILITY forbidden phrases. **The match is substring/regex over the
serialized JSON — a banned token is forbidden even inside a negation.** Therefore the explain
text MUST NOT contain ANY of these literal substrings (case-insensitive):

#### forbidden_substrings_to_avoid (the exact list, combined)

From the S8 test regex (these EXACT literals/patterns):
1. `bug` (whole word)
2. `wrong` (whole word)
3. `must refactor` / `must migrate`
4. `will conflict`
5. `runtime behavior`
6. `two libraries`
7. `React warning`
8. `you should`
9. `root cause`

From the proposal GROUNDABILITY forbidden-word list (substring):
10. `design system component`
11. `component library`
12. `themed`
13. `override`
14. `conflict`  (broader than `will conflict` — avoid the bare substring entirely)
15. `incorrect`

Defensive additions flagged by the design prompt (avoid these literals too):
16. `runtime` (avoid the bare substring; phrase as "when the app runs")
17. `root cause`  (already #9)
18. `library` (avoid — appears inside `component library`; do not use the word `library` at all)

The phrase `two libraries` is banned; the bare word `library`/`libraries` is risky because it
signals membership inference. Use neutral wording: "which package a component comes from".

### Limit lines (NEGATED DISCLAIMERS, all verified clean against the list above)

```ts
limits: [
  "RAI observes only the literal tag names and prop names as written in source; it does not establish which package a component comes from, what these props do when the app runs, or whether the observed difference is intended.",
  "RAI does not infer team intent, prior history, or any required code change from this finding; it is file-scoped and no edit is implied.",
  "Spread props (for example {...rest}) are not visible to static facts; RAI makes no claim about which prop names a spread provides.",
  "RAI compares prop name tokens only within a single file; it performs no import resolution and no cross-file correlation.",
]
```

Self-check of every limit line against the forbidden list:
- "which package a component comes from" — uses `package`, not `library`. Clean.
- "what these props do when the app runs" — avoids `runtime`/`runtime behavior`. Clean.
- "whether the observed difference is intended" — avoids `conflict`/`override`/`incorrect`. Clean.
- "no required code change" / "no edit is implied" — avoids `must refactor`/`you should`. Clean.
- No `bug`, `wrong`, `themed`, `design system component`, `component library`, `React warning`,
  `root cause`, `two libraries`, `will conflict`. Verified.

### summary / whyItMatters / inspectFirst (neutral wording)

- `summary`: e.g. `"${file} has observed prop-surface divergence: distinct usages of one or more capitalized tags carry variant-style prop names while other usages carry raw-style prop names."` — contains none of the forbidden substrings.
- `whyItMatters`: `"This is worth reviewing because the observed prop surfaces for the same tag are not uniform across its usages in this file, which can make the prop contract harder to review consistently."` — clean.
- `inspectFirst`: list `[file, "divergent tags: <sorted list>", "variant-style props observed: <...>", "raw-style props observed: <...>", "divergence signals observed: <n>"]`.

**Mandatory implementation gate**: before finalizing, run the serialized explain JSON against
the exact S8 regex AND a substring check for items 10–18. The test suite encodes this (see §8).

---

## 8. Edge Cases & Failure Modes (ADR-7)

| # | Case | Behavior | Mechanism |
|---|------|----------|-----------|
| 1 | Single element with both `variant` + `className`, no other usage | SILENT | `elements.length < 2` |
| 2 | Tag with `<2` usages | SILENT | `elements.length < 2` |
| 3 | All usages carry BOTH surfaces | SILENT | `variantWithoutRaw || rawWithoutVariant` is false |
| 4 | Uniform variant-only (every usage has variant, none raw) | SILENT | `elsWithRaw.size === 0` |
| 5 | Uniform raw-only | SILENT | `elsWithVariant.size === 0` |
| 6 | Cross-usage: usage A `variant`, usage B `className` | FIRES `info` | both sets non-empty + both without-checks true |
| 7 | Spread attr (`{...props}`, valueKind `spread`) | INVISIBLE / documented | not in tracked names; never produces a jsx-attribute name match; documented in explain limit #3 |
| 8 | Duplicate identical attrs on one element | Counts once toward that element's surface set | Set semantics on element id |
| 9 | Lowercase native tag (`button`, `div`) | NOT matched, SILENT | `isCandidateTag` fails uppercase check |
| 10 | Dotted member tag (`Modal.Trigger`) | NOT matched, SILENT | `isCandidateTag` fails `!tag.includes(".")` |
| 11 | Bare prop, `variant` with valueKind `absent` | COUNTS as variant hit (OQ3) | guard does NOT filter on valueKind for the surface sets |
| 12 | Ordering stability | Deterministic | `compareFacts` sort + `sortedUnique` + per-tag sorted iteration |
| 13 | Frozen evidence / frozen facts | No mutation | analyzer only reads; arrays copied via spread before sort |
| 14 | Cross-file isolation | Per-file only | file loop; `spanContains` requires same file |
| 15 | Multiple divergent tags in one file | FIRES `warn` | `divergenceCount > 1` |
| 16 | **Non-overlap with S3**: file where a component DECLARES `variant`/`className` in `propNames` but has `<2` divergent JSX usages | NO finding | analyzer never reads `ctx.graph.components`; only jsx/jsx-attribute facts drive emission |
| 17 | Empty facts | NO finding | empty file loop |
| 18 | Leading non-letter tag (`$Foo`) | NOT matched | `tag[0] !== tag[0].toLowerCase()` guard |

Note on #11 (bare variant): unlike S8 Gate B (which filters `valueKind === "absent"` out for
handlers), S9 surface membership is presence-of-prop-name. A bare `<Button variant>` is a
variant-style surface regardless of value, consistent with OQ3 and the S8 open-state precedent
(absent valueKind still counts on the controlled side).

---

## 9. Non-Overlap with S3 — Enforcement (CRITICAL)

S3 (`controlled-uncontrolled-prop-surface-drift.ts`) imports `ComponentNode` and reads
`ctx.graph.components` (verified at S3 lines 8 and analyze body) to inspect `propNames` at the
DEFINITION site. S9 operates at the USAGE site only.

**Enforcement (three independent layers):**
1. **Import-level**: the S9 module does NOT import `ComponentNode`. A reviewer/grep can confirm
   absence of `ComponentNode` and `ctx.graph.components` in the file.
2. **Read-level**: `analyze` reads only `ctx.graph.patternFacts`. `ctx.graph.components` is never
   dereferenced.
3. **Test-level**: edge case #16 populates `ctx.graph.components` with a component whose
   `propNames` include `variant` and `className`, but provides `<2` divergent JSX usages. The
   analyzer MUST stay SILENT. This proves emission is driven by patternFacts alone and the
   components array is ignored. (Mirrors S8's `NON-OVERLAP S3` tests using the `runFacts`
   third arg.)

Prop sets are also disjoint: S3 tracks `value/defaultValue/checked/defaultChecked/open/defaultOpen`
+ handler props; S9 tracks `variant/size/color/tone/intent/appearance` + `className/style`. No
overlap with S6 or S8 tracked attrs either (proposal Non-Overlap table).

---

## 10. Test Plan Outline (ADR-8) — Strict TDD

Vitest, mirroring the S8 `runFacts()` harness (3-arg signature: `facts, runId?, components?`).
Reuse the S8 `jsx`/`jsxAttribute`/`span`/`presented`/`freezeFacts`/`normalize`/`adapterEvidence`
builders verbatim. `valueKind` union must include `"spread"`.

Cases:
1. Cross-usage EMITS info: `<Button variant>` (usage 1) + `<Button className>` (usage 2) → 1 finding, `info`, `exceeded` contains `stylingVariantSurfaceDrift:Button:<file>`.
2. Single-element-both SILENT: one `<Button variant className>` only → `[]`.
3. All-usages-both SILENT: two `<Button variant className>` → `[]`.
4. Uniform-variant SILENT: two `<Button variant>` (different values) → `[]`.
5. Uniform-raw SILENT: two `<Card className>` → `[]`.
6. `<2` usages SILENT: one `<Button variant>` + one `<Button className>` would be cross-usage — so this case = single `<Button variant>` only → `[]`.
7. Lowercase SILENT: `<button variant>` + `<button className>` → `[]` (S6 domain).
8. Dotted SILENT: `<Modal.Trigger variant>` + `<Modal.Trigger className>` → `[]`.
9. NON-OVERLAP S3: `components: [{ name, propNames: ["variant","className"], file }]` + `<2` divergent jsx usages → `[]` (proves components never read).
10. Bare-variant counts: `<Button variant>` (valueKind `absent`) + `<Button className>` → EMITS.
11. Multiple divergent tags → `warn`: `Button` cross-usage + `Card` cross-usage → 1 finding, `warn`, `exceeded.length === 2`.
12. Determinism: forward vs reversed fact order → identical normalized findings.
13. Structural-FP stability: pure span shift keeps `structural` equal, changes `positional`.
14. Frozen evidence: `freezeFacts` input, assert no mutation (`JSON.stringify` before/after).
15. Explain forbidden-vocab: serialize explain JSON, assert `.not.toMatch(<S8 regex>)` AND `.not.toMatch(/design system component|component library|themed|override|conflict|incorrect|runtime|libraries?/i)`.
16. Explain null for non-matching ruleId.
17. Cross-file isolation: `<Button variant>` in file-a, `<Button className>` in file-b → `[]`.
18. spanContains correctness: two `<Button>` elements with attrs nested in distinct spans map to the right element (one variant-only, one raw-only) → EMITS.

---

## 11. No-Core-Change Confirmation

ZERO changes to `packages/core/**`. The analyzer consumes the EXISTING `PatternJsxFact` and
`PatternJsxAttributeFact` shapes (verified in `packages/core/src/types.ts`: `tag`, `parentTag`,
`name`, `value`, `valueKind` already produced). No new fact kind, no schema change, no migration.

## 12. Registry-Composition Confirmation

Composition is a one-line array append in `createReactCoreAnalyzers()` plus one import line in
`core-adapter.ts`, plus one re-export pair in `index.ts`. The pipeline
(`packages/core/src/engine/pipeline.ts`) and registry order
(`packages/core/src/analyzers/registry.ts`) are NOT edited — adapter analyzers are composed via
the factory array, consistent with S5–S8.

---

## 13. ADR Summary

| ADR | Decision | Rationale | Rejected alternative |
|-----|----------|-----------|----------------------|
| ADR-1 | Clone S8 module layout | Proven structural template, lowest risk | Inventing a new layout — needless divergence |
| ADR-2 | Frozen VARIANT/RAW sets + OQ4 comment | Disciplined, calibration-gated | Open/config-driven prop sets — FP risk, scope creep |
| ADR-3 | patternFacts-only, never `ctx.graph.components` | Non-overlap with S3 (usage vs definition) | Reading components to "improve recall" — recreates S3 overlap |
| ADR-4 | Cross-usage gate (≥1 variant-only OR ≥1 raw-only) | Single-element-both is a valid pattern, not drift | Firing on any tag with both surfaces — false positives |
| ADR-5 | File subject + span-free structural FP, lowest-start span anchor | S8 parity, stable under span shifts | Per-tag findings — deferred to P12 (OQ6) |
| ADR-6 | Adapter explain with negated-disclaimer limits, substring-clean | Groundability acceptance criterion | Loose prose mentioning libraries/runtime — fails verify |
| ADR-7 | Explicit silence + edge enumeration | Determinism + bounded behavior | Implicit edge handling — untestable |
| ADR-8 | Strict TDD, reuse S8 harness | Consistency, fast authoring | Bespoke harness — drift from family |

## 14. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Explain text accidentally contains a forbidden substring (`runtime`, `library`, `conflict`) | Med | §7 self-check list + test case #15 with extended regex; phrase as "when the app runs" / "which package" |
| `divergentTags` extraction mis-parses tags when file path contains `:` | Low | Strip known `:${file}` suffix exactly, not naive split |
| VARIANT_PROPS breadth (`color`, `size`) causes FP on non-library tags | Med | OQ4 calibration comment; cross-usage gate suppresses uniform usage |
| Reviewer expects per-tag findings | Low | OQ6 documents PER-FILE with `exceeded[]` listing tags; P12 follow-up |
| Tag guard treats leading non-letter as uppercase | Low | `tag[0] !== tag[0].toLowerCase()` clause + edge #18 |
