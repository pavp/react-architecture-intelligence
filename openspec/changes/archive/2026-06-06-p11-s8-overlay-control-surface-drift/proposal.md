# Proposal: P11-S8 react/overlay-control-surface-drift

## Intent

Codebases migrating between overlay UI libraries (Radix → shadcn, Headless UI → Ark UI) accumulate
inconsistent JSX-attribute usage at overlay call sites: some overlay components receive `open={...}`
while others receive `defaultOpen`, and handler names mix `onOpenChange` with `onClose` or `onDismiss`
across the same file. No existing analyzer covers this JSX-usage-site divergence — P11-S3 inspects
component DEFINITION propNames, P11-S1 tracks dotted member expressions, and P11-S6 covers lowercase
native HTML tags only. P11-S8 closes this gap by detecting these two observable divergence patterns in
capitalized overlay-component JSX attributes, file-scoped, adapter-owned, from existing facts only.

## Non-Overlap Boundary

**vs P11-S1 (compound-component-api-drift):** S1 operates on `member-assignment` facts and dotted JSX
tags (`<Modal.Trigger>`), grouping by root to find missing member declarations. P11-S8 uses plain
capitalized overlay tags (`<Dialog>`) and their `jsx-attribute` facts. No shared fact kind or tag form.

**vs P11-S3 (controlled-uncontrolled-prop-surface-drift) — CRITICAL:**
- P11-S3 = component DEFINITION site: iterates `ctx.graph.components` → `component.propNames`, emits
  when a component DECLARES both `open` and `defaultOpen` as its own props.
- P11-S8 = JSX USAGE site: reads `jsx-attribute` patternFacts, emits when CONSUMER code uses `open`
  on one overlay element and `defaultOpen` on a DIFFERENT overlay element in the same file.

A file that renders `<Dialog open={x} />` beside `<Popover defaultOpen />` has usage-site divergence
that P11-S3 never sees (S3 only reads the Dialog/Popover component definitions). These are
complementary, not redundant. **No overlap confirmed — verified against source.**

**vs P11-S6 (form-control-surface-drift):** S6 guards `tag === "form" || CONTROL_TAGS.has(tag)` where
`CONTROL_TAGS = {input, select, textarea}` — lowercase native HTML only. P11-S8 guards capitalized
`OVERLAY_TAGS`. Tag matching is case-sensitive (`"Select" ≠ "select"`). **No collision confirmed.**

## Scope

### In Scope

- **Signal A — Open-State Surface Divergence:** file has ≥2 distinct overlay elements AND at least one
  has `open` (valueKind ≠ absent) while a DIFFERENT element has `defaultOpen`. Gate: cross-element via
  `spanContains` (P11-S6 discipline). A single overlay with both attributes alone does NOT trigger.
- **Signal B — Handler-Name Surface Divergence:** file has ≥2 distinct overlay elements using different
  handler-name tokens from `OVERLAY_HANDLER_NAMES`.
- **Subject:** `react:overlay-control-surface:${file}` (file-scoped)
- **Severity:** `divergenceCount > 1 ? "warn" : "info"`
- **Constants (adapter-owned, observed-syntax):**
  - `OVERLAY_TAGS = {Dialog, Modal, Popover, Drawer, Sheet, Tooltip, AlertDialog, HoverCard, DropdownMenu, ContextMenu, Combobox, Select}`
  - `OPEN_STATE_PAIRS = [{ controlled: "open", uncontrolled: "defaultOpen" }]`
  - `OVERLAY_HANDLER_NAMES = {onOpenChange, onClose, onDismiss}` — `onToggle` OMITTED (OQ4: rare, noisy)
- **Resolved Open Questions:**
  - OQ1: `Select` INCLUDED — Radix `<Select>` has `open`/`defaultOpen`/`onOpenChange`; token is capitalized, case-distinct from native `<select>`. Observed-syntax, no semantic assertion.
  - OQ2: Gate A is CROSS-ELEMENT (spanContains) — P11-S6 parity; single overlay with both does not trigger.
  - OQ3: Gate B requires ≥2 distinct overlay elements each using a different handler-name token — stricter gate, reduces file-level FP.
  - OQ4: `onToggle` OMITTED — not in Radix/shadcn standard, generates noise.
  - OQ5: `Combobox` + `HoverCard` INCLUDED — both carry `open`/`defaultOpen` semantics.
  - OQ6: `DropdownMenu` + `ContextMenu` INCLUDED — observed-syntax tag tokens with open state.
