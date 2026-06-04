# Explore: P11-S4 React Pattern Analyzers

## Status

explored

## Executive summary

P11-S4 should be a generic, framework-neutral pattern fact expansion slice, not another React analyzer yet.

After P11-S1 compound API drift, P11-S2 container/presenter role drift, and P11-S3 controlled/uncontrolled prop-surface drift, the remaining high-value React analyzer families mostly need source facts that `@rai/core` does not currently expose:

- call result binding such as `const ThemeContext = createContext(...)`;
- call arguments such as `useContext(ThemeContext)` or `fetch("/api")`;
- JSX attributes such as `<Provider value={theme}>`, `<form onSubmit={...}>`, `<Input value={...}>`, or `<Popover open={...}>`.

Recommended P11-S4 slice:

- Add additive framework-neutral `RepoGraph.patternFacts` kinds:
  - `call-binding`
  - `call-argument`
  - `jsx-attribute`
- Do not emit new findings in P11-S4.
- Do not add React semantics to `packages/core`.
- Keep future React interpretation adapter-owned in `packages/adapter-react`.

This is safer and higher leverage than forcing a provider/context, forms, data-fetching, design-system, overlay, or broad API-convention analyzer on current facts.

## Current state

### Existing facts

`packages/core/src/parse/pass1.ts` currently extracts:

- imports;
- exports;
- calls with callee only;
- hook-like call names;
- JSX tag plus immediate parent tag;
- static/member assignments;
- file-role seeds;
- component metadata including name, file, span, prop names from first-parameter destructuring, hook calls, child component names, composition markers, conditional counts.

`packages/core/src/parse/graph-build.ts` currently:

- aggregates pass1 facts;
- dedupes pattern facts by id;
- sorts facts deterministically.

`packages/core/src/types.ts` currently defines `PatternFactKind` as:

- `import`
- `export`
- `call`
- `jsx`
- `hook-call`
- `member-assignment`
- `file-role-seed`

### Existing React analyzers

`packages/adapter-react/src/` currently owns:

- `react/compound-component-api-drift`
- `react/container-presenter-role-drift`
- `react/controlled-uncontrolled-prop-surface-drift`

These analyzers are pure, deterministic, adapter-owned, and use existing `AdapterMetricEvidence` plus analyzer-owned explanation hooks.

## Question answers

### Which P11-S4 slice is safest/highest value now?

Safest/highest value: generic fact expansion for call binding, call arguments, and JSX attributes.

This creates reusable evidence for multiple future analyzer families while preserving the core boundary. It avoids a low-signal analyzer based on incomplete facts.

### Can P11-S4 be adapter-only with current facts?

Not for the remaining high-value families.

Current facts can support some low-signal data-fetching or naming-convention checks, but those risk generic best-practice output without strong repo-local grounding. Provider/context, forms, deeper overlays, and design-system usage all need at least JSX attributes and/or call arguments. Provider/context also needs syntactic call-result binding.

### Should P11-S4 be a generic fact-expansion slice first?

Yes.

Recommended P11-S4 should update `pattern-fact-extraction` with additive syntax facts and defer new React findings to P11-S5 or later.

## Candidate family assessment

| Family | Verdict | Why |
|--------|---------|-----|
| provider/context | Defer until fact expansion | Existing facts can see `createContext`, `useContext`, and `<X.Provider>`, but cannot safely connect `ThemeContext = createContext(...)`, `useContext(ThemeContext)`, and `<ThemeContext.Provider value={...}>`. Needs call-binding, call-argument, and JSX-attribute facts. |
| forms | Defer until fact expansion | Current JSX facts capture tags only, not attributes like `onSubmit`, `action`, `method`, `name`, `value`, `defaultValue`, or handlers. |
| data fetching | Defer analyzer | Current call/import facts can see `fetch`, `axios.get`, `useQuery`, etc., but standalone findings risk best-practice vibes without role, route, ownership, or convention context. Call arguments would make later evidence stronger. |
| design-system usage | Defer analyzer | Imports and JSX tags are visible, but no repo-owned design-system catalog/config exists. JSX attributes may help later, but catalog/config is still needed to avoid hardcoded ecosystem assumptions. |
| overlays beyond compound primitives | Defer until fact expansion/catalog | P11-S1 covers compound primitive part declaration/usage drift. Deeper overlay behavior needs JSX attributes such as `open`, `defaultOpen`, `onOpenChange`, `modal`, `asChild`, plus stronger catalog/ancestry rules. |
| broad API conventions | Defer | Too broad and likely noisy. Needs facts plus explicit convention scope/config. |
| generic fact expansion | Recommend | Unlocks several future slices and can stay framework-neutral. |

