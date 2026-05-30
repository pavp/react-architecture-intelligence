# Apply Progress: fix-ki1-component-detector

**Status:** done (all 8 tasks)
**Branch:** feat/rai-mvp-p0-p3 (committed, not pushed, no PR)
**Mode:** Strict TDD (RED → GREEN confirmed)

## Tasks

| Task | Status | Notes |
|------|--------|-------|
| T-1 | done | `fixtures/duplication/route-handlers/{GET,POST,DELETE}.ts` |
| T-2 | done | `fixtures/truepositives/forwardref-components/{Button,IconButton,LinkButton}.tsx` |
| T-3 | done | RED confirmed: `expected 1 to be 0`; 101 pre-existing stayed green |
| T-4 | done | 4 edits + guard inside `walkComponent` (chokepoint); T-3 → GREEN |
| T-5 | done | SC-2 forwardRef / SC-3 memo / SC-4 fn — green immediately |
| T-6 | done | golden: route-handler corpus → 0 findings |
| T-7 | done | all four gates green (below) |
| T-8 | done | KI-1 flipped in STATUS.md + gaps.md §1.4 |

## Final gate (verbatim)

- `pnpm test` → `Test Files 23 passed (23)` / `Tests 106 passed (106)`
- `pnpm typecheck` → packages/core Done, packages/cli Done
- `pnpm build` → packages/core Done, packages/cli Done
- `./scripts/smoke.sh --build` → `Result: 13 passed, 0 failed`

## Commits

- `974d386` — `fix(parse): add returnsJsx guard to pass1 — KI-1 route-handler false positives`
- `80ed6a8` — `docs: mark KI-1 fixed in STATUS.md and gaps.md`

## Implementation fidelity

- `returnsJsx` added to `RenderFacts` ONLY (parser layer). `ComponentNode`, `embed.ts`, `shared-extraction.ts`, `engine.ts` behavior byte-identical (REQ-4 isolation held).
- Guard `if (!facts.returnsJsx) return;` placed inside `walkComponent` before `components.push` — single chokepoint covering both FunctionDeclaration and VariableDeclaration paths (per design, NOT the `body.forEach` sites).
- pass1.ts: 5 insertions, 1 deletion. Total change ~57 insertions across 9 files (under 400 budget).

## Residual (accepted, per spec SC-5)

Inline-helper-arrow returning JSX while outer returns null → component still admitted. False-negative direction, non-empty embedding, cannot resurrect KI-1 cascade. Deferred (needs depth/scope tracking).

## Independent orchestrator verification

git log + `git show 974d386` confirmed: correct branch, no AI attribution, pass1.ts diff matches design exactly, parser-only change. Working tree clean of source changes.

## Next recommended

`sdd-verify`
