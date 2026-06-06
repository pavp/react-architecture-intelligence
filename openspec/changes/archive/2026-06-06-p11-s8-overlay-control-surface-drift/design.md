# Design: P11-S8 react/overlay-control-surface-drift

Phase: design · Persistence: hybrid · Reads proposal obs #642. Structural template verified against
`form-control-surface-drift.ts` (P11-S6), `controlled-uncontrolled-prop-surface-drift.ts` (P11-S3),
`pass1.ts` (193-211), `types.ts` (60-73).

## Technical Approach

Clone the P11-S6 file-scoped JSX-attribute analyzer verbatim and retarget its semantic constants.
Pure synchronous `Analyzer` over `AnalysisContext`. Reads ONLY `ctx.graph.patternFacts` (`jsx` +
`jsx-attribute`). NEVER reads `ctx.graph.components` — that is P11-S3's definition-site domain and the
single line that would create overlap. One file-scoped finding per file with ≥1 gate firing. Zero
`@rai/core` changes; everything imports from `@rai/core` unchanged.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|----------|--------|-----------------------|-----------|
| Fact source | `jsx` + `jsx-attribute` patternFacts only | Read `ctx.graph.components` propNames | components = S3 usage; reading it duplicates S3 and breaks the non-overlap acceptance signal |
| Module shape | `overlay-control-surface-drift.ts` + factory `createOverlayControlSurfaceDriftAnalyzer()` + `OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID = "react/overlay-control-surface-drift"` | Inline into existing analyzer | P11-S6 naming parity; isolated rollback |
| Tag guard | case-sensitive `OVERLAY_TAGS.has(tag)` (capitalized) | regex `/^[A-Z]/` | Closed allow-set is observed-syntax, avoids native-tag collision with S6 (`"Select"≠"select"`) |
| Gate A | cross-element via `spanContains` | single-element open+defaultOpen | P11-S6 discipline; lone dual-surface element is not cross-element drift |
| Gate B | ≥2 distinct overlay elements contributing different handler tokens | file-level any-mix | stricter gate cuts multi-lib FP; proposal OQ3 |
| Severity | `divergenceCount > 1 ? "warn" : "info"` | fixed info | P11-S6 `severityFor` parity; count = gates fired (0,1,2) |
| Span anchor | lowest `span.start` among contributing facts, tie-break `compareFacts` | first jsx fact | P11-S6 `primarySpanFor` parity; keeps positional FP stable+meaningful |
| `onToggle` | OMITTED from handler set | include | proposal OQ4 — rare, noisy |

## Constants (module-level, frozen)

```typescript
const OVERLAY_TAGS = new Set(["Dialog","Modal","Popover","Drawer","Sheet","Tooltip",
  "AlertDialog","HoverCard","DropdownMenu","ContextMenu","Combobox","Select"]);
const OPEN_STATE = { controlled: "open", uncontrolled: "defaultOpen" } as const;
const OVERLAY_HANDLER_NAMES = new Set(["onOpenChange","onClose","onDismiss"]); // onToggle OMITTED
```

## Fact Reads (non-overlap enforced)

- `isJsxFact`: `fact.kind === "jsx" && OVERLAY_TAGS.has(tag)`.
- `isJsxAttributeFact`: `fact.kind === "jsx-attribute" && OVERLAY_TAGS.has(tag) && (name===open || name===defaultOpen || OVERLAY_HANDLER_NAMES.has(name))`.
- Per-file bucketing identical to P11-S6: sort facts by `compareFacts`, partition, `sortedUnique` files, loop.
- Attr→element ownership via `spanContains(elementSpan, attrSpan)` — which overlay element owns which attribute.
- `ctx.graph.components` is NOT imported, NOT iterated, NOT referenced anywhere. (Enforcement signal.)

## Divergence Computation (computeExceeded → string[] tokens)

