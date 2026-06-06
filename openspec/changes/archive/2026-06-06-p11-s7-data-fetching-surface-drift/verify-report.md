# Verify Report — P11-S7 react/data-fetching-surface-drift

**Date:** 2026-06-06
**Phase:** sdd-verify (fresh-context adversarial)
**Change:** p11-s7-data-fetching-surface-drift
**Verdict:** PASS WITH WARNINGS

## Executive Summary

0 CRITICAL, 2 WARNINGS, 2 SUGGESTIONS. Implementation is functionally correct,
deterministic, framework-isolated, and spec/code/design-aligned. The load-bearing
ADR-4 hook-call discriminator is correct and proven against `pass1.ts` source.
The contested `limits[]` rewording is genuinely bounded (negated disclaimer, not an
affirmative claim) — NOT a smuggled forbidden claim. Warnings are state-hygiene only
(stale tasks.md checkboxes) and a minor wording tightening suggestion.

## Verification Gate (run independently)

| Check | Result |
|-------|--------|
| `pnpm test` | 64 files / 465 tests — ALL PASS |
| new test file (`data-fetching-surface-drift.test.ts`) | 20/20 PASS (verbose run confirmed each named test) |
| `pnpm typecheck` | Done (all 4 packages) |
| `pnpm build` | Done (all packages) |
| `node scripts/check-core-framework-free.mjs` | exit 0 (clean) |
| `git diff --check` | clean (CHECK_CLEAN) |
| `git diff --stat packages/core` | EMPTY — ZERO core changes |
| core grep for data-fetching logic | 0 matches (FETCH_CALLEES / QUERY_HOOK_NAMES / rule id / fetchVsQueryHookDrift / useSWR / useApolloQuery) |

## Adversarial Review Rulings

### 1. ADR-4 hook-call discriminator — CORRECT (load-bearing)

**Evidence (packages/core/src/parse/pass1.ts):**
- `call-binding` is pushed ONLY when `declaration.id?.type === "Identifier"` (line ~163).
  A destructured `const { data } = useQuery()` has `id.type === "ObjectPattern"` → NO call-binding emitted.
- `hook-call` is pushed for ANY `CallExpression` whose callee is an Identifier matching
  `HOOK_NAME = /^use[A-Z0-9]/` (pass1.ts:13, ~line 189) — independent of binding form.
  So `const { data } = useQuery()` DOES emit a hook-call.

**Impl (`data-fetching-surface-drift.ts:63-68`):** `isQueryHookFact` keys exclusively off
`fact.kind === "hook-call" && QUERY_HOOK_NAMES.has(name)`. It never references `call-binding`.

**Test T2 (`*.test.ts:45-56`):** provides ONLY `hookCall("h1","useQuery",...)` (NO call-binding)
plus `callFact("c1","fetch",...)`, asserts `toHaveLength(1)` and `severityRaw === "info"`.
This is an EMISSION assertion, not no-throw. T2 passes. Primary real-world usage is detected.

→ **adr4_hookcall_correct = TRUE.**

### 2. limits[] rewording — BOUNDED (not a smuggled claim)

The apply agent replaced literal "waterfall"/"performance" with "sequential request chains".
The contested line (`data-fetching-surface-drift.ts:259`):

> "RAI does **not claim** these calls execute together, conflict, or produce sequential
> request chains; observed call names are compared in current source only."

**Ruling:** The entire phrase sits under a NEGATION frame ("RAI does not claim [...]").
"sequential request chains", "execute together", and "conflict" are all OBJECTS of the
disclaimer — RAI is denying it asserts them, not asserting them. This is exactly what a
bounded-language `limits[]` entry is supposed to do: enumerate what is NOT being claimed.
It mirrors the approved P11-S6 convention, whose `limits[]` likewise names forbidden
categories ("live execution behavior", "defects") under negation. Polarity is correct;
this is the opposite of an overreach like "these calls produce sequential request chains".

The T14 forbidden-vocab regex (`*.test.ts:229-231`) runs against the REAL serialized
explanation (`JSON.stringify(analyzer.explain?.(presented(finding)))`) and matches affirmative
claims: `waterfall`, `performance`, `runtime behavior`, `two (?:data-fetching )?libraries`,
`will conflict`, `must refactor|migrate`, `\bbug\b`, `\bwrong\b`, `you should`. It correctly
returns null on the negated disclaimer. The test is NOT passing by gaming — it passes because
the wording is genuinely a disclaimer, and the regex correctly targets affirmative phrasings.

→ **limits_rewording_ruling = BOUNDED. No change required.**

(SUGGESTION below offers an optional tighter phrasing.)

### 3. Silence correctness — CORRECT