## Recommended P11-S4 slice

### Slice name

Generic pattern fact expansion for future React analyzers.

### New rule ids

None.

P11-S4 should not emit a new React finding. Future rule ids should be proposed later after the facts exist and tests show the evidence is sufficient.

### New fact names

Recommended exact fact kinds:

1. `call-binding`
2. `call-argument`
3. `jsx-attribute`

### Fact: `call-binding`

Purpose: observe simple local variables initialized by a call expression.

Example source:

```ts
const ThemeContext = createContext(defaultTheme);
const client = api.createClient(config);
```

Suggested shape:

```ts
export interface PatternCallBindingFact extends PatternFactBase {
  kind: "call-binding";
  local: string;
  callee: string;
  declarationKind: "const" | "let" | "var";
}
```

Suggested behavior:

- Extract only simple identifier bindings.
- Capture callee text using existing expression summary behavior.
- Do not resolve imports, aliases, scopes, types, or runtime values.
- Skip destructuring and complex patterns in first slice unless trivial to record safely.

Why needed:

- Later provider/context analyzer can ground `ThemeContext` as an observed local initialized by `createContext`.
- Later API/data analyzers can see call-created clients without semantic resolution.

### Fact: `call-argument`

Purpose: observe arguments passed to any call expression.

Example source:

```ts
useContext(ThemeContext);
fetch("/api/users");
client.query(userId);
```

Suggested shape:

```ts
export interface PatternCallArgumentFact extends PatternFactBase {
  kind: "call-argument";
  callee: string;
  argumentIndex: number;
  argument: string;
  argumentKind: "identifier" | "member" | "literal" | "call" | "unknown";
}
```

Suggested behavior:

- One fact per argument.
- Fact `span` can be the call expression span to avoid nested span complexity.
- Use deterministic raw expression summaries.
- Use `argument: ""` and `argumentKind: "unknown"` for complex unsupported expressions.
- Do not evaluate values.
- Do not resolve symbols.

Why needed:

- Later provider/context analyzer can ground `useContext(ThemeContext)`.
- Later data-fetching analyzer can inspect endpoint/client argument syntax without claiming runtime behavior.
- Later API-convention analyzers can compare observed argument surfaces only when scoped by adapter/config.

### Fact: `jsx-attribute`

Purpose: observe JSX attribute names and simple value syntax.

Example source:

```tsx
<ThemeContext.Provider value={theme}>
<form onSubmit={handleSubmit} method="post">
<Input value={value} defaultValue="x" onChange={setValue} />
<Popover open={open} onOpenChange={setOpen} />
```

Suggested shape:

```ts
export interface PatternJsxAttributeFact extends PatternFactBase {
  kind: "jsx-attribute";
  tag: string;
  parentTag: string;
  name: string;
  value: string;
  valueKind: "absent" | "literal" | "expression" | "spread" | "unknown";
}
```

Suggested behavior:

- Extract normal JSX attributes for every JSX opening element.
- Capture tag and immediate parent tag like existing `jsx` facts.
- For boolean attributes, use `valueKind: "absent"`.
- For string literals, use `valueKind: "literal"`.
- For expression containers, use a simple expression summary and `valueKind: "expression"`.
- Spreads may be recorded as raw spread syntax, but expansion is a non-goal.
- Do not infer prop semantics, controlled behavior, form behavior, provider semantics, or component identity.

Why needed:

- Provider/context: `<ThemeContext.Provider value={theme}>`
- Forms: `onSubmit`, `action`, `method`, `name`, `value`, `defaultValue`
- Overlays: `open`, `defaultOpen`, `onOpenChange`, `modal`, `asChild`
- Design-system/API conventions: observed prop names and literal variants, later scoped by adapter-owned catalog/config.

## Framework-neutral proof

These facts do not put React semantics in `@rai/core` because:

1. Fact kinds describe syntax only:
   - a variable initialized by a call;
   - an argument passed to a call;
   - an attribute on a JSX element.

2. Extraction applies to all source syntax, not React catalog names.

3. Core does not know whether:
   - `createContext` is React context;
   - `Provider` is a provider;
   - `value` is a controlled prop;
   - `onSubmit` is a form event;
   - `open` is an overlay state prop;
   - `useQuery` is data fetching.

4. Fact values are raw observed strings from source.

