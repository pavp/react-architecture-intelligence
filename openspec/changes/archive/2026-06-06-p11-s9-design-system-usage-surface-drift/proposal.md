# Proposal: P11-S9 — react/design-system-usage-surface-drift

Phase: propose · Persistence: hybrid · Engram topic: `sdd/p11-s9-design-system-usage-surface-drift/proposal`

---

## Intent

React codebases that adopt component libraries routinely mix two styling surfaces on the same tag:
some usages pass variant-style prop names (`variant`, `size`, `color`) while other usages of the
same tag in the same file pass raw-style prop names (`className`, `style`). This per-tag, per-file
surface divergence is an observable structural pattern — no library membership inference required —
and RAI currently emits nothing for it. Adding `react/design-system-usage-surface-drift` closes
that gap using the same jsx/jsx-attribute fact pattern already proven in S6 and S8, with zero
changes to `@rai/core`.

---

## Groundability Statement (CRITICAL — first-class acceptance criterion)

This analyzer is **pure observed syntax**. It reads `PatternJsxAttributeFact.name` (a string token
such as `"variant"` or `"className"`) and `PatternJsxFact.tag` (a string token such as `"Button"`).
No import resolution is performed. No design-system membership is inferred. RAI does not know what
library exported the tag, what `variant` means at runtime, whether `className` overrides `variant`,
or whether the mix constitutes an error.

**Forbidden words** — the following MUST NOT appear in any finding text, explain output, or metric
label produced by this analyzer:
- "design system component"
- "component library"
- "themed"
- "override"
- "conflict"
- "incorrect"

Permitted language: "variant-style prop names", "raw-style prop names", "observed prop surface", "as
written in source". These limits MUST be encoded in the `explain()` hook's `limits[]` array.

This is the **central acceptance criterion** for sdd-verify: grounded, bounded language throughout.

---

## Non-Overlap Boundary (S3 / S6 / S8)

| Slice | Tag domain | Fact source | Tracked signal |
|-------|-----------|-------------|----------------|
| S3 | component DEFINITION | `ctx.graph.components` | value/defaultValue, checked/defaultChecked, open/defaultOpen in `propNames` |
| S6 | lowercase native (form, input, select, textarea) | patternFacts | submit-surface + controlled/uncontrolled binding pairs |
| S8 | capitalized OVERLAY_TAGS fixed allow-set | patternFacts | open/defaultOpen cross-element + onOpenChange/onClose/onDismiss handler diversity |
| **S9** | capitalized arbitrary (uppercase, no dot) | patternFacts | variant/size/color/tone/intent/appearance vs className/style per-tag |

- **S3**: S9 NEVER reads `ctx.graph.components`. S9 is usage-site; S3 is definition-site. Prop sets disjoint.
- **S6**: S6 guards lowercase tags only; S9 requires uppercase first char. No tag passes both guards.
- **S8**: S8 tracks open-state/handler attrs on a fixed overlay allow-set; S9 tracks styling/variant attrs on arbitrary capitalized tags. Tracked attribute sets are fully disjoint. A `<Dialog variant className>` fires S9 but NOT S8.

---

## Scope

### In Scope

- **Analyzer**: `react/design-system-usage-surface-drift` — adapter-owned in `packages/adapter-react/`
- **Tag guard**: first char uppercase AND `!tag.includes(".")` (capitalized non-dotted)
- **Prop sets**:
  - `VARIANT_PROPS = {variant, size, color, tone, intent, appearance}`
  - `RAW_STYLE_PROPS = {className, style}`
- **Emit condition (per tag T, per file)**:
  1. Collect jsx facts for T in this file
  2. Require ≥2 distinct usages (single usage → SILENT)
  3. Associate attrs to each element via `spanContains`
  4. Gate: some usage carries a VARIANT_PROP **AND** some OTHER usage carries a RAW_STYLE_PROP,
     with ≥1 element that is variant-only OR ≥1 element that is raw-only (genuine cross-usage
     divergence — a single element carrying both does NOT alone fire)
- **Subject**: `react:design-system-usage-surface:${file}` (file-scoped)
- **Token**: `stylingVariantSurfaceDrift:{tag}:{file}` per divergent tag
- **Severity**: 1 divergent tag → `info`; ≥2 divergent tags → `warn`
- **Silence conditions**: single usage; all usages carry both surfaces; no VARIANT_PROP present; no RAW_STYLE_PROP present; lowercase tag; dotted tag
- **Registration**: 1 import + 1 array entry in `core-adapter.ts`; 1 export in `index.ts`

### Out of Scope (permanent — not deferred)

- Design-system membership inference (which library `Button` belongs to)
- Import resolution (where a tag is imported from)
- Theming, CSS cascade, runtime styling behavior
- Whether `className` "overrides" `variant` (override semantics)
- CSS-in-JS patterns: `css` prop, styled-components, `tw`
- `sx` prop (emotion/MUI) — deferred to potential P12 calibration
- Anything reading `ctx.graph.components`
- Anything S3, S6, or S8 already emits
- New MCP tool
- Any change to `packages/core/**`

---

## Resolved Open Questions

