# Proposal: P11-S4 Framework-Neutral Pattern Fact Expansion

## Status

proposed

## Intent

Add a fact-only P11 slice that expands `RepoGraph.patternFacts` with generic syntax observations needed by future React pattern analyzers.

P11-S4 should add three additive, framework-neutral fact kinds:

- `call-binding`
- `call-argument`
- `jsx-attribute`

P11-S4 should emit no new findings and no new React rule ids. Future React interpretation must remain adapter-owned in `@rai/adapter-react`.

## Motivation

P11-S1, P11-S2, and P11-S3 used existing facts to ship three grounded React analyzers:

- `react/compound-component-api-drift`
- `react/container-presenter-role-drift`
- `react/controlled-uncontrolled-prop-surface-drift`

The remaining high-value families need source facts core does not currently expose:

| Future family | Missing evidence |
|---------------|------------------|
| provider/context | `const ThemeContext = createContext(...)`, `useContext(ThemeContext)`, `<ThemeContext.Provider value={...}>` |
| forms | `<form onSubmit={...}>`, `method`, `action`, `name`, `value`, `defaultValue` |
| overlays | `open`, `defaultOpen`, `onOpenChange`, `modal`, `asChild` attributes |
| data fetching | call arguments for `fetch`, clients, query hooks, and API wrappers |
| design-system/API conventions | observed JSX attributes and call arguments scoped later by repo-owned catalog/config |

Forcing a new analyzer on current facts would either be low-value or risk best-practice claims. A fact-only expansion is safer and unlocks later analyzers.

## Scope

### In scope

- Add framework-neutral `PatternFact` kinds for simple syntax observations:
  - `call-binding`: local identifier initialized by a call expression.
  - `call-argument`: raw/summarized argument passed to a call expression.
  - `jsx-attribute`: JSX attribute name and simple value shape.
- Update parser tests for extraction, determinism, raw/ambiguous syntax, and no React semantics in core.
- Update graph/freeze tests if needed to prove facts remain sorted, deduped, JSON-safe, and immutable.
- Update React catalog scaffold only if it intentionally lists all generic fact kinds.
- Update OpenSpec for fact extraction and deferred analyzer scope.
- Keep findings, evidence, fingerprints, MCP raw fields, persistence, snapshots, feedback, and memory semantics unchanged.

### Out of scope / non-goals

- No provider/context analyzer.
- No forms analyzer.
- No data-fetching analyzer.
- No design-system analyzer.
- No overlay analyzer beyond existing compound primitive work.
- No broad API-convention analyzer.
- No new React rule ids.
- No new `Evidence` union member.
- No finding schema, fingerprint, MCP, persistence, snapshot, feedback, or memory changes.
- No TypeScript semantic type extraction.
- No symbol resolution, scope resolution, import resolution, runtime value evaluation, or JSX spread expansion semantics.
- No React-specific names, rule ids, catalog labels, remediation, or intent claims in `packages/core`.

## Proposed fact semantics

### `call-binding`

Records a simple identifier initialized by a call expression:

```ts
const ThemeContext = createContext(defaultTheme);
```

Shape:

```ts
interface PatternCallBindingFact extends PatternFactBase {
  kind: "call-binding";
  local: string;
  callee: string;
  declarationKind: "const" | "let" | "var";
}
```

### `call-argument`

Records one observed argument per call expression:

```ts
useContext(ThemeContext);
fetch("/api/users");
```

Shape:

```ts
interface PatternCallArgumentFact extends PatternFactBase {
  kind: "call-argument";
  callee: string;
  argumentIndex: number;
  argument: string;
  argumentKind: "identifier" | "member" | "literal" | "call" | "unknown";
}
```

### `jsx-attribute`

Records JSX attribute names and simple value syntax:

```tsx
<form onSubmit={handleSubmit} method="post" />
<ThemeContext.Provider value={theme} />
```

Shape:

```ts
interface PatternJsxAttributeFact extends PatternFactBase {
  kind: "jsx-attribute";
  tag: string;
  parentTag: string;
  name: string;
  value: string;
  valueKind: "absent" | "literal" | "expression" | "spread" | "unknown";
}
```

## Framework-neutral proof

These facts are syntax-only. Core records what source text contains but does not interpret what it means.

Core must not know whether:

- `createContext` is React context;
- `Provider` is a React provider;
- `value` is a controlled prop;
- `onSubmit` is a form event;
- `open` is overlay state;
- `fetch` is data fetching;
- any argument or attribute is correct, incorrect, intentional, or remediable.

`packages/core` must still not import `packages/adapter-react` or any React catalog modules.

## Affected areas

| Area | Impact |
|------|--------|
| `packages/core/src/types.ts` | Add additive fact interfaces and extend `PatternFactKind` / `PatternFact`. |
| `packages/core/src/parse/pass1.ts` | Extract `call-binding`, `call-argument`, and `jsx-attribute` facts. |
| `packages/core/src/parse/pass1.test.ts` | Add RED tests for the new facts and no React semantics. |
| `packages/core/src/parse/graph-build.test.ts` | Add or extend sorting/freezing coverage if needed. |
| `packages/adapter-react/src/catalog.ts` | Update if catalog fact-kind list remains comprehensive. |
| `packages/adapter-react/src/catalog.test.ts` | Update expected fact kinds if catalog changes. |
| OpenSpec | Add proposal/spec/design/tasks and later sync/archive. |
| Docs | Record fact-only P11-S4 after verification. |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Core accidentally gains React semantics | Keep fact names generic and code syntax-only; add tests that serialized facts do not include React pattern labels. |
| Fact volume grows too much | Keep one compact fact per binding/argument/attribute; avoid deep serialization. |
| Complex expressions mislead later analyzers | Use `argumentKind` / `valueKind` and `unknown` for unsupported shapes. |
| Later analyzers over-trust raw strings as semantic binding | Specs must state these are not symbol/type bindings. |
| Scope creep adds analyzer in same PR | Stop; split analyzer into P11-S5. |

## Rollback plan

1. Revert new fact interfaces and parser extraction.
2. Revert parser/graph/catalog tests and catalog fact-kind list changes.
3. Revert OpenSpec/docs updates for P11-S4.
4. No data migration should be needed because P11-S4 emits no findings and does not alter persistence, snapshots, feedback, or MCP raw finding contracts.

## Success criteria

- [ ] `RepoGraph.patternFacts` includes deterministic `call-binding`, `call-argument`, and `jsx-attribute` facts for representative TS/TSX input.
- [ ] Facts remain sorted, deduped, JSON-safe, and frozen with the graph.
- [ ] Core remains framework-neutral and contains no React-specific rule ids or analyzer logic.
- [ ] No new findings are emitted by P11-S4.
- [ ] Existing P11 analyzers continue to pass.
- [ ] Full test/typecheck/build/lint/smoke verification passes before archive.

## Recommended next phase

Proceed to spec/design/tasks for a fact-only P11-S4 slice. If a visible React analyzer is required in P11-S4, split into chained PRs: fact expansion first, analyzer second.