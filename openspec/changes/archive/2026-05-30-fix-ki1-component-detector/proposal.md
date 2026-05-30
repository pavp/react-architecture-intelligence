# Proposal: fix-ki1-component-detector

**Intent**: Stop the deterministic parser from admitting capitalized non-components (e.g. Next.js route handlers) as React components, eliminating the KI-1 HIGH-severity false positive.

## Motivation

KI-1 is a field-reproduced false positive on a real 477-file repo. `packages/core/src/parse/pass1.ts:10` uses `COMPONENT_NAME = /^[A-Z]/` as the SOLE test for component-hood. A capitalized non-component such as a Next.js route handler — `export const GET = async (req) => new Response()` — passes both the name test (line 63) and `arrowKind` (lines 108-115 accept arrow / function / `memo` / `forwardRef` call expressions). These handlers are admitted as components.

**The cosine-1.0 cascade.** Such a "component" has all 5 structural sets empty and `conditionalBranches = 0`, so `embedComponent` (`embed.ts`) produces a zero `Float32Array`. `l2normalize` returns it unchanged (`embed.ts:43` — `if (norm === 0) return v;`). `jaccardSets` returns `1` on an empty union (`shared-extraction.ts:100`). Every empty component therefore collapses to one structural fingerprint, clusters at cosine `1.0`, and satisfies the boolean-AND predicate trivially — so `shared-extraction` fires a false positive at cosine `1.0`.

This blocks real Next.js usage today: any repo with 2+ route handlers produces a phantom shared-component finding.

## Proposed approach — Option B (`returnsJsx` flag)

During the AST walk in `collectRenderFacts` (`pass1.ts:160-198`), set a `returnsJsx` flag when the existing `JSXOpeningElement` case (line 177) fires, and skip admitting any component whose `returnsJsx === false`. This is ~8 net lines in `pass1.ts`.

**Root cause, not symptom.** The defect is that the parser equates "capitalized name + arrow" with "component." Option B adds the missing necessary condition — that the function actually produces JSX.

**Why B over A and C:**

- **Option A** (cardinality floor — reject clusters of empty fingerprints) treats the SYMPTOM. Empty non-components would still be admitted as components; only the downstream finding would be suppressed, and other empty-fingerprint pairings could still leak.
- **Option C** (`excludeGlob` on route directories) is framework-specific masking. It hardcodes Next.js path conventions into core, violating the P6 invariant `grep framework-name packages/core == 0`, and misses route handlers placed outside conventional paths.

## Scope

| File | Change | Est. lines |
|------|--------|------------|
| `packages/core/src/parse/pass1.ts` | Add `returnsJsx` flag + skip guard | +8 |
| `packages/core/src/parse/pass1.test.ts` | 2 tests (FP fail-first, forwardRef regression) | +20 |
| `fixtures/duplication/route-handlers/*.ts` | 3 capitalized handlers returning `Response`, no JSX | +18 |
| `fixtures/truepositives/forwardref-components/*.tsx` | 3 `forwardRef` components wrapping JSX | +15 |
| `packages/core/src/engine/golden.test.ts` | Golden: route handlers yield 0 findings | +15 |
| **Total** | | **~76** |

Single, reviewable PR. No chaining needed.

## Non-goals / boundaries

- **Integrity model (design §1.2).** Option B operates PURELY in the CODE tier (the deterministic parser). It changes what the parser admits as a component — same code in ⇒ same components out. It MUST NOT touch FINDINGS mutability, CONFIG, MEMORY, or the one-directional `CODE → FINDINGS → (CONFIG clamp · MEMORY weight) → LLM` flow.
- No framework-specific logic in core (P6 invariant preserved).
- Not fixing the inline-helper-arrow residual false-negative (documented below, safe direction).
- Not addressing `React.createElement`-without-JSX callers (documented limitation, negligible in idiomatic React).

## Risks + mitigations

1. **forwardRef / memo regression** — MITIGATED. The flat walk in `collectRenderFacts` recurses into wrapper-call arguments with no function-boundary tracking, so JSX inside `memo(forwardRef(() => <div/>))` sets `returnsJsx = true` on the outer wrapper. Regression is guarded by a `forwardRef` true-positive fixture.
2. **Inline-helper-arrow leak** — a component with an inline helper arrow returning JSX while the outer body returns `null` would keep `returnsJsx = true`. This is a false-NEGATIVE (component kept incorrectly), not a false positive, and is rare given top-level-body-only detection. Low severity, safe direction.
3. **`React.createElement` callers without JSX** — dropped as non-components. Negligible in idiomatic React. Documented, does not block.

## Rollback

Single-file logic revert. The flag is additive and the behavior change sits behind one guard line. Reverting `pass1.ts` restores prior behavior with zero schema or state migration.

## Exit criteria (RFC 2119)

- The route-handler corpus MUST yield 0 findings.
- A `forwardRef` component MUST still be detected.
- All 101 existing tests MUST stay green.
- Typecheck and build MUST be clean.
- Strict TDD: the route-handler false-positive test MUST be written failing first.

## Test plan (TDD — Strict TDD active; Vitest, `pnpm test`)

1. **Fail-first:** route-handler false-positive fixture — `pass1("route.ts", src)` returns 0 components.
2. **Regression:** `forwardRef` true-positive fixture — the component IS detected.
3. **End-to-end golden:** route handlers through `analyzeRepo` yield 0 findings.

## Notes for spec/design (field-name precision)

The `RenderFacts` interface (`pass1.ts:158`) uses parser-layer field names `hooks / children / markers / conditionals`, distinct from the embed-layer names `childComponents / compositionMarkers / conditionalBranches`. The spec and design MUST pin the exact field name for the new flag (`returnsJsx`) and confirm it lives on `RenderFacts`, so apply does not guess.
