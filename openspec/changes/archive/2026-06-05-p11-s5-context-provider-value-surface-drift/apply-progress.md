# Apply Progress: P11-S5 Context Provider Value-Surface Drift

## Status

Implementation complete. Ready for verify. Single PR with maintainer-approved size exception (600-line review budget waived for this change).

## Structured status consumed

- Native SDD status: `applyState` was reported `blocked` only due to ambiguous change selection across multiple active changes. The parent prompt resolved the active change to `p11-s5-context-provider-value-surface-drift`, so apply proceeded for that change.
- `actionContext.mode: repo-local`; `workspaceRoot` and `allowedEditRoots` = repo root. All edits are inside `packages/adapter-react/src`, `openspec/changes/p11-s5-...`, and `docs/`. No edits outside allowed roots. No `actionContext` warnings.
- Delivery decision (authoritative): SINGLE PR, size exception accepted. Phase 0 chaining tasks skipped.
- Strict TDD: active (`openspec/config.yaml` `strict_tdd: true`, runner `pnpm test && pnpm test:launcher`). Followed RED → GREEN → TRIANGULATE → REFACTOR.

## Completed tasks (persisted checkboxes updated in tasks.md)

- Phase 0: delivery decision recorded (single PR + size exception); chaining tasks marked N/A.
- Phase 1 (RED): full analyzer unit-test surface added; confirmed RED (suite failed to load — module missing).
- Phase 2 (GREEN): analyzer implemented; unit tests pass.
- Phase 3 (TRIANGULATE): edge-case/determinism/frozen/consumer/explanation tests added; all green.
- Phase 4 (RED/GREEN): adapter metadata + parsed TSX integration tests added (RED), then `core-adapter.ts` registration + `index.ts` exports wired (GREEN).
- Phase 5 (REFACTOR): catalog confirmed (no change), core boundary confirmed clean, docs updated, targeted + full verification run.

## Files changed

| File | Change | Lines |
|------|--------|-------|
| `packages/adapter-react/src/context-provider-value-surface-drift.ts` | New analyzer (factory, guards, correlation, classification, divergence, evidence, severity, SHA fingerprints, explain) | +737 |
| `packages/adapter-react/src/context-provider-value-surface-drift.test.ts` | New strict-TDD test suite (16 tests) | +505 |
| `packages/adapter-react/src/core-adapter.ts` | Register analyzer as 4th React analyzer | +2 |
| `packages/adapter-react/src/index.ts` | Export rule id + factory | +4 |
| `packages/adapter-react/src/core-adapter.test.ts` | Metadata (4th analyzer) + parsed TSX integration test | +40 |
| `openspec/changes/p11-s5-.../tasks.md` | Task checkboxes + notes | edits |
| `docs/STATUS.md` | P11-S5 status row + section + verification | edits |
| `docs/ROADMAP.md` | P11 row + delivered/deferred lists | edits |

Catalog `packages/adapter-react/src/catalog.ts`: confirmed `FACT_KINDS` already includes `call-binding`, `call-argument`, `jsx`, `jsx-attribute` — no change (as design predicted).
`@rai/core`: unchanged (boundary preserved; grep for analyzer id / adapter imports in `packages/core/src` returned nothing).

## TDD Cycle Evidence

| Cycle | Action | Test command | Result |
|-------|--------|--------------|--------|
| RED (analyzer) | Wrote 5 unit tests before implementation | `vitest run context-provider-value-surface-drift.test.ts` | FAIL — suite failed to load (`context-provider-value-surface-drift.js` missing) |
| GREEN (analyzer) | Implemented analyzer | same | 5/5 pass |
| TRIANGULATE | Added 11 edge/determinism/frozen/consumer/explain tests; fixed real bug (consumer args excluded by createContext-only filter → added `isConsumerArgumentFact`) | same | 16/16 pass |
| RED (wiring) | Added metadata (4th analyzer) + parsed-TSX integration tests before wiring | `vitest run core-adapter.test.ts` | FAIL — 2 tests (3 vs 4 analyzers; 0 findings) |
| GREEN (wiring) | Registered in `core-adapter.ts`, exported in `index.ts` | `vitest run core-adapter.test.ts context-provider-value-surface-drift.test.ts catalog.test.ts` | 26/26 pass |
| REFACTOR | Confirmed sorted copies / sortedUnique / stable span tokens / no frozen mutation; docs + catalog/boundary checks | full suite | green |

## Test commands run

- `npx vitest run packages/adapter-react/src/context-provider-value-surface-drift.test.ts` → 16/16
- `npx vitest run packages/adapter-react/src/core-adapter.test.ts packages/adapter-react/src/context-provider-value-surface-drift.test.ts packages/adapter-react/src/catalog.test.ts` → 26/26 (3 files)
- `pnpm test` → 62 files / 416 tests pass
- `pnpm test:launcher` → `go test ./...` ok (launcher cached, no failures)
- `pnpm typecheck` → all packages Done
- `pnpm build` → all packages Done
- `pnpm lint` → core framework-free guard pass
- `git diff --check` → clean

## Deviations from design

None. Followed design's correlation key `(file, localName)`, surface classification, divergence labels/tokens, severity (`info`/`warn`), evidence shape, fingerprint inputs, sorting, and explain envelope. Minor robustness detail: default-argument association accepts either `astPath.startsWith(<binding>.span.astPath + ">init")` or `spanContains(binding.span, arg.span)` (design's preferred + fallback), matching how `pass1` emits createContext arg facts.

## Remaining tasks

None. All tasks.md checkboxes for Phases 1–5 are `- [x]`; Phase 0 chaining tasks are `- [~]` (N/A under approved single PR).

## Workload / PR boundary

Single PR. Net additions ~1,288 lines (analyzer 737 + tests 505 + wiring 46) plus docs/spec/task edits. Above the 600-line review budget by approved size exception; not split.

## Next recommended

Run SDD verify (`pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `./scripts/smoke.sh --build`), then sync/archive. Then open a single PR (do not commit/push without explicit user request).