- **Library-name boundary enforced:** explain `limits[]` must state RAI observes literal attribute tokens
  only; does not assert library identity, runtime behavior, intent, or a11y. (Same class as P11-S7.)
- **New file:** `overlay-control-surface-drift.ts` + `.test.ts` in `packages/adapter-react/src/`
- **Registry:** `createOverlayControlSurfaceDriftAnalyzer()` registered in `core-adapter.ts`, exported from `index.ts`

### Out of Scope

- Runtime overlay behavior (stacking, portal, focus trap, ARIA roles)
- Accessibility, keyboard navigation, ARIA attribute analysis
- Runtime open/closed state inference
- Intent, root cause, or remediation
- Cross-file analysis
- Import/library resolution (which library a `<Dialog>` comes from)
- Anything already emitted by P11-S1, P11-S3, or P11-S6
- New MCP tool
- Any `@rai/core` changes

## Capabilities

### New Capabilities
- `overlay-control-surface-drift`: JSX-usage-site open-state and handler-name divergence across capitalized overlay component elements within a file.

### Modified Capabilities
None.

## Approach

Clone structural template from P11-S6 (`form-control-surface-drift.ts`). Replace tag guards with
`OVERLAY_TAGS`, replace attribute guards with `OPEN_STATE_PAIRS` and `OVERLAY_HANDLER_NAMES`, and
apply the `spanContains` cross-element gate for Signal A. Signal B uses the same file-scoped loop with
a distinct handler-name token accumulator. Both signals share one `computeExceeded` call pattern.
Pure synchronous function over `AnalysisContext`, no external I/O, deterministic per fact set.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/adapter-react/src/overlay-control-surface-drift.ts` | New (~380 lines) | Analyzer + factory |
| `packages/adapter-react/src/overlay-control-surface-drift.test.ts` | New (~300 lines) | Unit tests |
| `packages/adapter-react/src/core-adapter.ts` | +3 lines | Register factory |
| `packages/adapter-react/src/index.ts` | +5 lines | Public export |
| `packages/core/**` | None | Zero changes |

Total: ~690 lines. Within 800-line budget. Single PR.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `Select` blurs form/overlay boundary | Low | Tag is capitalized; case-sensitive guard; explain limits clarify |
| Handler-name FP in multi-lib codebases | Medium | ≥2-distinct-element Gate B; explain limits[] disclose |
| `OVERLAY_TAGS` staleness as new libs emerge | Low | Adapter-owned constant; extend without core changes |
| spanContains span non-overlap assumption | Low | Sibling overlays in fragments have non-overlapping spans |

## Rollback Plan

Delete `overlay-control-surface-drift.ts` and `.test.ts`. Remove the 3-line factory call from
`core-adapter.ts` and the export line from `index.ts`. No core files touched; revert is surgical.

## Dependencies

None beyond existing `@rai/core` fact types and P11-S6 structural patterns already in adapter-react.

## Acceptance Signals

- [ ] Analyzer emits ONLY from `jsx-attribute` patternFacts; does NOT read `ctx.graph.components` (S3 domain)
- [ ] Analyzer does NOT trigger on lowercase tags (must not overlap S6)
- [ ] Gate A requires CROSS-ELEMENT divergence (spanContains discipline confirmed)
- [ ] Gate B requires ≥2 distinct overlay elements with different handler tokens
- [ ] `onToggle` is absent from `OVERLAY_HANDLER_NAMES`
- [ ] explain `limits[]` explicitly disclaims library identity, runtime, a11y, intent
- [ ] Pure deterministic function; same fact set → same findings
- [ ] All tests pass under Strict TDD; no `@rai/core` files modified