| # | Question | Decision |
|---|----------|----------|
| OQ1 | Dotted member tags (`<Modal.Trigger>`) | **EXCLUDE** — guard: `!tag.includes(".")`. Dotted tags belong to S1's compound-component domain. |
| OQ2 | Single element carrying both variant + raw props | **SILENT** — a single `<Button variant="primary" className="mt-2">` is not cross-usage divergence. Gate requires ≥1 variant-only element AND ≥1 raw-only element across distinct usages. |
| OQ3 | Bare `variant` (valueKind absent) | **COUNTS** — the prop name token is present in the source regardless of value. Consistent with S8 precedent for bare `open`. |
| OQ4 | Prop-set expansion policy | **DOCUMENTED** — a comment in the implementation states: "Additions to VARIANT_PROPS or RAW_STYLE_PROPS require a P12 calibration cycle. Do not expand ad-hoc." Prevents undisciplined broadening. |
| OQ5 | Spread attrs (`{...props}`) invisible | **DOCUMENT AS EXPLAIN LIMIT** — not resolvable from static facts. Encoded in `explain().limits[]` alongside S6/S7/S8 precedent. No attempt to resolve. |
| OQ6 | Per-file vs per-tag finding granularity | **PER-FILE** — one finding per file (parity with S6/S8). `topology.exceeded[]` lists the divergent tag tokens for actionability. Per-tag granularity may be a P12 follow-up. |

---

## Approach

Implement as a pure synchronous function following the S8 template (`overlay-control-surface-drift.ts`):

1. Filter `ctx.graph.patternFacts` to jsx + jsx-attribute facts for capitalized non-dotted tags in this file
2. Group by tag → per-tag element list; build spanContains map (attr → parent element)
3. For each tag: apply the cross-usage gate; collect divergent tag tokens
4. Emit one `opportunity` finding per file when `exceeded.length > 0`; severity from count
5. Structural fingerprint: `JSON.stringify({ruleId, file, divergenceTypes, observedTags, divergentAttrNames})` (span-free, stable)
6. Register in `core-adapter.ts` via the existing `createReactCoreAnalyzers()` factory array

## Affected Areas

| File | Change | Estimated lines |
|------|--------|----------------|
| `packages/adapter-react/src/design-system-usage-surface-drift.ts` | NEW | ~250–300 |
| `packages/adapter-react/src/design-system-usage-surface-drift.test.ts` | NEW | ~280–350 |
| `packages/adapter-react/src/core-adapter.ts` | +1 import, +1 array entry | ~3 |
| `packages/adapter-react/src/index.ts` | +1 export | ~3 |
| `packages/core/**` | ZERO | 0 |

**Total estimate: ~540–660 lines. Single PR within the 800-line review budget.**

---

## Guardrail Compliance

- Adapter-owned: YES — lives entirely in `packages/adapter-react/`
- Pure/deterministic: YES — synchronous function over fact arrays, no I/O, no side effects
- Stable fingerprints: YES — span-free structural fingerprint (JSON.stringify pattern)
- No new MCP tool: YES
- Registry-factory composition: YES — `createReactCoreAnalyzers()` array entry
- Drift terminology: YES — "surface drift" consistent with P11 family naming
- NEVER reads `ctx.graph.components`: YES — confirmed, patternFacts only

---

## Capabilities

### New Capabilities
- `react/design-system-usage-surface-drift`: Per-tag, per-file observation of mixed variant-style vs raw-style prop surface across distinct JSX usages of the same capitalized non-dotted tag

### Modified Capabilities
- None

---

## Acceptance Signals for Spec/Design

The following properties MUST be preserved through all downstream phases:

1. **Groundability** — finding/explain text uses only bounded language; `limits[]` encodes spread-invisible and no-membership-inference constraints
2. **Non-overlap with S3** — ZERO reads of `ctx.graph.components`; prop sets disjoint from S3/S6/S8 tracked attrs
3. **Determinism** — identical facts → identical findings; fingerprint excludes span/id
4. **Silence conditions** — single-usage, all-same-surface, lowercase, dotted tag cases produce ZERO findings
5. **Cross-usage gate** — single element carrying both props does NOT fire; requires ≥1 variant-only + ≥1 raw-only across distinct element usages

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| VARIANT_PROPS expansion introduces FP | Med | Documented expansion policy enforced via code comment; P12 calibration gate |
| Dotted tag passes uppercase guard | Low | `!tag.includes(".")` guard is simple and unit-tested as a silence case |
| Spread attrs cause missed signals | Low | Documented as explain limit; shared limitation with S6/S7/S8; acceptable |
| Single-element-both not explicitly silenced | Low | Must be an explicit negative test case in the test suite |
| Finding language drifts toward overreach | Med | GROUNDABILITY section defines forbidden word list; verify phase checks |

## Rollback Plan

Delete `design-system-usage-surface-drift.ts` + `.test.ts`; revert the one-liner additions to `core-adapter.ts` and `index.ts`. No core changes, no schema changes, no migrations. Rollback is a 4-file revert.

## Dependencies

- P11-S6 and P11-S8 as structural templates (already merged)
- No external library dependencies
- No core changes required

## Success Criteria

- [ ] `react/design-system-usage-surface-drift` fires for a file where `<Button>` appears twice: once with `variant` only, once with `className` only
- [ ] SILENT for single-usage tag (even if it has both `variant` and `className`)
- [ ] SILENT for single element with both `variant` and `className` (no other usages)
- [ ] SILENT for lowercase tags and dotted tags
- [ ] Bare `variant` (absent valueKind) counts as VARIANT_PROP hit
- [ ] Finding text contains none of the forbidden words
- [ ] `explain().limits[]` documents spread-invisible and no-membership-inference
- [ ] Zero changes to `packages/core/**`
- [ ] All existing S3/S6/S8 tests continue to pass unmodified
