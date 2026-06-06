# Design: react/form-control-surface-drift (P11-S6)

Phase: design · Persistence: hybrid · Engram topic: `sdd/p11-s6-form-control-surface-drift/design`

Closest analog (template, study before implementing): `packages/adapter-react/src/context-provider-value-surface-drift.ts` (P11-S5). Same fact families (`jsx`, `jsx-attribute`), same `AdapterMetricEvidence` shape, same fingerprint triple, same `topology.exceeded` emission gate, same bounded explain hook. The pairing model (controlled vs uncontrolled attribute names per element type) mirrors the `CONTROLLED_DEFAULT_PAIRS` array in `controlled-uncontrolled-prop-surface-drift.ts` (P11-S3), but applied to JSX `tag`/`name` instead of component `propNames`.

---

## 1. Architecture Approach

### Pattern and layering

- **Pure synchronous analyzer over `AnalysisContext`** — the established RAI analyzer pattern. No IO, no shared state, no per-analyzer try/catch (the pipeline owns diagnostic isolation). Code is source of truth; this analyzer only observes immutable `patternFacts` and emits append-only `Finding[]`.
- **Adapter-owned, zero core changes.** All React/HTML semantics (which tags are form elements, which attribute names are controlled vs uncontrolled) live in the adapter as local constants. `@rai/core` stays framework-agnostic. Verified: `PatternJsxFact` and `PatternJsxAttributeFact` already carry `tag`, `parentTag`, `name`, `valueKind` (see `packages/core/src/types.ts` lines 60–73). No new fact kinds, no new core passes.
- **File-level subject** (OQ1): one finding per drifting file, anchored at `react:form-control-surface:${file}`. This avoids any `call-binding`/symbol-identity lookup (unlike P11-S5, which keys on context binding local name). The grouping key is the file path only.

### Boundaries

| Concern | Owner |
|---|---|
| Fact production (`jsx`, `jsx-attribute`) | `@rai/core` parse pass (P11-S4, already shipping) |
| Form/control HTML semantics (tag sets, attr name sets) | This adapter analyzer (local `const`) |
| Divergence detection algorithm | This adapter analyzer |
| Finding shape / fingerprints / evidence | This adapter analyzer (mirrors `AdapterMetricEvidence`) |
| Bounded narration | This adapter analyzer's `explain` hook |
| Diagnostic isolation on throw | Pipeline (`packages/core/src/engine/pipeline.ts`) — unchanged |

### Data flow

```
ctx.graph.patternFacts (readonly, frozen)
  → filter jsx facts (form-element tags)            ──┐
  → filter jsx-attribute facts (form/control attrs) ──┤
  → group by file                                      │
  → per file: bucket Family-1 (form submit surface)    │  pure, deterministic
              bucket Family-2 (control binding)         │
  → compute exceeded[] tokens                           │
  → if exceeded.length === 0 → skip (silence gate)      │
  → build Finding (id, fingerprint triple, evidence)  ──┘
  → findings.sort(compareFindings)  → return
```

---

## 2. Module Layout

| Item | Value |
|---|---|
| File | `packages/adapter-react/src/form-control-surface-drift.ts` |
| Test file | `packages/adapter-react/src/form-control-surface-drift.test.ts` |
| Rule id const | `export const FORM_CONTROL_SURFACE_DRIFT_RULE_ID = "react/form-control-surface-drift";` |
| Factory | `export function createFormControlSurfaceDriftAnalyzer(): Analyzer` |
| `Analyzer` shape | `{ ruleId, framework: "react", analyze, explain }` — identical to P11-S5 factory (lines 62–70 of template) |
| `index.ts` export | A new `export { FORM_CONTROL_SURFACE_DRIFT_RULE_ID, createFormControlSurfaceDriftAnalyzer } from "./form-control-surface-drift.js";` block, alphabetically placed after the `context-provider-value-surface-drift` block (between `CONTEXT_PROVIDER...` and `CONTROLLED_UNCONTROLLED...` exports to preserve the existing alphabetical ordering by rule key — `form-...` actually sorts after `controlled-...`, so place it after the `CONTROLLED_UNCONTROLLED` block and before `export { createReactCoreAnalyzers }`). |
| `core-adapter.ts` import | `import { createFormControlSurfaceDriftAnalyzer } from "./form-control-surface-drift.js";` added with the other analyzer imports. |
| `core-adapter.ts` registration | Add `createFormControlSurfaceDriftAnalyzer(),` to the array returned by `createReactCoreAnalyzers()`. Order in the array is not semantically significant (the pipeline runs each analyzer independently), but append it after `createContextProviderValueSurfaceDriftAnalyzer()` for readability. |

