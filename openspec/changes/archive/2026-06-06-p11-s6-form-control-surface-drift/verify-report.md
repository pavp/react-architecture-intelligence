# Verify Report: P11-S6 react/form-control-surface-drift (RE-VERIFY)

**Verdict:** PASS WITH WARNINGS
**Status:** success
**Date:** 2026-06-06
**Phase:** sdd-verify — RE-VERIFY after FAIL→fix cycle (supersedes prior FAIL report id 627)

## Executive Summary

CRITICAL: 0 · WARNING: 2 · SUGGESTION: 1.

The prior CRITICAL (C1: single `<form onSubmit action>` fired, violating MUST-level spec OQ2)
is **CLOSED**. The fix rewrote the Family-1 gate to require >=2 distinct `<form>` elements with
cross-form submit-surface divergence, added 5 guard tests (2 of which were genuine RED against the
old impl), and synced spec.md / design.md (ADR-3 + E8) / tasks.md so all three artifacts now agree:
a lone dual-surface form stays SILENT; drift requires divergence BETWEEN distinct forms.

All gates green: 63 files / 443 tests (+5), typecheck Done, build Done, framework-free guard exit 0,
git diff --check clean, ZERO `packages/core` diff. The `hasCrossFormDivergence` predicate is correct
(no over-fire). `spanContains` grouping is sound against the real core fact model. Family-2 is
unchanged and still emits. Two residual WARNINGs (one coverage gap, one merge-target caveat) and one
SUGGESTION; none block archive.

## Verification Results (run by verifier, this session)

- `pnpm test`: PASS — 63 files / 443 tests green (was 438; +5 new guard tests).
- form-control-surface-drift.test.ts in isolation: 26/26 PASS.
- `pnpm typecheck`: PASS — all packages Done (dead-local cleanup confirmed compiled; note tsconfig has
  no noUnusedLocals/noUnusedParameters, so cleanup is cosmetic, not CI-enforced).
- `pnpm build`: PASS — all packages Done.
- `node scripts/check-core-framework-free.mjs`: PASS, exit 0.
- `git diff --check`: clean, exit 0.
- `git diff --stat packages/core`: ZERO changes (core stays framework-agnostic).
- Registration verified by source + passing test: core-adapter.ts array includes
  `createFormControlSurfaceDriftAnalyzer()` (5th entry); index.ts re-exports both symbols;
  core-adapter.test.ts stable-metadata test asserts the exact 5-analyzer ordered list (GREEN).

### Git working-tree state (not a defect — pre-PR state)
- Analyzer impl + test (`form-control-surface-drift.ts`, `.test.ts`) are UNTRACKED (`??`) — new files,
  not yet committed. They do not appear in `git diff` because diff only shows tracked changes.
- Registration files (`core-adapter.ts`, `core-adapter.test.ts`, `index.ts`) + docs are modified-unstaged.
- Nothing is on `main`; apply correctly did NOT commit. This is the expected state before the PR.

## C1 CLOSED — evidence (yes)

**Gate code (form-control-surface-drift.ts:297-324):**
```
const formElements = fileJsx.filter((f) => f.tag === FORM_TAG);
if (formElements.length >= 2) {
  // assign attrs to parent form by span containment
  for (const formEl of formElements)
    for (const a of fileAttrs) {
      if (a.tag !== FORM_TAG) continue;
      if (!spanContains(formEl.span, a.span)) continue;
      if (a.name === SUBMIT_HANDLER_ATTR && a.valueKind !== "absent") formsWithHandler.add(formEl.id);
      if (DECLARATIVE_SUBMIT_ATTRS.has(a.name))                       formsWithDeclarative.add(formEl.id);
    }
  const hasCrossFormDivergence =
    handlerForms.some(id => !formsWithDeclarative.has(id)) ||
    declarativeForms.some(id => !formsWithHandler.has(id));
  if (handlerForms.length>0 && declarativeForms.length>0 && hasCrossFormDivergence)
    tokens.push(`formSubmitSurfaceDrift:${file}`);
}
```
`formElements.length >= 2` short-circuits the entire single-form path. A lone form never reaches the gate.

**Test assertions (genuine ZERO, not no-throw):**
- "F1 OQ2: single `<form>` with BOTH onSubmit and action — SILENT" (test:127) → `expect(findings).toEqual([])`.
- "F1 OQ2 variant: single `<form>` with onSubmit + method — SILENT" (test:157) → `expect(findings).toEqual([])`.
- "F1 OQ2 two-distinct-forms ... FIRES" (test:185) → `expect(findings).toHaveLength(1)` AND
  `expect(evidence.topology.exceeded).toContain("formSubmitSurfaceDrift:src/two-forms.tsx")`.
- "F1 OQ3 bare form — SILENT" (test:220) → `toEqual([])`.
- "F1 React-19 single action={fn} — SILENT" (test:239) → `toEqual([])`.

`toEqual([])` is a real zero-findings assertion. apply-progress claims 2 RED-against-old-impl confirmed;
structurally sound (old file-level gate emitted on single form; new gate cannot).

## spec / code / design AGREE (yes)

- **spec.md:7,17-22** — requirement body now states submit divergence needs "a **different** `<form>`
  element"; OQ2 scenario "Single form carrying both onSubmit and action stays silent" → THEN no finding
  MUST be emitted. AUTHORITATIVE and matches impl.
- **design.md ADR-3 (line 436)** — AMENDED: ">=2 distinct `<form>` elements with diverging surfaces
  required; single dual-surface form stays silent." E8 (line 345) AMENDED: "Family 1 SILENT (single-form
  is not drift)." Family-1 pseudocode (line 158-160) AMENDED. The design NO LONGER says "single
  dual-surface element fires." Prior W2 (process drift: ADR overrode MUST spec without amendment) is
  RESOLVED — the design now records the locked decision and points to the fix pass.
