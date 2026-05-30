# Design: fix-ki1-component-detector

**Approach (FIXED): Option B — `returnsJsx` necessary condition.**

Add `returnsJsx: boolean` to `RenderFacts`, set it from the existing `JSXOpeningElement` visit in the flat `collectRenderFacts` walk, and add one early-return guard inside `walkComponent` so a capitalized function with `returnsJsx === false` is never emitted as a component. Confined to the CODE tier deterministic parser: no framework strings, no write into FINDINGS / CONFIG / MEMORY, one-directional flow unchanged.

---

## 1. Exact change site + mechanics

All line numbers verified against the current `packages/core/src/parse/pass1.ts`:

| Line | What is there now |
|---|---|
| `:10` | `const COMPONENT_NAME = /^[A-Z]/` — the sole component-hood test today |
| `:31` | `const facts = collectRenderFacts(node)` **inside `walkComponent`** |
| `:32-44` | `components.push({...})` — the single admission point both paths funnel through |
| `:58-60` | `FunctionDeclaration` admission → calls `walkComponent` |
| `:61-67` | `VariableDeclaration` admission → `arrowKind(d.init)` then `walkComponent` |
| `:108-115` | `arrowKind()` accepts arrow / function / `memo(...)` / `forwardRef(...)` |
| `:158` | `interface RenderFacts { hooks; children; markers; conditionals; }` |
| `:160-198` | `collectRenderFacts()` flat recursive visitor over all object keys |
| `:177-181` | existing `JSXOpeningElement` case (currently only feeds `children`) |
| `:192-197` | `return { hooks, children, markers, conditionals }` |

### Four edits (~8 net lines)

1. **`:158`** — add `returnsJsx: boolean` to the `RenderFacts` interface.
2. **`:164`** — declare `let returnsJsx = false;` alongside the existing accumulators (`hooks`, `children`, `markers`, `conditionals`).
3. **`:177` case** — add `returnsJsx = true;` inside the existing `JSXOpeningElement` case. This REUSES the same case that already fires on the first JSX opening element. The existing `children.add(...)` logic is untouched; we only OR in the flag.
4. **`:192` return** — add `returnsJsx` to the returned object.

### Guard placement (refines the proposal's "admission call site")

The guard goes **inside `walkComponent`**, immediately after `:31` and before the `components.push` at `:32`:

```ts
const facts = collectRenderFacts(node);
if (!facts.returnsJsx) return; // KI-1: capitalized non-component (no JSX) is not a component
components.push({ /* ... */ });
```

**Why here, not at the `body.forEach` call sites:** `collectRenderFacts` is invoked *inside* `walkComponent` (`:31`), not at the two admission sites (`:59`, `:65`). Both admission paths — `FunctionDeclaration` and `VariableDeclaration`/arrow/`memo`/`forwardRef` — call `walkComponent`. A single guard there covers BOTH with no duplication. Guarding at the two `forEach` sites would require either recomputing `collectRenderFacts` or duplicating the guard line. One chokepoint = minimal blast radius and a single-line revert.

---

## 2. The flat-walk invariant for forwardRef/memo

`collectRenderFacts` (`:166-190`) has **no function-boundary tracking**. The `visit` closure recurses into every own key of every node (`:186-189`), regardless of function nesting.

For `memo(forwardRef(({ x }, ref) => <div>{x}</div>))`:
- The node handed to `walkComponent` is the outer `CallExpression` (`memo(...)`).
- The walk descends `callee` → `arguments` → inner `forwardRef(...)` → its argument arrow → arrow body → reaches the inner `JSXOpeningElement`.
- The `:177` case fires → `returnsJsx = true` on the outer wrapper.

**Determinism boundary:** `returnsJsx` is a pure function of the AST subtree — no external state, no ordering dependence (it is a boolean OR over all JSX hits in the subtree). **Same code in ⇒ same components out.** This is precisely why wrapper-wrapped components are correct WITHOUT any special `memo`/`forwardRef` handling in the guard. Locked by a `forwardRef` true-positive regression fixture.

---

## 3. Persistence / write-direction invariant (design §1.2)

This change lives entirely in the **CODE tier deterministic parser**. It:

- MUST NOT introduce any write into FINDINGS / CONFIG / MEMORY.
- MUST NOT add framework-specific logic to core (P6 invariant `grep framework-name packages/core == 0`). `returnsJsx` is a generic JSX-presence signal — zero framework strings, no path conventions, no `next`/`remix`/etc.
- Does NOT alter the one-directional `CODE → FINDINGS → (CONFIG · MEMORY) → LLM` flow.