| Case | Expected | Test | Asserts |
|------|----------|------|---------|
| fetch-only | silent | T3 | `toEqual([])` |
| query-hook-only | silent | T4 / "useMutation alone" | `toEqual([])` |
| fetch + useEffect + useState | silent | T5 | `toEqual([])` |
| axios.get + useQuery | silent | T6 | `toEqual([])` (axios.get not in FETCH_CALLEES; a `call`, never hook-call) |
| cross-file (fetch in a.tsx, useQuery in b.tsx) | silent | T10 | `toEqual([])` (per-file loop) |

Gate is `if (!hasFetch || !hasQueryHook) continue;` (impl:95), evaluated per-file inside the
`for (const file of files)` loop (impl:87). All silence cases assert empty-array emission.

→ **silence_correct = TRUE.**

### 4. Determinism + fingerprints — CORRECT

- structural FP = `sha(JSON{ruleId,file,divergenceTypes:[TOKEN],fetchCallees:sortedUnique,queryHooks:sortedUnique})`
  — span-free, id-free, clock/pid-free. T12 confirms span-shift keeps structural stable, positional differs.
- nominal = `sha(file)`; positional = `sha([file,start,end])`.
- span anchor = lowest `span.start` among contributing facts (impl `primarySpanFor`), order-independent
  (sort ascending, pick [0]); tie-break compareFacts. Verified order-independent.
- evidence: roles `uniqueRoles().sort(compareRoles)`; topology.exceeded `[...].sort()`; observed names `sortedUnique`.
- findings `.sort(compareFindings)`. T11 (forward vs reversed input) → identical.
- T13 confirms frozen facts are not mutated.

→ **determinism_ok = TRUE.**

### 5. Spec / code / design agreement — ALIGNED

All three agree on: single signal family (fetchVsQueryHookDrift), `hook-call` discriminator
(NOT call-binding), severity ALWAYS info, fixed FETCH_CALLEES (3) + QUERY_HOOK_NAMES (11),
zero @rai/core changes, no new MCP tool, subject `react:data-fetching-surface:${file}`,
one finding per qualifying file, type `opportunity`. No three-way drift (the class of bug
that caught P11-S6). Wiring: factory appended LAST in core-adapter.ts; core-adapter.test.ts
ordered list asserts DATA_FETCHING last; index.ts exports RULE_ID + factory.

→ **spec_code_design_agree = TRUE.**

## Findings

### CRITICAL
None.

### WARNINGS
- **W1 — tasks.md checkboxes are stale (state hygiene).**
  `openspec/changes/p11-s7-data-fetching-surface-drift/tasks.md` has 38 unchecked `- [ ]`
  and ZERO `- [x]`, yet the apply-progress artifact (Engram #637) claims "all 28 tasks done"
  and the code IS fully implemented + green. The implementation is complete; only the task
  tracker was never marked. Fix: mark the tasks complete (or let archive reconcile). Does not
  block — code state is verified, not the checkbox state.
- **W2 — apply-progress claim vs disk divergence.**
  Apply-progress says "git diff --stat packages/core: EMPTY" and "all commands pass" — both
  independently re-verified TRUE here. But the same artifact's "28 tasks done" was not reflected
  on disk (see W1). Treat apply-progress task-count claims as advisory until disk-confirmed.

### SUGGESTIONS
- **S1 — optional tighter limits[] L2 wording.** The negated disclaimer is bounded and acceptable
  as-is. If a maximally conservative phrasing is preferred, replace `data-fetching-surface-drift.ts:259`:
  CURRENT: "RAI does not claim these calls execute together, conflict, or produce sequential request chains; observed call names are compared in current source only."
  OPTIONAL: "RAI does not claim anything about execution order, interaction, or how these calls run; only that the call names co-appear in current source."
  This drops the specific "sequential request chains" runtime characterization entirely while keeping the same bounded meaning. NOT required for PASS.
- **S2 — explain `whyItMatters` uses "data-loading call surface".** Bounded and fine; noted only
  for consistency review across the P11 explain family.

## Archive Merge Target Caveat (MANDATORY for sdd-archive)

The canonical capability spec is **directory form**:
`openspec/specs/react-pattern-analyzers/spec.md` (confirmed on disk: directory with spec.md, 36.9K).
There is NO stray flat `openspec/specs/react-pattern-analyzers.md` (confirmed absent — good).

Archive MUST merge the delta INTO the existing directory-form `react-pattern-analyzers/spec.md`,
NOT create a new flat file (this exact mis-merge happened on P11-S6):
- The MODIFIED "Deferred React Pattern Families Stay Scoped by Slice" requirement REPLACES the
  existing one IN PLACE — it copies the prior P11-S1..S6 scenarios verbatim and ADDS the new
  "P11-S7 data-fetching slice excludes other deferred families" scenario.
- The 3 ADDED requirements (Detection / Evidence-and-Claim-Boundaries / Determinism-and-Scope)
  APPEND to the canonical spec.

## Next Recommended
`sdd-archive` (with the merge-target caveat above).
