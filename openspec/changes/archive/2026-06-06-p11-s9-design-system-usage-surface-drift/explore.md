# Exploration: P11-S9 — react/design-system-usage-surface-drift

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p11-s9-design-system-usage-surface-drift/explore` (obs #650)

## Executive Summary

The signal — same-file, same-capitalized-component-tag, mixed variant-style prop surface vs raw-style
prop surface across distinct usages — IS groundable from pure jsx/jsx-attribute facts with zero import
resolution and zero core changes. Non-overlap with S3/S6/S8 is clean. Recommended scope: narrow
(variant vs className/style per tag, capitalized non-dotted tags only, per-tag grouping, cross-usage
gate). ~540-660 lines, single PR within the 800-line budget.

## Groundability Ruling — YES (the make-or-break question)

Pure observed syntax, no import/membership inference. The analyzer observes the literal `name` token
(`"variant"`, `"className"`) from `PatternJsxAttributeFact` and the literal `tag` token (`"Button"`)
from `PatternJsxFact` — identical in kind to how S8 observes `"open"`/`"onOpenChange"`. It observes
"in this file, `<Button>` appears ≥2× and some usages carry a VARIANT_PROP name while others carry a
RAW_STYLE_PROP name." It makes NO claim about what library `Button` belongs to, what `variant` means,
whether `className` overrides it, or whether the mix is wrong. The "design system" in the rule id names
the pattern family; it is NOT an inference the analyzer makes.

## Non-Overlap Boundary (S3 / S6 / S8)

| Slice | Tag domain | Fact source | Signal |
|-------|-----------|-------------|--------|
| S3 | component DEFINITION | `ctx.graph.components` | value/defaultValue, checked/defaultChecked, open/defaultOpen in propNames |
| S6 | lowercase native (form/input/select/textarea) | patternFacts jsx+jsx-attribute | submit-surface + controlled/uncontrolled binding pairs |
| S8 | capitalized OVERLAY_TAGS allow-set | patternFacts jsx+jsx-attribute | open/defaultOpen cross-element + onOpenChange/onClose/onDismiss |
| **S9** | capitalized arbitrary (uppercase, no dot) | patternFacts jsx+jsx-attribute | variant/size/color/tone/intent/appearance vs className/style per-tag |

- **vs S3:** S9 reads ONLY `ctx.graph.patternFacts`, NEVER `ctx.graph.components`. Usage-site vs definition-site. Prop sets disjoint.
- **vs S6:** S6 guards lowercase native tags; S9 capitalized only. No tag passes both.
- **vs S8:** S8 tracks open-state/handler attrs on a fixed overlay allow-set; S9 tracks styling/variant attrs on arbitrary capitalized tags. A `<Dialog variant className>` fires S9 but NOT S8 — different observation. Tracked attr sets fully disjoint.

## jsx / jsx-attribute Fact Shapes + Capitalized Production (confirmed)

```typescript
PatternJsxFact          { kind: "jsx";           tag: string; parentTag: string }
PatternJsxAttributeFact { kind: "jsx-attribute";  tag: string; parentTag: string; name: string; value: string;
                          valueKind: "absent"|"literal"|"expression"|"spread"|"unknown" }
```

pass1.ts 193-214: jsx/jsx-attribute facts produced for ALL JSX elements, no capitalization filter at
core. `jsxNameText` returns raw identifier (`"Button"`) or dotted form (`"Modal.Trigger"`). The
capitalization guard lives entirely in S9's adapter-local `isJsxFact`. **Zero core changes.**

## Recommended Scope (Narrow — Scope A)

Rule id `react/design-system-usage-surface-drift`. File-scoped subject `react:design-system-usage-surface:${file}`.

Tag guard: `tag[0]` uppercase AND `!tag.includes(".")` (capitalized non-dotted — excludes native HTML
and S1's dotted member tags).

```typescript
VARIANT_PROPS   = {variant, size, color, tone, intent, appearance}
RAW_STYLE_PROPS = {className, style}
```

EMIT per tag T in a file: collect jsx facts for T; require ≥2 distinct usages; via spanContains map
attrs to each element; fire when some usage has a VARIANT_PROP AND some OTHER usage has a RAW_STYLE_PROP,
with genuine cross-usage divergence (≥1 element variant-only OR ≥1 element raw-only — a single element
carrying both does NOT alone fire). Token `stylingVariantSurfaceDrift:{tag}:{file}`.

Severity: 1 divergent tag → info; ≥2 → warn.

SILENCE: single usage of a tag; all usages carry both surfaces; no VARIANT_PROP present; no
RAW_STYLE_PROP present; lowercase tag; dotted tag.

## Library-name / Prop-name Boundary

Prop names (`variant`/`className`) and tag names (`Button`) are observed string tokens (P11-S7/S8
ruling). RAI does NOT know what `variant` means, which library defines it, whether `className` overrides
it, or what library exported the tag. Finding/explain text MUST NOT use "design system component",
"component library", "themed", "override", "conflict", or "incorrect" — only "variant-style prop names"
vs "raw-style prop names" as written in source. Enforced via explain `limits[]`.

## Out of Scope (permanent)

DS membership inference, import resolution, theming/CSS cascade/runtime styling, className-vs-variant
override semantics, CSS-in-JS (`css` prop, styled-components), `sx` prop (deferred to possible P12),
anything via `ctx.graph.components`, new MCP tool, core changes.

## Affected Areas

- `packages/adapter-react/src/design-system-usage-surface-drift.ts` — new (~250-300)
- `packages/adapter-react/src/design-system-usage-surface-drift.test.ts` — new (~280-350)
- `packages/adapter-react/src/core-adapter.ts` — +~3
- `packages/adapter-react/src/index.ts` — +~3
- `packages/core/**` — ZERO
- **Total ~540-660**, single PR within budget.

## Core Changes Needed

**NO.** Fact types + pass1 production sufficient. spanContains duplicated locally (S6/S8 precedent).

## Open Questions for Proposal

1. Dotted member tags (`<Modal.Trigger>`) — EXCLUDE (S1 domain; `!tag.includes(".")`).
2. Single element with both variant+raw → SILENT (cross-usage divergence required).
3. Bare `variant` (valueKind absent) counts as VARIANT_PROP usage? → YES (S8 precedent).
4. Prop-set expansion policy — document "additions require P12 + calibration" comment.
5. `valueKind: "spread"` (`{...props}`) invisible — document as explain limit, do NOT resolve.
6. Per-file vs per-tag finding granularity → per-file (S6/S8 parity), `topology.exceeded` lists divergent tag tokens.

## Risks

- VARIANT_PROPS expansion without calibration → FP risk. Mitigate via documented expansion policy.
- Dotted tags pass uppercase check — MUST exclude via `!tag.includes(".")` or S1 domain leaks.
- spread attrs invisible (shared S6/S7/S8 limitation) — document in explain limits.
- Single-element-both-props is a SILENT case — must be explicitly tested.

## Status

Ready for proposal. Groundable, non-overlapping, zero core changes, within budget. Recommended scope: A (narrow).
