# Spec: fix-ki1-component-detector

## 1. Scope and Integrity Boundary

This spec governs changes to the **CODE tier only** — the deterministic parser layer (`packages/core/src/parse/pass1.ts`). The integrity model (§1.2) is a hard constraint: the data flow is one-directional (CODE → FINDINGS → CONFIG·MEMORY → LLM). This change MUST NOT touch FINDINGS, CONFIG, MEMORY, embed, or any module outside the parser. Same source input MUST yield an identical component set across runs (determinism invariant).

## 2. Interface Delta

The `RenderFacts` interface at `pass1.ts:158` currently declares:

```ts
interface RenderFacts {
  hooks: string[];
  children: string[];
  markers: string[];
  conditionals: number;
}
```

After this change is applied it MUST declare:

```ts
interface RenderFacts {
  hooks: string[];
  children: string[];
  markers: string[];
  conditionals: number;
  returnsJsx: boolean;
}
```

The field MUST be named `returnsJsx` (camelCase, no alternative spelling). It MUST live on `RenderFacts`, not on `ComponentNode` or any other interface.

## 3. Requirements

### REQ-1 — JSX detection flag

The `collectRenderFacts` function MUST set `returnsJsx = true` on a function's `RenderFacts` if and only if at least one `JSXOpeningElement` node is visited anywhere within the function's walked body, including nodes nested inside `memo(...)` / `forwardRef(...)` / `lazy(...)` wrapper call arguments. The flag MUST default to `false` when no `JSXOpeningElement` is encountered.

### REQ-2 — Component admission guard

The parser MUST NOT admit as a component any capitalized function whose `RenderFacts.returnsJsx === false`. The guard MUST apply to all code-paths that call `walkComponent` — both `FunctionDeclaration` and `VariableDeclaration` branches.

### REQ-3 — forwardRef / memo wrappers preserved

The parser MUST continue to admit `forwardRef`- and `memo`-wrapped functions whose inner function body produces JSX. Because `collectRenderFacts` performs a flat recursive walk that descends into call-expression arguments, JSX inside `memo(() => <X/>)` or `forwardRef((props, ref) => <X/>)` MUST set `returnsJsx = true` on the outer node's facts, satisfying REQ-1 without special-casing.

### REQ-4 — Isolation: no cross-tier mutation

This change MUST NOT modify any behavior in: `embed.ts`, `shared-extraction.ts`, `engine.ts`, or any module outside `packages/core/src/parse/`. FINDINGS generation, CONFIG persistence, MEMORY update, and the embed vector pipeline MUST remain byte-for-byte identical to their pre-change state for any input that contains valid components.

### REQ-5 — Determinism

Identical source input MUST yield an identical set of admitted components across multiple invocations of `pass1`. The `returnsJsx` flag is a pure function of the AST; no randomness, no I/O side effects.

### REQ-6 — Existing test suite green

All 101 pre-existing tests MUST remain green after the change. No test expectation MAY be weakened or deleted to satisfy this requirement.

## 4. Acceptance Scenarios

### SC-1 — Next.js route handler is NOT a component

**Given** a `.ts` source file containing:
```ts
export const GET = async (req: Request): Promise<Response> => new Response("ok");
export const POST = async (req: Request): Promise<Response> => new Response("created");
export const DELETE = async (req: Request): Promise<Response> => new Response("deleted");
```
**When** `pass1` processes that file
**Then** `result.components` MUST be empty (length 0), and running the full `analyzeRepo` pipeline on a corpus of such route-handler files MUST produce zero `shared-extraction` findings.

### SC-2 — forwardRef component IS detected (regression guard)

**Given** a `.tsx` source file containing:
```tsx
export const MyInput = forwardRef((props: any, ref: any) => <input ref={ref} {...props} />);
```
**When** `pass1` processes that file
**Then** `result.components` MUST contain exactly one component with `name === "MyInput"` and `kind === "forwardRef"`.

### SC-3 — memo component IS detected

**Given** a `.tsx` source file containing:
```tsx
const Badge = memo(() => <span className="badge">•</span>);
```
**When** `pass1` processes that file
**Then** `result.components` MUST contain exactly one component with `name === "Badge"` and `kind === "memo"`.

### SC-4 — Plain JSX-returning function component is still detected

**Given** a `.tsx` source file containing:
```tsx
export function Header({ title }: { title: string }) {
  return <header><h1>{title}</h1></header>;
}
```
**When** `pass1` processes that file
**Then** `result.components` MUST contain exactly one component with `name === "Header"` and `kind === "fn"`.

### SC-5 — KNOWN/ACCEPTED residual: inline-helper arrow returning JSX

**Given** a `.tsx` source file where the outer function returns `null` but contains an inline helper arrow that returns JSX:
```tsx
export const Outer = () => {
  const renderItem = (x: string) => <li>{x}</li>;
  return null;
};
```
**When** `pass1` processes that file
**Then** `Outer` MAY be admitted as a component (because the flat walk visits `renderItem`'s JSX and sets `returnsJsx = true` on the outer facts). This is a known false-negative direction residual. It is ACCEPTED and SHALL NOT be treated as a defect for the purposes of this change.

### SC-6 — Existing test suite (regression)

**Given** the repository at HEAD with the change applied
**When** `pnpm test` runs the full Vitest suite
**Then** all 101 pre-existing tests MUST pass. No test failures attributable to this change are acceptable except the intentional fail-first test added as part of this change itself (which must be written red before the implementation lands).

## 5. Out of Scope

- React.createElement callers without JSX syntax: these may be dropped as non-components. Documented limitation; out of scope for this change.
- Framework-specific path exclusions (Option C): explicitly rejected; core MUST remain framework-agnostic (P6 invariant: `grep framework-name packages/core == 0`).
- Cardinality floor on empty fingerprints (Option A): treats the symptom, not the root cause; out of scope.
- Any change to `ComponentNode` shape, embed vector, or downstream finding schema.

## 6. Files in Scope

| File | Change type |
|---|---|
| `packages/core/src/parse/pass1.ts` | Production delta (RenderFacts + guard) |
| `packages/core/src/parse/pass1.test.ts` | New unit tests (fail-first TDD) |
| `fixtures/duplication/route-handlers/*.ts` | New fixture files |
| `fixtures/truepositives/forwardref-components/*.tsx` | New fixture files |
| `packages/core/src/engine/golden.test.ts` | New golden/end-to-end test |

No other files MAY be modified.