Imports from `@rai/core` (only what is used — verified against template):
`explainTerm`, and types `AdapterMetricEvidence`, `AnalysisContext`, `Analyzer`, `AnalyzerResult`, `ExplanationEnvelope`, `Finding`, `PatternFact`, `PatternJsxAttributeFact`, `PatternJsxFact`, `PresentedFinding`, `Severity`, `Span`.
(Note: this analyzer does NOT use `PatternCallBindingFact`, `PatternCallArgumentFact`, or `PatternHookCallFact` — it is JSX-only, simpler than P11-S5.)

Local helpers reused verbatim from P11-S5 (copy, do not import — analyzers do not cross-import helpers): `sha()`, `sortedUnique()`, `spanContains()`, `compareFacts()`, `compareRoles()`, `compareFindings()`, `uniqueRoles()`, `formatList()`, `severityFor()`. These are small pure functions; duplication is the existing convention (P11-S3 and P11-S5 both carry their own copies).

---

## 3. Input Fact Reads

### Local semantic constants (adapter-owned)

```ts
// Family 1 — native form submit surface
const FORM_TAG = "form";
const SUBMIT_HANDLER_ATTR = "onSubmit";              // surface A: event-handler submit
const DECLARATIVE_SUBMIT_ATTRS = new Set(["action", "method"]); // surface B: declarative submit

// Family 2 — native form-control binding surface, per element type
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);

interface ControlBindingPair {
  slot: string;        // logical slot ("value", "checked")
  controlled: string;  // controlled attribute name
  uncontrolled: string;// uncontrolled attribute name
  tags: ReadonlySet<string>; // element types this pair applies to
}

const CONTROL_BINDING_PAIRS: readonly ControlBindingPair[] = [
  { slot: "value",   controlled: "value",   uncontrolled: "defaultValue",
    tags: new Set(["input", "select", "textarea"]) },
  { slot: "checked", controlled: "checked", uncontrolled: "defaultChecked",
    tags: new Set(["input"]) },
];
```

Rationale for the `tags` field: `checked`/`defaultChecked` is only meaningful on `<input>` (checkbox/radio). `value`/`defaultValue` applies to `input`, `select`, `textarea`. Restricting the pair to its valid tags prevents fabricating a `select checked` divergence that HTML never produces. This mirrors the proposal's explicit element×pair matrix (proposal Scope, Family 2 bullet list).

### Fact filtering

Both families read from `ctx.graph.patternFacts`. Sort the input once with `compareFacts` (id → file → span.start → span.end → kind) for determinism, exactly as P11-S5 does (`observationsFor`, line 163).

- **Family 1 fact set**: `jsx-attribute` facts where `tag === "form"` AND `name` ∈ {`onSubmit`, `action`, `method`}. The matching `jsx` facts (`tag === "form"`) are read only to corroborate roles/spans and to count form occurrences; the **gate is on the attribute facts**, consistent with OQ3 (presence of a surface = explicit attribute, never absence).
- **Family 2 fact set**: `jsx-attribute` facts where `tag` ∈ {`input`, `select`, `textarea`} AND `name` ∈ {`value`, `defaultValue`, `checked`, `defaultChecked`}.

Tag matching is **exact lowercase only** (`tag === "form"`, `CONTROL_TAGS.has(tag)`). Capitalized `<Form>`/`<Input>` are library components with library-defined semantics and are excluded by construction (proposal Out of Scope). A small guard `isLowercaseNativeTag(tag)` is unnecessary because the constant sets already contain only lowercase native names; an exact set/string match is sufficient and clearer.

---

## 4. Divergence Computation

The analyzer iterates files (sorted by path). For each file it computes both families, accumulates `exceeded` tokens, and emits at most one finding when `exceeded.length > 0`.

### Family 1 — Form submit surface drift

A submit-surface divergence exists in a file when **both** surfaces co-occur across the file's `<form>` elements:

- surface A present: at least one `jsx-attribute` with `tag === "form"`, `name === "onSubmit"`, `valueKind !== "absent"`.
- surface B present: at least one `jsx-attribute` with `tag === "form"`, `name ∈ {"action","method"}` (any `valueKind`, per OQ5 — all `action` treated as one surface, no `valueKind` split).

```text
hasSubmitHandler   = exists(form attr, name==onSubmit, valueKind != absent)
hasDeclarativeSubmit = exists(form attr, name in {action, method})
if hasSubmitHandler && hasDeclarativeSubmit:
    push exceeded token: "formSubmitSurfaceDrift:" + file
```

Divergence requires surfaces to appear on **distinct** `<form>` elements. The gate checks that at least one `<form>` carries surface A (onSubmit, non-absent) and at least one **different** `<form>` carries surface B (action/method). A single `<form>` element that carries both surfaces simultaneously does NOT satisfy the gate and stays SILENT.

