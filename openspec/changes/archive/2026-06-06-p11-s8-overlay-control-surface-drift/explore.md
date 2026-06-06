# Exploration: P11-S8 — react/overlay-control-surface-drift

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p11-s8-overlay-control-surface-drift/explore` (obs #641)

## Executive Summary

`react/overlay-control-surface-drift` is viable and distinct from all prior analyzers. Non-overlap is
verified against source: P11-S3 operates on component DEFINITION propNames, P11-S6 on lowercase native
HTML tags, P11-S1 on dotted member JSX — none covers capitalized overlay-component JSX-attribute usage.
Capitalized-tag fact production confirmed in pass1.ts. Recommended scope: Signal A (open/defaultOpen
JSX-attr divergence across distinct overlay elements) + Signal B (handler-name divergence:
onOpenChange vs onClose/onDismiss), file-scoped, cross-element gate, **zero core changes**. ~690 lines.

## Closest Template — P11-S6 form-control-surface-drift

`packages/adapter-react/src/form-control-surface-drift.ts` + .test.ts. Reusable verbatim: `isJsxFact`/
`isJsxAttributeFact` tag-set guards (retarget to OVERLAY_TAGS), `computeExceeded`, `spanContains`
attr-to-element mapping, `sortedUnique`/`compareFacts`/`compareFindings`, `primarySpanFor` (lowest
span.start), `sha()` structural FP, `severityFor(count)` (`>1 ? warn : info`), `AdapterMetricEvidence`,
factory pattern, file-scoped loop, `explain` hook. Test builders `jsx(...)` / `jsxAttribute(...)`.

## Non-Overlap Boundary (the critical question — VERIFIED)

**vs P11-S1 (compound-component-api-drift):** operates on `member-assignment` facts + dotted JSX tags
(`<Modal.Trigger>`), grouping by root, finding missing member declarations. P11-S8 uses plain overlay
tags (`<Dialog>`) + their JSX attributes. **Zero overlap.**

**vs P11-S3 (controlled-uncontrolled-prop-surface-drift) — CRITICAL, CLEAN:** S3 reads
`ctx.graph.components` → `component.propNames` (props a component DECLARES). Emits when a component's
own propNames include both controlled+uncontrolled of a pair (incl. `open`/`defaultOpen`). This is the
DEFINITION site. P11-S8 reads `jsx-attribute` patternFacts — the USAGE site: overlay components USED
with `open` on some and `defaultOpen` on others across a consumer file. Complementary, not redundant:
S3 catches the component that DEFINES a dual API; S8 catches the file that USES overlays inconsistently.
S3 never sees call sites. **No overlap confirmed.**

**vs P11-S6 (form-control-surface-drift):** guards `tag === "form" || CONTROL_TAGS.has(tag)` where
`CONTROL_TAGS = {input, select, textarea}` — lowercase native HTML only. P11-S8 guards capitalized
`OVERLAY_TAGS`. Case-sensitive (`"Select"` ≠ `"select"`). **No collision.**

## jsx / jsx-attribute Fact Production for Capitalized Tags (pass1.ts 193-211, 333-340)

`const tag = jsxNameText(node.openingElement?.name) ?? ""`; `jsxNameText` returns `name.name` verbatim
for `JSXIdentifier`. No case filtering anywhere. `<Dialog open={isOpen} />` produces:
- `{ kind: "jsx", tag: "Dialog", ... }`
- `{ kind: "jsx-attribute", tag: "Dialog", name: "open", valueKind: "expression", value: "isOpen", ... }`

```typescript
PatternJsxFact          { kind: "jsx";           tag: string; parentTag: string }
PatternJsxAttributeFact { kind: "jsx-attribute"; tag: string; parentTag: string; name: string; value: string;
                          valueKind: "absent"|"literal"|"expression"|"spread"|"unknown" }