5. No symbol resolution, type checking, runtime value evaluation, ownership inference, team intent, remediation, or pattern labels are introduced.

6. `packages/core` still must not import `packages/adapter-react`.

7. React interpretation remains in future adapter analyzers.

8. Existing machine-facing finding contracts stay unchanged:
   - no new `Evidence` variant;
   - no finding shape change;
   - no fingerprint algorithm change;
   - no MCP raw finding change;
   - no persistence/snapshot/feedback behavior change.

The only exported contract expansion is additive `PatternFactKind` / `PatternFact` coverage.

## Future analyzers unlocked

| Future family | Facts used | Later adapter-owned interpretation |
|---------------|------------|------------------------------------|
| provider/context | `call-binding`, `call-argument`, `jsx`, `jsx-attribute` | Compare observed context creation, provider value attributes, and consumer arguments. |
| forms | `jsx`, `jsx-attribute`, existing component facts | Compare observed form/input attributes and handlers. |
| overlays beyond compound primitives | `jsx`, `jsx-attribute`, existing member/compound facts | Compare observed overlay state/control props and primitive usage. |
| data fetching | `import`, `call`, `call-argument`, maybe `call-binding` | Detect repo-local data-client/API divergence only with bounded scope/config. |
| design-system usage | `import`, `jsx`, `jsx-attribute`, future catalog/config | Compare observed design-system component/prop usage against repo-owned catalog. |
| broad API conventions | `jsx-attribute`, `call-argument`, `propNames` | Only after explicit convention scope prevents broad/noisy findings. |

## Affected areas

### Core

- `packages/core/src/types.ts`
  - Add new pattern fact interfaces and extend `PatternFactKind` / `PatternFact`.

- `packages/core/src/parse/pass1.ts`
  - Extract call-binding facts for simple variable declarators initialized by calls.
  - Extract call-argument facts during `CallExpression` visit.
  - Extract JSX attribute facts during `JSXElement` / opening element visit.
  - Keep extraction deterministic and syntax-only.

- `packages/core/src/parse/graph-build.ts`
  - Likely no logic change if ids remain deterministic and facts are still deduped/sorted by id.

- `packages/core/src/graph/repograph.ts`
  - Confirm freeze logic covers new facts. If new facts contain no nested arrays/objects beyond base span, current freeze pattern likely remains simple.
  - If any nested object is added, freeze it explicitly.

### Tests

- `packages/core/src/parse/pass1.test.ts`
  - Add RED tests for `call-binding`, `call-argument`, and `jsx-attribute`.
  - Add ambiguous syntax test proving facts stay raw and no React catalog labels appear in core-owned fact types/messages.

- `packages/core/src/parse/graph-build.test.ts`
  - Ensure expanded facts remain sorted, deduped, JSON-safe, and frozen.

- `packages/adapter-react/src/catalog.ts`
  - Update `FACT_KINDS` only if the catalog scaffold continues to claim all generic fact kinds.

- `packages/adapter-react/src/catalog.test.ts`
  - Update expected catalog fact kind list if `catalogFactKinds()` stays comprehensive.

### OpenSpec/docs in later phases

- `openspec/specs/pattern-fact-extraction/spec.md`
  - Add requirements for the new facts.

- `openspec/specs/react-pattern-analyzers/spec.md`
  - Keep deferred analyzer families scoped out for P11-S4.

- `openspec/specs/react-pattern-catalog/spec.md`
  - Update only if catalog fact kind coverage changes.

- `docs/STATUS.md`
  - Later apply/verify should record P11-S4 as fact expansion only.

- `docs/ROADMAP.md`
  - Later apply/verify should state next analyzer families are unlocked but still deferred.

## Likely files

### New files

None expected for implementation.

### Modified files in apply phase

- `packages/core/src/types.ts`
- `packages/core/src/parse/pass1.ts`
- `packages/core/src/parse/pass1.test.ts`
- `packages/core/src/parse/graph-build.test.ts`
- `packages/core/src/graph/repograph.ts` if nested freeze support is needed
- `packages/adapter-react/src/catalog.ts` if catalog fact-kind list remains comprehensive
- `packages/adapter-react/src/catalog.test.ts`
- `openspec/changes/p11-s4-react-pattern-analyzers/proposal.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/specs/pattern-fact-extraction/spec.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/specs/react-pattern-analyzers/spec.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/design.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/tasks.md`
- later apply/verify docs: `docs/STATUS.md`, `docs/ROADMAP.md`

### Avoid by default

