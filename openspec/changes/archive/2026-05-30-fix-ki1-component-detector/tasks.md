# Tasks: fix-ki1-component-detector

## Review Workload Forecast
- Estimated changed lines: ~76 (4 edits to pass1.ts ~8 net lines; ~30 lines new tests; ~18 lines new fixtures ×6 files; ~5 lines docs)
- Chained PRs recommended: No
- 400-line budget risk: Low
- Decision needed before apply: No

## [x] T-1 — Create route-handler fixtures (NEW FILES)
**Satisfies**: SC-1, REQ-2
**Depends on**: nothing
**Parallel**: yes (can run with T-2)

Create `fixtures/duplication/route-handlers/` with three files — no JSX, capitalized names, arrow returning Response:
- `GET.ts`: `export const GET = async (req: Request): Promise<Response> => new Response("ok");`
- `POST.ts`: `export const POST = async (req: Request): Promise<Response> => new Response("created");`
- `DELETE.ts`: `export const DELETE = async (req: Request): Promise<Response> => new Response("deleted");`

## [x] T-2 — Create forwardRef true-positive fixtures (NEW FILES)
**Satisfies**: SC-2, REQ-3
**Depends on**: nothing
**Parallel**: yes (can run with T-1)

Create `fixtures/truepositives/forwardref-components/` with three `.tsx` files — each a named `forwardRef` component wrapping JSX:
- `Button.tsx`: `export const Button = forwardRef((props: any, ref: any) => <button ref={ref} {...props} />);`
- `IconButton.tsx`: `export const IconButton = forwardRef((props: any, ref: any) => <button ref={ref}><span>{props.icon}</span></button>);`
- `LinkButton.tsx`: `export const LinkButton = forwardRef((props: any, ref: any) => <a ref={ref} {...props} />);`

## [x] T-3 — Write FAILING unit test for route-handler rejection (RED gate)
**Satisfies**: SC-1, REQ-2, SC-6 (strict TDD ordering)
**Depends on**: T-1
**Parallel**: no (must run and confirm RED before T-4)

In `packages/core/src/parse/pass1.test.ts`, add a `describe("KI-1 fix")` block with:
- Test: reads one of the `GET.ts` fixtures via `fs.readFileSync`, calls `pass1(file, source)`, asserts `result.components.length === 0`.

Run `pnpm test` — the test MUST FAIL (red). Do not proceed to T-4 until failure is confirmed.

## [x] T-4 — Implement returnsJsx flag + walkComponent guard in pass1.ts
**Satisfies**: REQ-1, REQ-2, SC-1, SC-5
**Depends on**: T-3 (confirmed red)
**Parallel**: no

Four surgical edits to `packages/core/src/parse/pass1.ts`:
1. `:158` — `interface RenderFacts`: add `returnsJsx: boolean;` field.
2. `:164` — inside `collectRenderFacts`, add `let returnsJsx = false;` alongside other accumulator declarations.
3. `:177` — inside the existing `JSXOpeningElement` case: add `returnsJsx = true;` (one new line; existing `children.add` logic unchanged).
4. `:192` return statement — add `returnsJsx` to the returned object literal.
5. Inside `walkComponent` (after line `:31`, before line `:32`): add guard `if (!facts.returnsJsx) return; // KI-1: no JSX → not a component`.

After edits, run `pnpm test`. The T-3 test MUST turn GREEN. All pre-existing 101 tests MUST remain green.

## [x] T-5 — Write regression unit tests for true-positive cases (GREEN from the start)
**Satisfies**: SC-2, SC-3, SC-4, REQ-3, REQ-6
**Depends on**: T-4 (implementation green)
**Parallel**: no

In `packages/core/src/parse/pass1.test.ts`, within the same `describe("KI-1 fix")` block, add:
- SC-2 test: reads `Button.tsx` from T-2 fixtures, asserts `components.length === 1`, `name === "Button"`, `kind === "forwardRef"`.
- SC-3 test: inline source `const Badge = memo(() => <span className="badge">•</span>);` as `.tsx`, asserts `components.length === 1`, `kind === "memo"`.
- SC-4 test: inline source `export function Header({ title }: { title: string }) { return <header><h1>{title}</h1></header>; }` as `.tsx`, asserts `components.length === 1`, `name === "Header"`, `kind === "fn"`.

Run `pnpm test` — all three MUST be green immediately (implementation already in place).

## [x] T-6 — Write end-to-end golden test for route-handler corpus (NEW TEST)
**Satisfies**: SC-1 (full pipeline), REQ-4 (cosine-1.0 cascade severed)
**Depends on**: T-4, T-1
**Parallel**: no (needs both fixtures and implementation)

In `packages/core/src/engine/golden.test.ts`, add a test:
- Calls `analyzeRepo` with the `fixtures/duplication/route-handlers/` directory as the target corpus.
- Asserts the returned findings array has length 0 (zero `shared-extraction` findings).

NOTE (apply): read the existing `golden.test.ts` first and match its existing `analyzeRepo` invocation pattern (how it loads fixture sources, how it passes config/asOf). Do not invent a new call shape.

Run `pnpm test` — MUST be green.

## [x] T-7 — Full-suite gate: test + typecheck + build + smoke
**Satisfies**: REQ-6, SC-6
**Depends on**: T-3, T-4, T-5, T-6 (all green)
**Parallel**: no (final gate)

Run in order:
1. `pnpm test` — all 101 pre-existing + new tests green, zero failures.
2. `pnpm typecheck` — zero TypeScript errors.
3. `pnpm build` — clean build.
4. `./scripts/smoke.sh --build` — end-to-end smoke passes.

No step may be skipped. If any step fails, fix before proceeding to T-8.

## [x] T-8 — Docs/status updates
**Satisfies**: project traceability
**Depends on**: T-7 (full gate green)
**Parallel**: no

- `docs/superpowers/STATUS.md`: flip KI-1 entry from open/known-issue to fixed; reference `fix-ki1-component-detector`.
- `docs/gaps.md` §1.4: update the route-handler false-positive gap entry from "open" to "fixed in fix-ki1-component-detector".

NOTE (apply): confirm the §1.4 label/section hasn't shifted before editing; match the doc's existing heading.
