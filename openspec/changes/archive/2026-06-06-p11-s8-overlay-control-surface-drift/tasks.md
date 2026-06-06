# Tasks: P11-S8 react/overlay-control-surface-drift

Strict TDD ACTIVE — RED before GREEN. Test runner: `pnpm test` (vitest).
Reads ONLY jsx/jsx-attribute facts; NEVER `ctx.graph.components` (the non-overlap acceptance criterion).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~690 (impl ~380, test ~300, registry +2, exports +4, docs ~6) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (within project 800-line budget; logically atomic) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Note: ~690 exceeds the 400 DEFAULT review budget but fits the project's 800-line budget. The change is one indivisible analyzer (test + impl + wiring must land together to keep the suite green). Splitting would create a RED intermediate state. Proceed as single PR under `size:exception` (P11-S6/S7 precedent).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Analyzer + tests + wiring + explain + docs | PR 1 | Single atomic PR; tests, impl, registry, docs together |

## Phase 1: RED — Author failing tests

- [x] 1.1 Create `packages/adapter-react/src/overlay-control-surface-drift.test.ts`; reuse P11-S6 `runFacts()` harness + `jsx()`/`jsxAttribute()` builders verbatim (`graph.components=[]`).
- [x] 1.2 Gate A test: `<Dialog open>` + distinct `<Popover defaultOpen>` → EMIT info, exceeded ∋ `openStateSurfaceDrift:`.
- [x] 1.3 Gate B test: `<Dialog onOpenChange>` + `<Drawer onClose>` → EMIT info, exceeded ∋ `handlerNameSurfaceDrift:`.
- [x] 1.4 Both gates one file → EMIT `warn`, `exceeded.length===2`.
- [x] 1.5 Single `<Dialog open defaultOpen>` → SILENT (cross-element required).
- [x] 1.6 NON-OVERLAP test (CRITICAL): `graph.components` declares open+defaultOpen propNames but <2 overlay JSX usages → NO finding (proves analyzer never reads `ctx.graph.components`).
- [x] 1.7 Domain-boundary SILENT tests: lowercase `<select>`/`<dialog>` (P11-S6); dotted `<Modal.Trigger>` (P11-S1); <2 overlay elements; uniform `open`-only; uniform `onOpenChange`-only; cross-file open/defaultOpen.
- [x] 1.8 Edge: bare `open` (valueKind absent) + distinct `defaultOpen` → EMIT (controlled usage).
- [x] 1.9 Determinism (forward vs reversed facts → identical); structural FP stable across span shift + positional differs; frozen facts unmutated.
- [x] 1.10 explain forbidden-vocab `not.toMatch(/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|runtime behavior|two libraries|React warning|you should|root cause/i)`; explain returns null for non-matching ruleId.
- [x] 1.11 Run `pnpm test` → CONFIRM RED (suite fails: module not found).

## Phase 2: GREEN — Implement analyzer

- [x] 2.1 Create `packages/adapter-react/src/overlay-control-surface-drift.ts`: factory `createOverlayControlSurfaceDriftAnalyzer()` + `OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID="react/overlay-control-surface-drift"`. Clone P11-S6 structure.
- [x] 2.2 Frozen constants: `OVERLAY_TAGS` {Dialog,Modal,Popover,Drawer,Sheet,Tooltip,AlertDialog,HoverCard,DropdownMenu,ContextMenu,Combobox,Select}; `OPEN_STATE={controlled:"open",uncontrolled:"defaultOpen"}`; `OVERLAY_HANDLER_NAMES` {onOpenChange,onClose,onDismiss} (onToggle OMITTED).
- [x] 2.3 Fact reads: `isJsxFact` (kind jsx + tag in set); `isJsxAttributeFact` (kind jsx-attribute + tag in set + name is open/defaultOpen/handler). Per-file bucketing via `compareFacts` sort + `sortedUnique`. NO import/reference of `ctx.graph.components`.
- [x] 2.4 `computeExceeded`: if <2 overlay els → []. Gate A (cross-element open vs defaultOpen via `spanContains`). Gate B (≥2 distinct els, ≥2 distinct handler tokens). Return `sortedUnique(tokens)`; `divergenceCount=tokens.length`.
- [x] 2.5 Subject `react:overlay-control-surface:${file}`; severity `divergenceCount>1?"warn":"info"`; `primarySpan`=lowest span.start (tie-break compareFacts).
- [x] 2.6 Fingerprint triple: structural=`sha(JSON.stringify({ruleId,file,divergenceTypes,observedOverlayTags,divergentAttrNames}))`; nominal=`sha(file)`; positional=`sha([file,primarySpan.start,primarySpan.end].join("|"))`.
- [x] 2.7 Frozen sorted evidence (kind adapter-metric, adapterId react, roles, exceeded, directChildIds=jsx ids, reachableNodeIds=attr ids); facts never mutated.
- [x] 2.8 explain hook: `limits[]` as NEGATED disclaimers per design; avoid forbidden substrings (use "behave when the app runs" not "runtime behavior"; "interact/override" not "conflict"). Return null for other ruleIds.
- [x] 2.9 Run `pnpm test` → CONFIRM GREEN.

## Phase 3: Wiring (registry + exports)

- [x] 3.1 `core-adapter.ts`: import factory + add `createOverlayControlSurfaceDriftAnalyzer()` LAST in `createReactCoreAnalyzers()` array (+2 lines).
- [x] 3.2 `index.ts`: export `OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID` + factory (+4 lines).
- [x] 3.3 `core-adapter.test.ts`: append new ruleId LAST in the ordered registry assertion (after `DATA_FETCHING_SURFACE_DRIFT_RULE_ID`; P11-S6/S7 append-last precedent avoids breaking ordering).
- [x] 3.4 Run `pnpm test` → registry/order tests GREEN.

## Phase 4: Verify gate (record exact counts)

- [x] 4.1 `pnpm test` (record new totals) · `pnpm test:launcher` · `pnpm typecheck` · `pnpm build`.
- [x] 4.2 `node scripts/check-core-framework-free.mjs` (or `pnpm lint`) · `git diff --check`.
- [x] 4.3 `git diff --stat packages/core` MUST be ZERO (confirm no @rai/core changes).

## Phase 5: Docs + spec-sync note

- [x] 5.1 Update `docs/STATUS.md` + `docs/ROADMAP.md` P11 section recording P11-S8 (mirror P11-S7 wording; set Next phase = P11-S9: deferred families = design-system usage, API conventions).

### ARCHIVE SPEC-SYNC NOTE (read at archive time)
The spec is a DELTA (4 ADDED + 1 MODIFIED). At ARCHIVE, the delta MUST merge into the EXISTING canonical `openspec/specs/react-pattern-analyzers/spec.md` (DIRECTORY form, already verified on disk) — NOT a new flat file. (This mis-merge happened on P11-S6; corrected on P11-S7.) The MODIFIED "Deferred React Pattern Families" requirement REPLACES in place, preserving ALL prior P11-S1..S7 scenarios verbatim and ADDING the P11-S8 overlay-slice scenario.
