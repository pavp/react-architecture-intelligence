# Exploration — fix-ki1-component-detector

**Change:** `fix-ki1-component-detector`
**Phase:** explore
**Status:** done
**Approach (pre-decided):** Option B — `returnsJsx` guard in `pass1`

## Executive summary

Option B (add a `returnsJsx` flag in `collectRenderFacts`, filter non-JSX functions before emitting them as components) is validated, safe, and small: ~76 changed lines across one core file plus new tests and fixtures. Single PR, well within the 400-line budget.

## The bug (KI-1, field-reproduced, HIGH)

`packages/core/src/parse/pass1.ts:10` defines `COMPONENT_NAME = /^[A-Z]/` and uses it as the SOLE admission test for "is this a React component" (used at `:58` and `:63`). It does not require the function to return JSX. Next.js route handlers (`GET`/`POST`/`PUT`/`DELETE`) are `(req) => Response` functions — capitalized, with 0 props/0 hooks/0 JSX/0 markers/0 conditionals. They collapse to ONE empty structural fingerprint and `shared-extraction` fires a false positive at cosine 1.0. Reproduced on a real 477-file Next.js repo: 1 true positive + 1 false positive (route handlers).

## Key findings (with line refs)

`pass1.ts` detection logic:
- `:10` `COMPONENT_NAME = /^[A-Z]/` — sole admission criterion
- `:11` `HOOK_NAME = /^use[A-Z0-9]/`
- `:58` `FunctionDeclaration` path → `COMPONENT_NAME.test(s.id.name)` → `walkComponent()`
- `:63` `VariableDeclaration` path → `COMPONENT_NAME.test(d.id.name)` AND `arrowKind(d.init) !== null` → `walkComponent()`
- `:108-115` `arrowKind()` returns non-null for `ArrowFunctionExpression`, `FunctionExpression`, and `CallExpression` whose callee is `memo` or `forwardRef`
- `:160-198` `collectRenderFacts()` — flat recursive visitor; already handles `JSXOpeningElement` at `:177` (for child component names). This is the insertion point for `returnsJsx`.
- `:158` `RenderFacts` interface — add `returnsJsx: boolean`
- `:192` return value — add `returnsJsx`

Zero-vector cosine cascade (why empty components hit cosine 1.0):
- `embedComponent()` produces a zero `Float32Array` when all 5 structural fields are empty
- `l2normalize()` returns the zero vector unchanged (norm=0 guard, `embed.ts:43`)
- `jaccardSets()` returns 1 when `uni.size === 0` (`shared-extraction.ts:108`)
- empty-fingerprint components cluster trivially → `isOpportunity` true → false positive

## forwardRef / memo edge case — SAFE under the flat walk

`collectRenderFacts` is entirely flat (no function-boundary tracking). For `memo(forwardRef(({x}, ref) => <div/>))` the visitor recurses through the CallExpression chain into the inner arrow body and finds `JSXOpeningElement` → `returnsJsx = true` on the outer wrapper. Correct. The flat walk is an asset here.

Only genuine false-NEGATIVE risk: an inline helper arrow (`const Icon = () => <span/>; return null;`) sets `returnsJsx = true` even though the outer function returns null. Low severity — keeps a non-component in the graph rather than dropping a real one (safe direction). Route handlers have zero JSX anywhere in their files, so the primary target is unaffected.

## Implementation shape (minimum change)

- `RenderFacts` interface (`:158`): add `returnsJsx: boolean`
- `collectRenderFacts` body: `let returnsJsx = false;`
- existing `JSXOpeningElement` case (`:177`): add `returnsJsx = true;`
- return (`:192`): add `returnsJsx`
- call site in `body.forEach` (between `arrowKind` check and `walkComponent`): guard `if (!facts.returnsJsx) return;`

~8 net new lines in `pass1.ts`.

## Downstream consumers — all safe

- `buildGraph()` (`graph-build.ts:8-31`) — flat collector, no special casing
- `RepoGraph` renders edges use JSX child names; route handlers never appear as JSX children
- `sharedExtraction.analyze()` — fewer components = fewer candidates; predicate unchanged
- `embedComponent()`, `structuralFingerprint()`, `FindingsStore`, `FeedbackStore` — unaffected by which components are admitted

## Test fixture plan

New fixture dirs:
- `fixtures/duplication/route-handlers/GET.ts`, `POST.ts`, `DELETE.ts` — capitalized, no JSX, return `Response`
- `fixtures/truepositives/forwardref-components/Button.tsx`, `IconButton.tsx`, `LinkButton.tsx` — forwardRef wrapping JSX

New tests:
- `pass1.test.ts`: "route handler with no JSX is NOT detected as a component" (fails before fix)
- `pass1.test.ts`: "forwardRef component WITH JSX IS detected" (regression guard)
- `golden.test.ts`: "route-handler corpus yields 0 findings from analyzeRepo" (end-to-end guard)

All 101 existing tests use JSX-returning components and should stay green.

## Estimated change size

~76 lines total. Single PR.

| File | Change |
|------|--------|
| `packages/core/src/parse/pass1.ts` | +8 |
| `packages/core/src/parse/pass1.test.ts` | +20 |
| `fixtures/duplication/route-handlers/*.ts` | +18 (3 files) |
| `fixtures/truepositives/forwardref-components/*.tsx` | +15 (3 files) |
| `packages/core/src/engine/golden.test.ts` | +15 |

## Risks

1. `React.createElement` callers with no JSX syntax are dropped as non-components. Document as known limitation; don't block. (Modern TSX usage: negligible.)
2. Inline helper arrows containing JSX leak `returnsJsx=true` to the outer function — a false-negative (component kept), safe direction. Can be tightened later with depth tracking.
3. All existing tests pass unmodified (all fixtures return JSX).

## Next recommended

`sdd-propose`
