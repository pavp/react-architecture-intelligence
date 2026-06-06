# Exploration (Kill-Switch): P11-S10 — Broad API Conventions Surface Drift

Phase: explore (kill-switch) · Outcome: **DEFER** · Engram topic: `sdd/p11-s10-api-conventions-surface-drift/explore` (obs #658) · Decision: `sdd/p11-s10-api-conventions-surface-drift/decision` (obs #659)

## Kill-Switch Assessment: DEFER — P11 Complete at S9

This was a kill-switch exploration (run explore only; DEFER is an accepted success outcome). After
rigorous evaluation, **no candidate meets the S6-S9 groundability bar**. P11 is declared complete at S9.
No analyzer was built; no `packages/` changes.

## The Bar (S6-S9 Standard)

Every shipped analyzer satisfies ALL of:
1. Closed allow-set of syntactic tokens known a priori — no runtime enumeration
2. Pure observed syntax from patternFacts only (jsx/jsx-attribute/call/hook-call) — NO import resolution
3. Concrete divergence gate: cross-element/cross-usage comparison, not just presence
4. Deterministic
5. NO intent/semantic/correctness/runtime inference
6. Adapter-owned, ZERO core changes
7. Non-overlapping with shipped S1/S3/S5/S6/S7/S8/S9

## Candidates Evaluated

| Candidate | Groundable | Non-overlapping | Verdict |
|-----------|-----------|-----------------|---------|
| A. Prop-naming casing (camelCase vs kebab) | NO | YES | Needs "correct" casing; `data-*`/`aria-*` legitimately kebab; no closed set |
| B. Boolean-prop prefix (is*/has* vs bare) | NO | YES | `isOpen`↔`open` = semantic equivalence, not syntax |
| C. Event-handler naming (on* vs handle*) | NO | PARTIAL (S3) | "Same handler slot?" needs component contract |
| D. Component propNames convention | NO | NO (S3) | Exactly S3's domain |
| E. Call/import convention | NO | YES | No closed callee set without import resolution |
| F. Ref-handling (ref vs innerRef/forwardedRef) | BORDERLINE | YES | Technically groundable but sparse, speculative allow-set, near-zero actionability — weaker than any shipped analyzer |
| G. Context-consumer convention | NO | NO (S5) | No multi-instance divergence gate at consumption |
| H. Callback argument-kind convention | NO | YES | Meaningless without callee contract |

## Root Cause of Ungroundability

**API convention divergence requires a reference convention.** To say two usages diverge in convention,
you must know which convention each follows — which means knowing what is "correct" for that API. That
is semantic knowledge unavailable from syntax-only facts without import resolution. Every shipped S6-S9
analyzer worked because its domain has a CLOSED, STABLE vocabulary of syntactic tokens mapping
unambiguously to one concept (controlled/default pairs, OVERLAY_TAGS, fetch/query-hook callees,
variant-vs-raw-style props). "Broad API conventions" has no such closed vocabulary; the remaining
groundable surface is already partitioned across S1–S9; what's left is intent inference.

## Recommendation: DEFER — Declare P11 Complete at S9

Shipped family (coherent, well-grounded):
- S1 compound-component-api-drift · S2 container-presenter-role-drift · S3 controlled-uncontrolled-prop-surface-drift
- S4 framework-neutral pattern facts (core) · S5 context-provider-value-surface-drift
- S6 form-control-surface-drift · S7 data-fetching-surface-drift · S8 overlay-control-surface-drift
- S9 design-system-usage-surface-drift

Adding S10 with a weak/speculative signal would degrade signal quality and increase noise — the opposite
of RAI's purpose. Stopping at S9 is the correct engineering decision. Roadmap advances to P12 (CI/PR integration).

## Reusable Groundability Test (for any future RAI syntax analyzer)

Does the domain have a CLOSED, STABLE vocabulary of syntactic tokens mapping unambiguously to one
concept, observable WITHOUT import resolution or intent inference? If yes → groundable. If the signal
needs a "reference convention"/"what's correct" to detect divergence → NOT groundable on syntax-only
facts; defer rather than ship noise.

## Revisit Trigger

Only if a future React ecosystem pattern produces a stable closed vocabulary of syntactic "API
convention markers" (the way `useQuery`/`useSWR` are stable closed sets). The bar remains: closed
allow-set + pure observed divergence + zero intent inference. A future session must NOT re-attempt S10
without a genuinely new groundable signal.

## Core Changes / Affected Files

NONE — DEFER recommendation, no implementation. Files read for the boundary analysis: overlay-/design-system-/
form-control-/data-fetching-/controlled-uncontrolled-*-drift.ts, packages/core/src/types.ts.