> **AMENDED DECISION — OQ2 LOCKED (post-verify fix pass, 2026-06-06):** The emission gate requires >=2 distinct `<form>` elements where one form has a submit-handler surface and a different form has a declarative submit surface. A single `<form onSubmit action>` does NOT fire Family 1. Rationale: (1) RAI is a drift engine — drift = divergence *between* elements; a lone dual-surface element cannot diverge from itself. (2) React 19 `<form action={serverAction} onSubmit={clientHandler}>` is a valid progressive-enhancement pattern; firing on it would be a false positive on idiomatic code. (3) The original spec (OQ2 scenario "Single form carrying both onSubmit and action stays silent") was the authoritative contract; the prior design ADR-3 had overridden it without a spec amendment — that was the process error caught by verify. Implementation uses `spanContains` to assign attributes to their parent form element by span containment, then checks for cross-form surface divergence. Two-form divergence (one form has only onSubmit, another form has only action) still fires as before.

### Family 2 — Control binding surface drift

For each `(pair, tag)` in `CONTROL_BINDING_PAIRS × pair.tags`, a divergence exists in the file when the same element type uses **both** the controlled and the uncontrolled attribute name.

### Severity and counting

`exceeded = sortedUnique([...family1Tokens, ...family2Tokens])`
`severity = divergenceCount > 1 ? "warn" : "info"`

---

## 5. Subject and Finding Shape

### Subject

```ts
subject: {
  id: `react:form-control-surface:${file}`,
  name: file,
  file,
  span: primarySpan,
  fingerprint: subjectFingerprint,
}
```

### Fingerprint triple

- **structural**: content-stable, whitespace-immune, position-free (as P11-S5)
- **nominal**: name-only identity
- **positional**: tied to file + primary span

All follow P11-S5 philosophy with file-level adaptations.

---

## 6. Explanation Hook

Adapter-owned `explain(finding: PresentedFinding): ExplanationEnvelope | null`, structured exactly like P11-S5's:

- Guard: return `null` unless `finding.ruleId === RULE_ID && finding.evidence.kind === "adapter-metric"`.
- `summary`: bounded to observed surfaces, branched by which families fired.
- `limits`: 6 bounded constraints, no runtime/React-semantics claims (no `bug`, `wrong`, `error`, `React warning`, etc.).
- `groundingFields`, `glossary`: sorted from evidence keys.

Forbidden vocabulary (test-enforced): no claim about runtime behavior, React warnings, bugs, defects, root causes, user impact, or required changes.

---

## 7. Test Plan Outline (strict TDD)

Use the P11-S5 `runFacts()` harness. Vitest cases (~18, mirrors P11-S5 regression guards):

1. F1 positive (onSubmit + action → fires)
2. F1 negative (handler only → silent)
3. F1 negative (declarative only → silent)
4. F2 positive (value + defaultValue → fires)
5. F2 positive (checked + defaultChecked → fires)
6. F2 negative (uniform single surface → silent)
7. Cross-file isolation (forms in different files → silent)
8. Single form with both surfaces (E8 → silent via OQ2)
9. Severity boundary (>1 signal → warn)
10. Determinism (forward vs reversed → same output)
11. Structural stability (span shift → same structural fingerprint)
12. Frozen facts not mutated
13. Bounded explanation + forbidden-vocabulary check
14. Null explanation for non-matching rule
15-18. Edge cases (E2, E4, E5, E7 per design §6)

---

## 8. No-Core-Change Confirmation

All fact fields used already exist on `PatternJsxFact` / `PatternJsxAttributeFact` (core types unchanged). Zero new core types, zero new passes.

---

## 9. ADR-style Decisions

| ID | Decision | Rationale |
|---|---|---|
| ADR-1 | File-level subject | Simplest deterministic grouping; avoids unreliable parent-chain lookup |
| ADR-2 | Two signal families | Full observable coverage; mirrors P11-S5 multi-signal model |
| ADR-3 | **AMENDED:** Per-element gate (>=2 distinct forms) | Spec OQ2 authoritative; single dual-surface form stays silent; React 19 progressive-enhancement pattern |
| ADR-4 | Control pairs carry `tags` allow-set | Prevents HTML-impossible divergences (`select checked`) |
| ADR-5 | `onSubmit` requires `valueKind !== "absent"` | Submit handler must be a real binding |
| ADR-6 | All `action` = one surface (no split) | Cannot distinguish URL vs server-action at syntax surface |
| ADR-7 | Copy helpers rather than import | Existing adapter convention (P11-S3, P11-S5 each carry own copies) |

---

## 10. Implementation Order

1. Author test file (strict TDD — red first)
2. Implement analyzer (constants → compute → finding → explain)
3. Register in core-adapter.ts and index.ts
4. `pnpm build && pnpm test && pnpm typecheck && pnpm lint` — all green

Single PR, ~590–670 lines, within 800-line budget.