```
overlayEls = fileJsx (already tag-filtered)
if overlayEls.length < 2: return []        // <2 distinct overlay elements → no cross-element drift

// Gate A — open-state cross-element
elsWithOpen = {}; elsWithDefaultOpen = {}
for el in overlayEls, for a in fileAttrs where spanContains(el.span, a.span):
  if a.name===open       && a.valueKind !== "absent" → elsWithOpen.add(el.id)
  if a.name===defaultOpen                            → elsWithDefaultOpen.add(el.id)
// distinct elements: open on one, defaultOpen on a DIFFERENT one
crossA = exists o in elsWithOpen, d in elsWithDefaultOpen with o !== d
if crossA: tokens.push(`openStateSurfaceDrift:${file}`)

// Gate B — handler-name cross-element
handlersByEl: Map<elId, Set<token>>
for el in overlayEls, for a in fileAttrs where spanContains(el.span, a.span):
  if OVERLAY_HANDLER_NAMES.has(a.name) && a.valueKind !== "absent": handlersByEl[el.id].add(a.name)
distinctEls = els with ≥1 handler token
allTokens = union of handler tokens across those els
crossB = distinctEls.size >= 2 && allTokens.size >= 2
       && exists two distinct els contributing different tokens
if crossB: tokens.push(`handlerNameSurfaceDrift:${file}`)

return sortedUnique(tokens)        // divergenceCount = tokens.length ∈ {0,1,2}
```

Evidence/structural-FP collectors (sorted, unique): `observedOverlayTags` = sorted unique tags of
contributing elements; `divergentAttrNames` = sorted unique of open/defaultOpen + handler tokens that
fired. Both feed evidence AND the structural fingerprint.

## Subject + Finding Shape

- Subject id: `react:overlay-control-surface:${file}`; `name=file`, `file`, `span=primarySpan`,
  `fingerprint=structuralFp`.
- `divergenceTypes` = token prefixes (`openStateSurfaceDrift`,`handlerNameSurfaceDrift`), sorted unique.
- Fingerprint triple (EXACT strings → SHA):
  - **structural** = `sha(JSON.stringify({ ruleId, file, divergenceTypes, observedOverlayTags, divergentAttrNames }))` — span/id free; stable across pure span shift.
  - **nominal** = `sha(file)`.
  - **positional** = `sha([file, primarySpan.start, primarySpan.end].join("|"))`.
- `primarySpan`: gather contributing jsx+attr facts, sort by `compareFacts`, then by `span.start`, take lowest. (P11-S6 `primarySpanFor`.)
- `findingId` = `sha([ctx.runId, RULE_ID, file, structuralFp].join("|"))`.
- `type:"opportunity"`, `severityRaw=severityFor(divergenceCount)`, `createdAt:0`, `fpAlgoVersion:1`.
- Evidence `kind:"adapter-metric"`, `adapterId:"react"`, roles (overlay-element / open-state-binding /
  handler-binding, `uniqueRoles().sort(compareRoles)`), `topology.exceeded=[...tokens].sort()`,
  `directChildIds`=contributing jsx ids, `reachableNodeIds`=contributing attr ids (both `sortedUnique`).
  All arrays frozen via sort+unique; facts never mutated.

## Explain Hook (adapter-owned text + limits[] guardrail)

Mirror P11-S6/S7. `limits[]` negates each forbidden category. CRITICAL (P11-S7 lesson): the test's
forbidden-vocab regex is SUBSTRING-based — do NOT smuggle a banned literal even inside a disclaimer.
Phrase as scope statements, avoid the literal tokens the regex catches.

```
limits: [
 "This is a syntax-surface observation only; it does not establish how these overlay components behave when the app runs, whether any modal opens, or any portal or focus-trap effect.",
 "RAI makes no claim about accessibility, ARIA semantics, or keyboard interaction for these elements.",
 "RAI does not identify which UI library these tag names or handler names belong to, nor whether the API is correct for any version.",
 "RAI does not assert these surfaces interact, override one another, or indicate a defect; observed names are compared in current source only.",
 "RAI makes no claim about intent, root cause, or remediation; analysis is file-scoped and no code change is required or implied.",
]
```

Avoid literal substrings any regex may catch: `bug`, `wrong`, `must refactor/migrate`, `runtime behavior`,
`conflict`, `will conflict`, `two libraries`, `React warning`, `root cause` (as a positive claim),
`you should`. Note: write "interact"/"override" not "conflict"; "behave when the app runs" not "runtime
behavior"; "modal opens" not a state assertion. `groundingFields=Object.keys(evidence).sort()`,
`glossary=groundingFields.map(explainTerm)`.