```

**Confirmed: capitalized tags produce facts. @rai/core changes: ZERO.**

## Recommended Scope — Signal A + Signal B (broader)

EMIT one file-scoped finding (subject `react:overlay-control-surface:${file}`) when, in one file, ≥2
distinct overlay JSX elements (OVERLAY_TAGS) are present AND at least one gate fires:

- **Gate A (open-state, cross-element)**: some overlay element has `open` (valueKind ≠ absent) AND a
  DIFFERENT overlay element has `defaultOpen`. Cross-element via spanContains (P11-S6 discipline) — a
  single overlay carrying both does NOT alone trigger Gate A.
- **Gate B (handler-name)**: ≥2 distinct overlay elements use different handler-name tokens from
  OVERLAY_HANDLER_NAMES.

SILENCE: <2 distinct overlay elements; uniform single open-state surface; uniform single handler;
no overlay tag; bare `open` (valueKind absent) still counts as controlled usage (P11-S6 precedent).

Severity: `divergenceCount > 1 ? warn : info`.

Constants (adapter-owned, observed-syntax, NOT semantic):
```typescript
OVERLAY_TAGS = {Dialog, Modal, Popover, Drawer, Sheet, Tooltip, AlertDialog, HoverCard,
                DropdownMenu, ContextMenu, Combobox, Select}
OPEN_STATE_PAIRS = [{ controlled: "open", uncontrolled: "defaultOpen" }]
OVERLAY_HANDLER_NAMES = {onOpenChange, onClose, onDismiss, onToggle}
```

### Scope comparison

Narrow (Signal A only, ~300-350 lines, low FP) vs Broader (A+B, ~380-430 lines, medium FP on handler
names). **Recommend broader** — Gate B is cheap (same loop/filter) and handler-name divergence
(`onOpenChange` vs `onClose`) is the prime symptom of mixed-library overlay usage (Radix→shadcn,
Headless UI→Ark). If Gate B worries review, gate it behind ≥2-distinct-elements (same discipline as A).

## Library-Name Boundary Ruling

Observing a tag named `"Dialog"` or attr `"onOpenChange"` is observed-syntax (token as written), same
class as P11-S7's `fetch`/`useQuery` ruling. RAI does NOT assert library identity, correct API for a
version, runtime behavior (modal/portal/focus-trap), intentionality, or a11y. Enforced via explain
`limits[]`.

## Out of Scope

Runtime overlay behavior (stacking/portal/focus-trap/ARIA), a11y/keyboard, runtime open state, intent/
root-cause/remediation, cross-file, import resolution, anything S1/S3/S6 already emit, new MCP tool, any
core change.

## Affected Areas

- `packages/adapter-react/src/overlay-control-surface-drift.ts` — new (~380)
- `packages/adapter-react/src/overlay-control-surface-drift.test.ts` — new (~300)
- `packages/adapter-react/src/core-adapter.ts` — +3
- `packages/adapter-react/src/index.ts` — +5
- `packages/core/**` — ZERO
- **Total ~690**, single PR within 800 budget.

## Core Changes Needed

**NO.** Fact types + pass1 production sufficient. Imports from `@rai/core` unchanged.

## Open Questions for Proposal

1. `Select` in OVERLAY_TAGS? (Radix `<Select>` has open/onOpenChange; form-like but distinct from native `<select>`). Recommend include as observed-syntax.
2. Gate A cross-element or single-element trigger? Recommend cross-element (P11-S6 parity).
3. Gate B threshold — file-level mix, or ≥2 distinct overlay elements each with a different handler? Recommend stricter (≥2 distinct elements).
4. `onToggle` in handler set? Recommend omit (rare, noisy).
5. `Combobox`/`HoverCard` include? Recommend yes (have open state).
6. `DropdownMenu`/`ContextMenu` include? Recommend yes (observed-syntax tag tokens).

## Risks

- `Select` may blur form/overlay boundary (Radix capitalized vs native lowercase — distinct token, but worth flagging).
- Handler-name set FP risk in codebases intentionally running two overlay libs; mitigated by ≥2-distinct-element gate + explain limits.
- spanContains cross-element gate needs non-overlapping spans; sibling overlays in a fragment work (siblings don't contain each other).

## Status

Ready for proposal. Non-overlap clean + verified. Recommended scope: Signal A + Signal B.