- **impl** — gate requires `formElements.length >= 2` + cross-form divergence. Matches both.

Three-way agreement confirmed.

## hasCrossFormDivergence edge ruling: CORRECT (not over-fire)

Enumerated the full boolean truth table for the gate:

| Forms | Outcome | Correct? |
|---|---|---|
| A=onSubmit-only, B=action-only (canonical) | FIRES | yes |
| A=onSubmit+action, B=action-only (apply-flagged edge) | FIRES | **yes — genuine cross-form divergence** |
| A=onSubmit+action, B=onSubmit+action (uniform dual) | SILENT | yes |
| Two forms onSubmit-only (uniform) | SILENT | yes |
| Two forms action-only (uniform) | SILENT | yes |
| A=onSubmit+action, B=onSubmit-only | FIRES | yes |
| Two bare forms | SILENT | yes |
| Single dual-surface form (1 form) | SILENT (length<2) | yes |

**Ruling on the apply-flagged edge (A=onSubmit+action, B=action-only → FIRES):** CORRECT, not an
over-fire. The locked OQ2 exemption is about a *lone* element diverging from itself. Here there are TWO
distinct forms and they genuinely diverge: form A carries a submit handler that form B lacks while both
share a declarative surface. That author-level inconsistency between distinct elements is exactly the
drift the analyzer surfaces (info severity, "worth checking"). It does not contradict the single-form
principle. The conservative uniform-dual case (both forms identical) correctly stays SILENT.

## spanContains containment: CORRECT (yes)

Verified against the REAL core fact model, not test fixtures:
- `packages/core/src/parse/pass1.ts:195` — `jsx` fact span = `span(node.openingElement, ...)` =
  `[openingElement.start, openingElement.end]` (the OPENING tag only, e.g. `<form onSubmit={…} action="/x">`).
- `pass1.ts:203` — each `jsx-attribute` fact span = the `attribute` node, a child of
  `openingElement.attributes`, so `attribute.start >= openingElement.start` and
  `attribute.end <= openingElement.end`.
- `span()` helper (pass1.ts:121-127) uses raw `node.start`/`node.end`.

Therefore `spanContains(formJsx.span, attr.span)` holds for a form's own attributes. BONUS robustness:
because the jsx span is the opening element only (not the whole element including children), a NESTED
child form's opening element and attributes fall OUTSIDE the parent form's opening-element span — so
attributes are never mis-attributed to an ancestor form. Grouping is sound, including the nested-form case.

## Family-2 unchanged + still emits (yes)

computeExceeded Family-2 block (lines 327-343) is the unchanged per-(pair,tag) co-presence logic from the
prior PASS verdict. F2 positive tests assert `toHaveLength(1)` + `exceeded` contents (real emission):
value/defaultValue (test:261), checked/defaultChecked (test:294). Per-tag isolation, uniform-silence,
absent-counts, spread-ignored negatives all green. Per-tag isolation, uniform-silence,
absent-counts, spread-ignored negatives all green. Family-2 reconfirmed.

## Determinism / fingerprints / bounded explain (intact)

Locked by passing tests: determinism forward-vs-reversed (test:586), structural stability across span
shift with differing positional (test:619), frozen-facts-not-mutated (test:679), bounded explanation with
sorted groundingFields + glossary parity + forbidden-vocabulary regex (test:771-814). Evidence arrays are
`sortedUnique`/`.sort()`; findings `compareFindings`-sorted; fingerprint triple span/id-free for structural.
Submit-only explain summary says "across the file's form elements" (plural) — consistent with >=2 gate.

## WARNINGS

1. **Coverage gap — uniform-dual two-form case is correct but untested.** The conservative branch "two
   forms BOTH carrying onSubmit+action identically → SILENT" is verified correct by enumeration but has NO
   dedicated test. A future regression to file-level co-presence would still pass the existing suite. Add a
   test: two forms each with onSubmit+action → `toEqual([])`. (Also untested but verifier-confirmed: the
   apply-flagged A=onSubmit+action/B=action-only FIRES edge — worth a positive guard.)
2. **Spec merge-target caveat (carried from prior phases).** spec.md is a delta under `## ADDED Requirements`
   and `## MODIFIED Requirements`. At archive, the OQ2 scenario + the "different form element" wording must be
   merged into the canonical `openspec/specs/architecture-analysis.md` (and STATUS/ROADMAP already updated).
   Not a verify blocker; an archive responsibility.

## SUGGESTIONS

1. Consider a one-line comment near the `hasCrossFormDivergence` predicate noting the uniform-dual case is
   intentionally silent, to prevent a future "simplification" back to file-level co-presence. (FP3 already
   removed the dead locals/params and the `void spanContains` suppression — spanContains is now live.)

## TDD discipline

Credible. The 2 single-form guard tests were genuine RED against the prior file-level gate (the old gate
emitted on a single dual-surface form; the new gate's `length >= 2` guard makes them GREEN). All assertions
are behavioral (`toEqual([])`, `toHaveLength`, `exceeded` contents), not no-throw. The fix pass closed the
exact gap that let the original CRITICAL slip through (no RED test for the single-form scenario).

## Verdict

**PASS WITH WARNINGS.** C1 CLOSED. Spec/code/design agree. No CRITICAL. Two non-blocking WARNINGs and one
SUGGESTION.

## next_recommended

`sdd-archive` — with the spec→main-spec merge-target caveat (WARNING 2): fold the OQ2 scenario and the
"different form element" requirement wording into `openspec/specs/architecture-analysis.md` during archive.