## Edge Cases & Failure Modes

| Case | Behavior | Reason |
|------|----------|--------|
| Single overlay w/ both `open`+`defaultOpen` | SILENT (Gate A needs cross-element) | distinct-element requirement |
| Overlay tag, no relevant attrs | SILENT | no tokens |
| Spread attr (`valueKind:"spread"`, name≠open/defaultOpen/handler) | ignored | name filter excludes |
| Duplicate identical attrs on one el | counted once per element-set | Set dedup |
| lowercase native tag (`select`,`dialog`) | NOT matched | case-sensitive; S6 domain |
| dotted member tag `<Modal.Trigger>` | tag has `.` → not in OVERLAY_TAGS → ignored | S1 domain |
| bare `open` (`valueKind:"absent"`) | still controlled usage for Gate A | P11-S6 precedent (presence of name) |
| ≥2 els, both gates fire | divergenceCount=2 → `warn` | severity escalation |
| uniform: all els only `open` | SILENT | no defaultOpen on a distinct el |
| uniform: all els only `onOpenChange` | SILENT | Gate B needs ≥2 distinct tokens |
| cross-file: open in A.tsx, defaultOpen in B.tsx | SILENT | per-file loop, no cross-file |
| **component DECLARES open/defaultOpen in propNames but <2 overlay JSX usages** | **SILENT** | analyzer never reads `ctx.graph.components` — S3's domain, the non-overlap proof |
| ordering: forward vs reversed facts | identical findings | sort-first determinism |
| frozen facts | unmutated | read-only |

## Testing Strategy (Strict TDD — tests with/before impl)

Reuse P11-S6 `runFacts()` harness + `jsx()` / `jsxAttribute()` builders verbatim (graph.components=[]).

| Test | Expect |
|------|--------|
| Gate A: `<Dialog open>` + distinct `<Popover defaultOpen>` | EMIT info, exceeded ∋ `openStateSurfaceDrift:` |
| Gate B: `<Dialog onOpenChange>` + `<Drawer onClose>` | EMIT info, exceeded ∋ `handlerNameSurfaceDrift:` |
| Both gates one file | EMIT `warn`, exceeded.length=2 |
| Single `<Dialog open defaultOpen>` | SILENT |
| Uniform `open` only (2 els) | SILENT |
| Uniform `onOpenChange` only (2 els) | SILENT |
| <2 overlay elements | SILENT |
| lowercase `<select>`/`<dialog>` | SILENT |
| dotted `<Modal.Trigger>` | SILENT |
| **components propNames open+defaultOpen, no JSX** | SILENT (non-overlap w/ S3) |
| determinism (forward vs reversed) | identical |
| structural FP stable across span shift; positional differs | assert |
| frozen facts unmutated | assert |
| bare `open` absent valueKind + distinct defaultOpen | EMIT (controlled usage) |
| explain forbidden-vocab `not.toMatch(/\bbug\b\|\bwrong\b\|must (?:refactor\|migrate)\|will conflict\|runtime behavior\|two libraries\|React warning\|you should\|root cause/i)` | pass |
| explain null for non-matching ruleId | null |

## File Changes

| File | Action | Lines |
|------|--------|-------|
| `packages/adapter-react/src/overlay-control-surface-drift.ts` | Create | ~380 |
| `packages/adapter-react/src/overlay-control-surface-drift.test.ts` | Create | ~300 |
| `packages/adapter-react/src/core-adapter.ts` | Modify | +2 (import + `createOverlayControlSurfaceDriftAnalyzer()` in array) |
| `packages/adapter-react/src/index.ts` | Modify | +4 (export RULE_ID + factory) |
| `packages/core/**` | None | 0 |

## Migration / Rollout

No migration. Registry composition: add `createOverlayControlSurfaceDriftAnalyzer()` to the array in
`createReactCoreAnalyzers()` (core-adapter.ts) and export from index.ts. Rollback = delete 2 files +
remove the 2 registry lines + 4 export lines. **Confirmed: zero @rai/core changes.**

## Open Questions

None. Proposal OQ1-OQ6 resolved (Select in, Gate A cross-element, Gate B ≥2-distinct, onToggle out,
Combobox+HoverCard in, DropdownMenu+ContextMenu in).
