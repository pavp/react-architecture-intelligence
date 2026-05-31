# release-ci-typecheck-fix Apply Progress

## Mode

Strict TDD

## Completed Tasks

- [x] 1.1 Add regression coverage that root `typecheck` builds workspace declarations before package typechecking.
- [x] 1.2 Change root `typecheck` to run topological workspace builds before topological typechecks.
- [x] 1.3 Verify `pnpm typecheck` succeeds from a clean package `dist` state.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 1.2 | `packages/cli/src/governance-automation.test.ts` | Unit | ✅ `rtk vitest packages/cli/src/governance-automation.test.ts` → 3 pass | ✅ Added script-contract assertion; failed against `pnpm -r typecheck` | ✅ Updated `package.json`; test file 4 pass | ➖ Single structural contract; exact expected script only | ➖ None needed |
| 1.3 | Command verification | Integration | N/A | ✅ Cleaned package `dist` before command | ✅ `pnpm typecheck` rebuilt declarations and passed all package typechecks | ➖ Single CI reproduction path | ➖ None needed |

## Test Summary

- Total tests written: 1
- Total tests passing: 4 in `packages/cli/src/governance-automation.test.ts`
- Layers used: Unit (1 regression), Integration (clean-dist command verification)
- Approval tests: None — no behavior refactor task
- Pure functions created: 0

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `package.json` | Modified | Root `typecheck` now builds workspaces in dependency order before typechecking. |
| `packages/cli/src/governance-automation.test.ts` | Modified | Added regression assertion for CI-safe typecheck script. |
| `openspec/changes/release-ci-typecheck-fix/proposal.md` | Created | Captured incident scope and non-goals. |
| `openspec/changes/release-ci-typecheck-fix/design.md` | Created | Documented topological build-before-typecheck decision. |
| `openspec/changes/release-ci-typecheck-fix/tasks.md` | Created | Marked apply tasks complete. |
| `openspec/changes/release-ci-typecheck-fix/apply-progress.md` | Created | Persisted strict TDD apply evidence. |

## Deviations from Design

None — implementation matches design.

## Issues Found

- Root `pnpm typecheck` previously depended on stale local `dist` output; clean CI exposed missing declaration files.

## Workload / PR Boundary

- Mode: single PR
- Current work unit: release CI typecheck fix
- Boundary: root script + regression test + SDD artifacts only
- Estimated review budget impact: Low; well below 800-line budget.

## Status

3/3 tasks complete. Ready for verify.
