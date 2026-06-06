# Exploration: react/form-control-surface-drift (P11-S6)

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p11-s6-form-control-surface-drift/explore`

## Executive Summary

P11-S6 `react/form-control-surface-drift` is fully groundable from existing P11-S4 facts
(`jsx`, `jsx-attribute`) with **zero `@rai/core` changes**. Recommend a broader two-signal
file-scoped analyzer covering form submit-surface divergence and native form-control
controlled/uncontrolled mixed surfaces. Estimated ~590-670 changed lines — within the 800-line
single-PR review budget.

## Current State

`packages/adapter-react` owns four pattern analyzers, all registered via `createReactCoreAnalyzers()`
in `core-adapter.ts`. Closest template: `context-provider-value-surface-drift.ts` (P11-S5), which
consumes `call-binding`, `call-argument`, `jsx`, and `jsx-attribute` facts exclusively — the same
fact types needed here. No existing adapter analyzer touches native HTML form elements.

## Confirmed Fact Shapes (`packages/core/src/types.ts`, `packages/core/src/parse/pass1.ts`)

All four required fact types exist and are produced by the existing P11-S4 pass:

```ts
PatternJsxFact          { kind: "jsx";            tag: string; parentTag: string; }
PatternJsxAttributeFact { kind: "jsx-attribute";  tag: string; parentTag: string;
                          name: string; value: string;
                          valueKind: "absent"|"literal"|"expression"|"spread"|"unknown"; }
PatternCallBindingFact  { kind: "call-binding";   local: string; callee: string; declarationKind: ... }
PatternCallArgumentFact { kind: "call-argument";  callee: string; argumentIndex: number;
                          argument: string; argumentKind: ... }
```

Confirmed constraint: `jsx` fact span covers the **opening element only**. Attribute facts are
spatial children of the opening element span (`spanContains` works). `parentTag` is the immediate
lexical JSX parent tag, NOT the component boundary.

## Affected Areas

- `packages/adapter-react/src/form-control-surface-drift.ts` — new analyzer (impl)
- `packages/adapter-react/src/form-control-surface-drift.test.ts` — new tests
- `packages/adapter-react/src/core-adapter.ts` — register `createFormControlSurfaceDriftAnalyzer()` (+~4 lines)
- `packages/adapter-react/src/index.ts` — export rule id + factory (+~5 lines)
- `packages/core/**` — **no changes**

## Approaches

| Approach | Scope | Pros | Cons | Effort |
|---|---|---|---|---|
| A: Narrow `react/form-submit-surface-drift` | Only `<form>` submit surface (`onSubmit` vs `action`/`method`) | Tight, easy to verify, lowest FP risk | Misses controlled/uncontrolled input drift; low signal density | ~280 lines |
| **B: Broader `react/form-control-surface-drift` (recommended)** | `<form>` submit surface + native controls (`input`/`select`/`textarea`) controlled vs uncontrolled | Full observable coverage, grounded entirely in existing facts, mirrors P11-S5 | Two signal families, ~12-15 test cases | ~590-670 lines |

## Recommendation: Option B — `react/form-control-surface-drift`

File-scoped (one finding per drifting file), two signal families:

1. **`formSubmitSurfaceDrift`**: file has `<form onSubmit=...>` AND (`<form action=...>` or `<form method=...>`).
2. **`*ControlSurfaceDrift`** (`value/defaultValue`, `checked/defaultChecked` per element type): same file
   has native form controls using both controlled (`value`/`checked`) and uncontrolled
   (`defaultValue`/`defaultChecked`) attribute names for the same element type.

Silence: no native form elements; uniform single surface; no mixed surface within any element type.

Subject anchor: `{ id: "react:form-control-surface:${file}", name: file, file }` (file-level — avoids
binding-level `call-binding` lookup; no `useForm`/library binding needed).

Severity: `divergenceCount > 1 ? "warn" : "info"` (matches P11-S5).

Reuse from P11-S5: `sha()`, `sortedUnique()`, `spanContains()`, `AdapterMetricEvidence` shape,
`topology.exceeded` gate, fingerprint triple (structural/nominal/positional), `explainTerm`, explain
hook, test `runFacts()` harness.

## Out of Scope

- `e.preventDefault()` in onSubmit body (needs control-flow; not in facts)
- `useRef` for uncontrolled fields (hookCalls not linked to JSX)
- Cross-file form composition
- React Hook Form / Formik / library detection (import→JSX linking absent)
- Form validation surface
- Missing `onChange` on controlled inputs (different pattern, not surface divergence)
- Capitalized `<Form>`/`<Input>` library components (library-defined semantics)
- TypeScript type inference

## Core Changes Needed

**NO.** `jsx` (`tag`, `parentTag`) + `jsx-attribute` (`name`, `valueKind`) cover every signal. All
filtering (`tag === "form"`, `name === "onSubmit"`, etc.) is pure adapter logic. No new fact types,
no new core passes.

## Estimated Changed Lines

| File | Est. |
|---|---|
| `form-control-surface-drift.ts` | ~380-420 |
| `form-control-surface-drift.test.ts` | ~200-240 |
| `core-adapter.ts` | ~4 |
| `index.ts` | ~5 |
| **Total** | **~590-670** — within 800-line single-PR budget, no chain needed |

## Open Questions for Proposal

1. File-level vs component-level grouping (simplicity vs granularity).
2. `<form>` with both `onSubmit` AND `action` on the same element — single-element anomaly or out of scope (current: out of scope).
3. Absence as drift signal — `<form>` with neither (current: NO, absence is not divergence).
4. `<input type="hidden">` / `type="submit">` exclusion — requires same-element attribute correlation; proposal decides.
5. React 19 `<form action={fn}>` server actions — split by `valueKind` or treat all `action` as one surface (current: treat as one).

## Risks

- OQ4 same-element attribute correlation adds complexity if included.
- React 19 server-action `action={fn}` could false-positive against legacy URL `action`.
- `parentTag` is immediate lexical parent only — controls inside fragments/conditionals inside a form
  won't carry `parentTag === "form"`. Acceptable (syntax-surface only) but must be documented in explain limits.

## Status

Ready for proposal. Recommended scope: Option B. Zero core changes. Single PR.