- New React analyzer files.
- New rule ids.
- `packages/core` React catalog names or React-specific rule logic.
- CLI/MCP implementation changes unless tests reveal an existing composition issue.
- Persistence, feedback, snapshot, or memory-store code.
- `.gitignore`
- `.pi/`
- `progress.md`
- `reviews/`
- `sdd/`

## Workload forecast

| Area | Forecast |
|------|----------|
| Core fact types and parser extraction | 180-280 changed lines |
| Core parser/graph tests | 180-280 changed lines |
| Adapter catalog test/update if needed | 20-80 changed lines |
| OpenSpec proposal/spec/design/tasks | 180-300 changed lines |
| Docs/status/roadmap after apply | 40-100 changed lines |
| Total fact-only slice | 600-1040 changed lines |

### Review budget

- Active budget: 1200 changed lines.
- 400-line workload warning: likely triggered.
- 1200-line risk: low if P11-S4 remains fact-only.
- Single PR recommended for fact-only slice.
- Chained PRs recommended if a new analyzer is bundled.

Plain workload guard lines:

Decision needed before apply: No, if proposal/tasks keep P11-S4 fact-only and forecast remains under 1200 changed lines.
Chained PRs recommended: No for fact-only; Yes if adding any analyzer in same change.
400-line budget risk: Medium.

## PR splitting recommendation

Recommended delivery:

1. Single PR for fact expansion only.
2. Follow-up P11-S5 proposal for the first analyzer that consumes these facts.

If product scope requires an emitted React finding in P11-S4:

1. Split into chained/stacked PRs.
2. PR 1: generic fact expansion.
3. PR 2: one adapter-owned analyzer using those facts.
4. Ask user for scope/delivery approval before apply.

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Core accidentally gains React semantics | High | Fact names and code must stay syntax-only. No React rule ids, catalog names, provider/form/overlay labels, or remediation in core. |
| Additive `PatternFactKind` changes exported type surface | Medium | Treat as additive contract expansion; update specs/tests; do not change finding/evidence/MCP/persistence contracts. |
| Fact volume grows too much | Medium | Keep one fact per simple call argument/JSX attribute/call binding. Avoid deep object serialization. Use compact expression summaries. |
| Complex expressions create misleading values | Medium | Use `unknown`/empty summaries for unsupported expression shapes. Do not infer. |
| Later analyzers over-trust raw strings as symbol resolution | High | Specs must state these facts are not semantic bindings. Adapter analyzers must require bounded evidence and clear limits. |
| OXC AST shapes vary for JSX attributes/spreads | Medium | Start with RED parser tests using representative TSX source. Keep spread expansion non-goal. |
| Scope creep into a new analyzer | High | P11-S4 should stop before adding any new React finding. |
| Review size exceeds active budget | Medium | Split or ask before apply if forecast rises above 1200 changed lines. |

## Non-goals

P11-S4 should not add:

- provider/context analyzer;
- forms analyzer;
- data-fetching analyzer;
- design-system analyzer;
- overlay analyzer beyond existing compound primitive analyzer;
- broad API-convention analyzer;
- new React rule ids;
- new finding evidence variants;
- fingerprint algorithm changes;
- MCP raw finding/schema changes;
- persistence/snapshot/feedback changes;
- TypeScript semantic type extraction;
- symbol table or import resolution;
- runtime value evaluation;
- JSX spread expansion semantics;
- route/ownership/team-intent inference;
- remediation claims.

## Stop gates

Stop and ask before apply if any of these become necessary:

- React-specific semantics in `packages/core`.
- New `Evidence` union member or raw finding shape change.
- Fingerprint, persistence, snapshot, feedback, or MCP raw contract change.
- Type checker or symbol resolver requirement.
- JSX spread expansion or runtime value evaluation.
- New analyzer/rule id in the same P11-S4 implementation.
- Forecast above 1200 changed lines.
- Need to touch known unrelated/scratch paths: `.gitignore`, `.pi/`, `progress.md`, `reviews/`, `sdd/`.

## Recommended next phase

Recommended next phase: proposal for a fact-only P11-S4 slice.

Proposal should say:

- P11-S4 adds framework-neutral pattern facts:
  - `call-binding`
  - `call-argument`
  - `jsx-attribute`
- P11-S4 emits no new findings.
- Future React analyzer behavior remains adapter-owned.
- Remaining analyzer families stay deferred until a later approved change consumes the new facts.

Ask the user for a scope choice only if they require P11-S4 to ship a visible React analyzer finding. If so, recommend splitting fact expansion and analyzer implementation into separate PRs.
