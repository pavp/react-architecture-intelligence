# Capability Spec: Parser Component Detection

**Status**: Active (RFC 2119)  
**Origin**: change `fix-ki1-component-detector` (2026-05-30, commit 974d386)  
**Residual known-limitation**: SC-5 (inline-helper-arrow false-negative, accepted)

## Purpose

Define the durable, framework-agnostic contract for the deterministic AST parser's component-admission decision. This spec is a living capabilitiy spec (RFC 2119 MUST / MUST NOT / SHALL / MAY terminology), NOT a change log.

## Component Admission Contract

A capitalized function or arrow expression SHALL be admitted as a React component ONLY IF BOTH of the following conditions hold:

1. **Name condition (MUST)**: The function name matches the regex `^[A-Z]` (starts with uppercase letter).
2. **JSX condition (MUST)**: The function body contains at least one `JSXOpeningElement` node, either directly in the function's return position OR nested within a React wrapper call (`memo`, `forwardRef`, `lazy`) that the function directly invokes.

The JSX condition is necessary and deterministic. A capitalized function that returns a non-JSX value (e.g., a `Response`, a plain object, `null`) SHALL NOT be admitted as a component, even if it is named as if it were one.

## Implementation

The `returnsJsx` flag on the `RenderFacts` interface (`packages/core/src/parse/pass1.ts:159`) encodes the JSX-presence condition. The parser sets `returnsJsx = true` during the flat recursive walk in `collectRenderFacts` when any `JSXOpeningElement` is visited (`:180`). The guard `if (!facts.returnsJsx) return;` inside `walkComponent` (`:32`) rejects any capitalized function with `returnsJsx === false` before admission.

## Known Limitations

### SC-5: Inline-Helper-Arrow False-Negative (Accepted, Residual)

A function whose outer body returns non-JSX (e.g., `null`) but contains an inline helper arrow that returns JSX will be **admitted as a component** because the flat recursive walk cannot distinguish outer-function JSX from nested-closure JSX.

**Example:**
```tsx
export const Outer = () => {
  const renderItem = (x: string) => <li>{x}</li>;  // nested; contains JSX
  return null;  // outer function renders nothing
};
```

`Outer` MAY be admitted (because `renderItem`'s JSX sets `returnsJsx = true` on the outer facts). This is a **false-negative direction** (a non-rendering function retained as a component). It is accepted because:

1. It is safe: the function is non-empty (carries JSX facts), so its embedding is non-zero and cannot resurrect the KI-1 cosine-1.0 false-positive cascade.
2. Fixing it requires function-depth or return-position tracking in the visitor, a structural enhancement beyond the ~8-line targeted fix.
3. Future tightening is possible by adding depth/scope scoping to `collectRenderFacts`.

## Framework Invariant (P6)

This spec and its implementation MUST NOT contain framework-specific logic, path conventions, or hardcoded framework names. The `returnsJsx` flag is a generic JSX-presence signal, framework-agnostic and reusable across any JSX-based framework.

Verification: `grep -E "(next|remix|react-router|vue|svelte)" packages/core/src/parse/pass1.ts` SHALL return zero matches.

## Scenarios Covered

| Scenario | Admission | Reason |
|----------|-----------|--------|
| Next.js `export const GET = async (req) => new Response(...)` | NO | capitalized, but no JSX → `returnsJsx = false` |
| `export const Button = forwardRef((...) => <button/>)` | YES | capitalized, forwardRef containing JSX → flat walk finds JSX, `returnsJsx = true` |
| `export const Badge = memo(() => <span/>)` | YES | capitalized, memo containing JSX → `returnsJsx = true` |
| `export function Header() { return <header/>; }` | YES | capitalized function declaration returning JSX → `returnsJsx = true` |
| Inline helper returning JSX while outer returns `null` | YES (residual) | flat walk finds inner JSX → `returnsJsx = true` (SC-5 accepted) |

## References

- Implementation: `packages/core/src/parse/pass1.ts` (RenderFacts interface, collectRenderFacts, walkComponent guard)
- Tests: `packages/core/src/parse/pass1.test.ts` (KI-1 fix block, SC-1 through SC-4)
- End-to-end: `packages/core/src/engine/golden.test.ts` (route-handler corpus → 0 findings)
- Bug fix: KI-1 component-detector false positives (477-file reproduction, field-validated)
