# Proposal: react/form-control-surface-drift (P11-S6)

## Intent

React codebases mix native form submission patterns and native form-control binding patterns
without consistency guarantees. At the syntax surface — visible from JSX and JSX attribute
facts alone — two concrete divergence classes are observable per file: (1) the submit-surface
of `<form>` elements varies across occurrences (`onSubmit` vs `action`/`method`), and (2)
native form controls (`input`, `select`, `textarea`) mix controlled (`value`/`checked`) and
uncontrolled (`defaultValue`/`defaultChecked`) attribute names for the same element type.
Both classes are detectable from existing P11-S4 `jsx` and `jsx-attribute` facts with zero
core changes. This analyzer reports when either class of divergence is present in a file,
giving teams a stable architectural signal about mixed binding surface choices.

## Scope

### In Scope

- **Signal Family 1 — Form Submit Surface Drift**: a file contains at least one `<form
  onSubmit=...>` (with non-absent `valueKind`) AND at least one `<form action=...>` or `<form
  method=...>` in the same file.
- **Signal Family 2 — Control Binding Surface Drift**: within the same file, native form
  controls use both controlled and uncontrolled attribute names for the same element type:
  - `<input value=...>` AND `<input defaultValue=...>`
  - `<input checked=...>` AND `<input defaultChecked=...>`
  - `<select value=...>` AND `<select defaultValue=...>`
  - `<textarea value=...>` AND `<textarea defaultValue=...>`
- Subject anchor: `react:form-control-surface:${file}` — one finding per drifting file.
- Severity: `divergenceCount > 1 ? "warn" : "info"` (consistent with P11-S5).
- Scope of evidence: `jsx` and `jsx-attribute` facts only (`tag`, `name`, `valueKind` fields).
- Adapter-owned: `packages/adapter-react/src/form-control-surface-drift.ts`.
- Registration: factory exported from `index.ts`, added to `createReactCoreAnalyzers()` in
  `core-adapter.ts`.

### Out of Scope

- `e.preventDefault()` inside onSubmit handler body (needs control-flow facts; not available).
- `useRef`-backed uncontrolled fields (hookCalls not linked to specific JSX elements).
- Cross-file form composition (parentTag is lexical-parent only; cross-component nesting absent).
- React Hook Form / Formik / library component detection (import→JSX linking not in current facts).
- Form validation surface (separate concern).
- Missing `onChange` on `<input value=...>` — a distinct pattern (incomplete controlled binding), not surface divergence.
- Capitalized `<Form>`, `<Input>`, etc. — library components with library-defined semantics; only lowercase native HTML tags.
- TypeScript type inference for form field values.
- No intent, runtime behavior, or React warning claims.
- No root-cause or remediation guidance (facts-only narration; LLMs narrate, do not invent).
- No new MCP tool.
- No `@rai/core` changes.

## Resolved Open Questions

| # | Question | Decision |
|---|----------|----------|
| OQ1 | File-level vs component-level subject | **File-level** (`react:form-control-surface:${file}`). Component grouping via `parentTag` chains is not reliable (immediate lexical parent only, not component boundary). Defer component-level grouping to a future analyzer. |
| OQ2 | Single `<form>` with both `onSubmit` AND `action` | **Out of scope.** Single-element ambiguity (apps may use `action` as a progressive-enhancement fallback). Signal fires only on cross-element comparison within the file. |
| OQ3 | Absence as drift signal | **No.** A `<form>` with neither `onSubmit` nor `action` is not itself a drift signal. Only explicit presence of both surfaces triggers the signal. |
| OQ4 | `<input type="hidden">` / `type="submit">` exclusion | **Deferred.** Same-element attribute correlation (checking `type` AND `value`/`defaultValue` on the same element) adds non-trivial complexity. **Document as a known limitation**: these element types may appear in drift reports. Include the limitation in the spec's explain-text constraints. Revisit if false-positive rate warrants it. |
| OQ5 | React 19 `<form action={fn}>` server actions | **Treat all `action` attributes as one surface regardless of `valueKind`.** No split by `valueKind`; the analyzer cannot distinguish a URL string from a server action function at the syntax surface without semantic analysis. Document this as a known limitation (React 19 server-action `action={fn}` will contribute to submit-surface drift detection, which may be a false positive in some codebases). |

## Guardrail Compliance

| Guardrail | Status |
|-----------|--------|
| Adapter-owned, no core changes | Confirmed — zero `packages/core` changes |
| Pure and deterministic | Confirmed — pure filter over immutable facts; no IO, no state |
| Stable fingerprints | Structural (content-stable), nominal (name-only), positional (file+span); follows P11-S5 pattern |
| No new MCP tool | Confirmed |
| Registry-factory composition | `createFormControlSurfaceDriftAnalyzer()` added to `createReactCoreAnalyzers()` |
| Drift terminology | Reports divergence in repo-local attribute surface patterns; no runtime/React semantics claims |

## Acceptance Signals (spec/design must preserve)

- **Determinism**: same fact set → same finding set, always. No non-deterministic ordering.
- **Silence conditions**: no false positives on uniformly controlled or uniformly uncontrolled files; no emission when no native form elements present.
- **Bounded explanation language**: explain hook narrates surface divergence only — no "bug", "error", "will break", "React warns". Consistent with P11-S5 explainability pattern.
- **Fingerprint stability**: structural fingerprint must not change on whitespace/formatting edits; positional fingerprint tied to span.
- **Emission gate**: `topology.exceeded.length > 0` required before any finding is emitted.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/adapter-react/src/form-control-surface-drift.ts` | New | Analyzer implementation |
| `packages/adapter-react/src/form-control-surface-drift.test.ts` | New | Tests (~12-15 cases) |
| `packages/adapter-react/src/core-adapter.ts` | Modified | +1 import, +1 factory in array |
| `packages/adapter-react/src/index.ts` | Modified | +1 export block |
| `packages/core/**` | None | Zero changes |

**Estimated total**: ~590-670 lines — within 800-line single-PR review budget. No chain needed.

## Capabilities

### New Capabilities

- `react-form-control-surface-drift`: Analyzer detecting file-level submit-surface and
  control-binding surface divergence across native HTML form elements in React JSX.

### Modified Capabilities

- None

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `parentTag` lexical-parent limitation: controls inside fragments/conditionals inside `<form>` won't carry `parentTag === "form"` | Low (acceptable by design) | Document in explain-text limits; `parentTag` used only for corroboration, not as primary gate |
| React 19 server-action `<form action={fn}>` false-positives against legacy `action="url"` patterns | Medium | OQ5: treat all `action` as one surface; document limitation; no behavioral claim made |
| `<input type="hidden">` / `type="submit">` false-positives (OQ4 deferred) | Low-Medium | Document as known limitation in spec; revisit if noise warrants attribute correlation |

## Rollback Plan

Delete the four affected lines in `core-adapter.ts` and `index.ts`, then remove the two new
files. The analyzer is isolated — no other analyzer depends on it. No schema migrations.

## Dependencies

- P11-S4 facts must be emitted by `packages/core/src/parse/pass1.ts` (confirmed present).

## Success Criteria

- [ ] Analyzer emits findings only when both surfaces are present in the same file.
- [ ] Files with uniform controlled or uniform uncontrolled controls produce no finding.
- [ ] Files with no native form elements produce no finding.
- [ ] Fingerprints are stable across whitespace-only edits.
- [ ] `explain` hook returns bounded, non-runtime-claim narration.
- [ ] All ~12-15 test cases pass under strict TDD (test-first).
- [ ] `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass.
- [ ] No `packages/core` changes introduced.