Reducing the set of admitted components only shrinks the input to `buildGraph` / `sharedExtraction`. No schema change, no state migration, no downstream write-direction change.

---

## 4. The known residual (inline-helper-arrow)

```ts
const Widget = () => {
  const Icon = () => <span/>;  // nested closure returns JSX
  return null;                 // outer function renders nothing
};
```

The flat walk sees `Icon`'s `JSXOpeningElement` → `returnsJsx = true` → `Widget` is kept even though it renders `null`.

- **Why it happens:** the flat walk has no function-boundary scoping; it cannot tell outer-function JSX from nested-closure JSX.
- **Why it is SAFE:** this is a **false-negative direction** (a non-rendering function retained), NOT a false positive. It cannot resurrect the KI-1 cosine-1.0 cascade, because such a component is non-empty — it carries JSX/`children` facts, so its embedding is non-zero and it will not trivially cluster at cosine 1.0.
- **Why fixing it now is out of scope:** tightening requires depth/scope tracking in `visit` — distinguishing depth-0 (outer body) JSX from nested-closure JSX, or detecting JSX in return/implicit-return position. That is a structurally larger visitor change, not the ~8-line targeted fix.
- **Future tightening path:** track function-nesting depth in `visit` and only set `returnsJsx` for outer (depth-0) JSX, or analyze return-position JSX specifically. Deferred.

---

## 5. Field-name correctness (two distinct layers)

| Layer | Type / site | Fields |
|---|---|---|
| Parser | `RenderFacts` (`:158`) | `hooks`, `children`, `markers`, `conditionals`, **+ new `returnsJsx`** |
| Embed / graph | `ComponentNode` (mapped at `:40-43`) | `hookCalls`, `childComponents`, `compositionMarkers`, `conditionalBranches` |

`returnsJsx` is a **parser-only admission signal**. It is consumed by the guard inside `walkComponent` and is **NOT** added to `ComponentNode`, nor propagated to the embed/shared-extraction layer. Apply MUST use the parser names (`hooks`/`children`/`markers`/`conditionals`/`returnsJsx`) inside `collectRenderFacts`/`RenderFacts`, and MUST NOT touch the embed-layer names (`childComponents`/`compositionMarkers`/`conditionalBranches`).

---

## 6. Test boundary (Strict TDD active — Vitest, `pnpm test`)

| Test file | Layer | Assertion |
|---|---|---|
| `packages/core/src/parse/pass1.test.ts` | UNIT (component admission) | (a) **fail-first** route-handler fixture → `pass1(...).components.length === 0`; (b) `forwardRef` true-positive → component IS detected |
| `packages/core/src/engine/golden.test.ts` | END-TO-END | route-handler corpus through `analyzeRepo` → **0 findings** (proves the cosine-1.0 cascade is severed at the source) |

**Strict TDD ordering:** write the route-handler UNIT test FIRST and watch it FAIL (today `arrowKind` + name admit the handler), THEN apply the `returnsJsx` flag and guard so it goes green. The forwardRef regression and golden end-to-end follow.

---

## Affected files

| File | Change |
|---|---|
| `packages/core/src/parse/pass1.ts` | `returnsJsx` on `RenderFacts` (`:158`); `let returnsJsx = false` (`:164`); set in JSX case (`:177`); add to return (`:192`); guard `if (!facts.returnsJsx) return;` in `walkComponent` (after `:31`) |
| `packages/core/src/parse/pass1.test.ts` | 2 tests (fail-first FP, forwardRef regression) |
| `fixtures/duplication/route-handlers/*.ts` | 3 capitalized handlers returning `Response`, no JSX |
| `fixtures/truepositives/forwardref-components/*.tsx` | 3 `forwardRef` components wrapping JSX |
| `packages/core/src/engine/golden.test.ts` | 1 golden: route handlers → 0 findings |

---

## ADR

- **Decision:** add a necessary-condition guard (`returnsJsx`) at the single `walkComponent` chokepoint.
- **Rejected alternatives:**
  - *Cardinality floor (reject clusters of empty fingerprints):* treats the SYMPTOM; empty non-components stay admitted, other empty-fingerprint pairings can still leak.
  - *`excludeGlob` on route directories:* framework-specific masking; hardcodes path conventions into core (violates P6 invariant), misses handlers outside conventional paths.
  - *Per-call-site guards at the two `body.forEach` sites:* duplication and/or fact recomputation; larger surface, two revert points.
- **Why:** root cause — the parser equated "capitalized name + arrow" with "component." Option B adds the missing necessary condition ("the function actually produces JSX") deterministically, behind one revertible guard line.
