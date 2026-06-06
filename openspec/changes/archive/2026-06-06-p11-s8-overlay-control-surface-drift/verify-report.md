# Verify Report: P11-S8 react/overlay-control-surface-drift

Phase: verify · Persistence: hybrid · Fresh-context adversarial review.
Verdict: **PASS** (0 CRITICAL, 0 WARNING, 2 SUGGESTION).

## Executive Summary

All spec #643 requirements and design #644 decisions are implemented and proven.
The central acceptance criterion — NON-OVERLAP with P11-S3 — is enforced in code
(analyzer reads only `ctx.graph.patternFacts`, never `ctx.graph.components`/`propNames`)
AND proven by a non-hollow test that populates `graph.components` with tempting
`open`+`defaultOpen` propNames yet asserts silence. Full gate green: 65 files / 490
tests, typecheck/build clean, zero `@rai/core` changes, framework-free guard passes.

## Verification gate (run by verifier, exact output)

| Check | Result |
|-------|--------|
| `pnpm test` | 65 files / 490 tests passed (was 64/465; +25 from this file) |
| overlay test file only | PASS (25) FAIL (0) |
| `pnpm typecheck` | all 4 packages Done, no errors |
| `pnpm build` | all packages Done |
| `node scripts/check-core-framework-free.mjs` | clean (guard pass) |
| `git diff --check` | clean (no whitespace errors) |
| `git diff --stat packages/core` | EMPTY (zero core changes) |
| `git status --short packages/core` | empty (no modified tracked core files) |
| grep impl for `components` | only comments + English word in explain text — NO `ctx.graph.components` read |
| grep impl for `graph.components`/`.propNames` | only comments — NO executable read |

## Adversarial findings (all rulings)

### 1. NON-OVERLAP with P11-S3 — ENFORCED AND PROVEN
- Code: `analyzeOverlayControlSurfaceDrift` reads `[...ctx.graph.patternFacts]`
  (line 71) only. `isJsxFact`/`isJsxAttributeFact` filter on `kind` + `OVERLAY_TAGS.has(tag)`.
  No reference to `ctx.graph.components` or `.propNames` anywhere in executable code
  (5 grep matches are all comments or the human word "components" in explain prose).
- Test (overlay-control-surface-drift.test.ts:162-179): the `runFacts` harness passes
  `components: [{ name:"MyComponent", propNames:["open","defaultOpen"], file:"src/comp.tsx" }]`
  into `graph.components` (harness line 424) together with only ONE overlay JSX usage,
  and asserts `toEqual([])`. A second test (181-189) repeats with zero JSX usages.
  These are non-hollow — they actually populate the tempting definition-site metadata
  and prove the analyzer ignores it.

### 2. Gate A cross-element — CORRECT
- `crossA = [...elsWithOpen].some(id => [...elsWithDefaultOpen].some(did => did !== id))`
  (lines 258-261). Single element carrying both open+defaultOpen -> same id in both sets
  -> `did !== id` false -> SILENT. Two distinct elements -> fires.
- Tests: single-element-both SILENT (73-81, `toEqual([])`); distinct open + distinct
  defaultOpen EMIT (19-53). `open` counts regardless of `valueKind` (P11-S6 precedent);
  bare-open-absent + distinct defaultOpen EMIT proven (55-69).

### 3. Gate B handler-name — CORRECT
- Fires only when `distinctEls.length >= 2 && allTokens.size >= 2 && uniqueTokenSets.size >= 2`
  (lines 294-300). Handlers with `valueKind === "absent"` are skipped (line 273).
- Two elements both using `onOpenChange` (uniform) -> `allTokens.size === 1` -> SILENT
  (test 126-135). `onOpenChange` vs `onClose` -> fires (test 96-109). Two elements with
  IDENTICAL handler pairs -> `uniqueTokenSets.size === 1` -> SILENT (correct conservative
  behavior; no per-element divergence).

### 4. limits[] wording — BOUNDED (not gamed)
- Ruling: the explain text is genuinely bounded. `whyItMatters` confines itself to
  source-level uniformity / reviewability ("harder to review consistently"); makes no
  runtime, defect, intent, or library-identity claim. The five `limits[]` are honest
  negated disclaimers. The substring substitutions ("underlying cause" not "root cause",
  "interact/override" not "conflict", "behave when the app is running" not "runtime
  behavior") are legitimate scope-limiting rephrasings — they avoid the SUBSTRING regex
  WITHOUT smuggling an overreaching claim. The forbidden-vocab test (test 366-392) runs
  the regex against the REAL serialized explanation and passes.

### 5. Silence correctness — CORRECT
- Lowercase native `<dialog>`/`<select>` SILENT (case-sensitive `OVERLAY_TAGS.has`,
  tests 193-213). Dotted `<Modal.Trigger>` SILENT (tag has ".", not in set, test 217-226).
  `<2` overlay elements SILENT (230-241). Uniform open-only SILENT (83-92). Uniform single
  handler SILENT (126-135). Cross-file isolation SILENT (254-263). All assert emission
  COUNT (`toEqual([])`), not no-throw.

### 6. Determinism + fingerprints — CORRECT
- Forward vs reversed facts identical (sort-first, test 305-318). Structural FP stable
  across pure span shift, positional differs (322-345). Frozen facts unmutated (349-362).
  Structural FP = `sha({ruleId,file,divergenceTypes,observedOverlayTags,divergentAttrNames})`
  (span/id-free). Severity `divergenceCount > 1 ? warn : info` (line 510); both-gates -> warn,
  exceeded.length===2 (test 139-158). Evidence arrays sorted+unique.

### 7. spec / code / design agreement — NO DRIFT
- Disk spec.md, Engram spec #643, design #644, and code all agree on: jsx-usage-site only
  (no components read), two gates, Gate A cross-element via spanContains, handler set
  {onOpenChange,onClose,onDismiss} with onToggle excluded, case-sensitive OVERLAY_TAGS,
  file-scoped, severity by gate count, zero core changes, additive wiring (factory + ruleId
  appended LAST). This is the failure class that hit P11-S6; here all four sources align.

## SUGGESTIONS (non-blocking)

- S1 — overlay-control-surface-drift.ts:302-309: dead `else` branch in Gate B contains only
  comments (the `uniqueTokenSets.size >= 2` guard already covers it). Remove for clarity.
- S2 — tasks.md checkboxes on disk remain `[ ]` (unchecked) although Engram apply-progress
  #646 reports all tasks complete. Cosmetic; Engram apply-progress is canonical in hybrid.
  Consider marking tasks.md `[x]` for on-disk trail parity.

## Archive merge-target caveat (MANDATORY — read at archive)

The spec is a DELTA (4 ADDED + 1 MODIFIED). At ARCHIVE it MUST merge into the EXISTING
canonical `openspec/specs/react-pattern-analyzers/spec.md` (**DIRECTORY form**, verified on
disk at 45K) — NOT a new flat `react-pattern-analyzers.md` file (no such flat file exists;
this mis-merge happened on P11-S6, was corrected on P11-S7). The MODIFIED "Deferred React
Pattern Families Stay Scoped by Slice" requirement REPLACES in place, preserving ALL prior
P11-S1..S7 scenarios verbatim and ADDING the P11-S8 overlay-slice scenario. The 4 ADDED
requirements append.

## Next recommended

`sdd-archive` (with the merge-target caveat above).
