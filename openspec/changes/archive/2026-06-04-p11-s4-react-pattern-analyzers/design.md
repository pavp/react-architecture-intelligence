# Design: P11-S4 Framework-Neutral Pattern Fact Expansion

## Status

designed

## Executive summary

P11-S4 adds three additive `PatternFact` kinds in `@rai/core`:

- `call-binding`
- `call-argument`
- `jsx-attribute`

The slice emits no new findings and adds no React analyzer. It expands syntax observations so later adapter-owned analyzers can be grounded without putting React semantics in core.

## Design constraints

- Facts are syntax-only.
- No new `Evidence` variant.
- No finding schema change.
- No fingerprint algorithm change.
- No MCP raw finding change.
- No persistence, snapshot, feedback, or memory write behavior change.
- No React names, rule ids, provider/form/overlay labels, remediation, or intent claims in `packages/core`.
- Existing parser output must remain deterministic.

## Type changes

Modify `packages/core/src/types.ts`.

Extend:

```ts
export type PatternFactKind =
  | "import"
  | "export"
  | "call"
  | "call-binding"
  | "call-argument"
  | "jsx"
  | "jsx-attribute"
  | "hook-call"
  | "member-assignment"
  | "file-role-seed";
```

Add:

```ts
export interface PatternCallBindingFact extends PatternFactBase {
  kind: "call-binding";
  local: string;
  callee: string;
  declarationKind: "const" | "let" | "var";
}

export interface PatternCallArgumentFact extends PatternFactBase {
  kind: "call-argument";
  callee: string;
  argumentIndex: number;
  argument: string;
  argumentKind: "identifier" | "member" | "literal" | "call" | "unknown";
}

export interface PatternJsxAttributeFact extends PatternFactBase {
  kind: "jsx-attribute";
  tag: string;
  parentTag: string;
  name: string;
  value: string;
  valueKind: "absent" | "literal" | "expression" | "spread" | "unknown";
}
```

Extend `PatternFact` union with the new interfaces.

## Parser extraction

Modify `packages/core/src/parse/pass1.ts`.

### `call-binding`

Extract inside variable declarations only when:

- declaration id is a simple identifier;
- initializer is a `CallExpression`;
- callee summary is non-empty;
- declaration kind is `const`, `let`, or `var`.

Use the variable declarator span or initializer span consistently. Preferred: declarator span because it covers local and call.

Skip destructuring and complex binding patterns.

### `call-argument`

Extract inside every `CallExpression` visit:

- compute callee with existing `expressionText` behavior;
- iterate `node.arguments ?? []` in source order;
- emit one fact per argument;
- use call expression span initially to avoid nested span complexity;
- record `argumentIndex` as zero-based.

Argument summary policy:

| AST shape | `argument` | `argumentKind` |
|-----------|------------|----------------|
| identifier | identifier name | `identifier` |
| member expression | expression text | `member` |
| string/number/boolean/null literal | string value | `literal` |
| call expression | callee expression text | `call` |
| unsupported | empty string or expressionText fallback | `unknown` |

Do not evaluate values.

### `jsx-attribute`

Extract during `JSXElement` handling after computing tag and parent tag.

For each opening element attribute:

| JSX attr shape | `name` | `value` | `valueKind` |
|----------------|--------|---------|-------------|
| normal boolean attr | attr name | empty string | `absent` |
| string literal | attr name | literal value | `literal` |
| expression container | attr name | expression summary | `expression` |
| spread attr | spread argument summary or empty | expression summary or empty | `spread` |
| unsupported | attr name or empty | empty | `unknown` |

Use opening element or attribute span. Preferred: attribute span when available.

Do not expand spreads.

## Expression summary helpers

Current `expressionText` can remain conservative. It should continue to return simple strings for:

- identifiers;
- literals;
- static/member expressions;
- call expressions via callee summary.

Add helper(s) if needed:

```ts
function argumentKind(node: any): PatternCallArgumentFact["argumentKind"]
function jsxAttributeValue(attribute: any): { value: string; valueKind: PatternJsxAttributeFact["valueKind"] }
```

These helpers must not interpret framework semantics.

## Fact ids and determinism

The existing `patternFactId` already hashes fact kind, span start/end, and fact details excluding file/span/id. Keep that path unless tests show collisions.

Determinism rules:

- Preserve AST traversal source order.
- Do not mutate AST, graph, facts, or arrays passed from callers.
- Use existing graph-build sorting/deduplication by fact id.
- New fact fields must be JSON-safe primitives only.

## Graph and freeze behavior

`RepoGraph.patternFacts` already stores fact objects. New facts should only contain primitive string/number fields plus existing `span`; no nested arrays/objects beyond span.

If freeze tests fail, update graph freeze logic generically, not for React.

## React catalog update

`packages/adapter-react/src/catalog.ts` currently exposes `FACT_KINDS` as a comprehensive list of generic fact kinds. Update it to include:

- `call-binding`
- `call-argument`
- `jsx-attribute`

This is adapter-side catalog scaffolding and must not add findings.

## Tests

### RED parser tests

Add tests to `packages/core/src/parse/pass1.test.ts` before implementation:

- extracts `call-binding` for `const ThemeContext = createContext(defaultTheme)`;
- extracts `call-argument` for `useContext(ThemeContext)` and `fetch("/api/users")`;
- extracts `jsx-attribute` for string, expression, boolean, and spread attributes;
- serialized facts do not contain React pattern labels such as `provider`, `form analyzer`, `overlay analyzer`, `controlled`, or remediation text.

### Graph/freeze tests

Update `packages/core/src/parse/graph-build.test.ts` if needed:

- new facts survive graph build;
- facts are sorted/deduped;
- graph remains frozen/immutable.

### Catalog tests

Update `packages/adapter-react/src/catalog.test.ts` if `catalogFactKinds()` expects a complete kind list.

### Regression tests

Run existing P11 adapter tests to ensure no analyzer behavior changes.

## Verification commands

Focused:

```bash
pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts
```

Regression:

```bash
pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts
```

Full:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
rtk proxy pnpm lint
./scripts/smoke.sh --build
git diff --check
```

## Workload forecast

| Area | Forecast |
|------|----------|
| Type/parser changes | 180-280 lines |
| Parser/graph/catalog tests | 180-280 lines |
| OpenSpec/docs | 220-360 lines |
| Total | 600-1040 changed lines |

Single PR is acceptable if scope stays fact-only and under 1200 changed lines. Stop and ask if adding any analyzer or exceeding 1200 lines.
