# Apply Progress: P11-S2 React Container/Presenter Role Divergence

## Status

Applied in strict TDD mode. No project-local or global strict-TDD support file was available, so the prompt contract was used.

## Completed tasks

- Created RED unit tests for `react/container-presenter-role-drift` before production implementation.
- Implemented `packages/adapter-react/src/container-presenter-role-drift.ts` as a pure adapter-owned analyzer over existing `RepoGraph` facts.
- Wired React adapter analyzer order as compound analyzer first and container/presenter analyzer second.
- Exported the new rule id and factory from `@rai/adapter-react`.
- Added adapter integration coverage proving normal analysis path emits the new rule for a divergent pair and stays silent for a healthy pair.
- Updated `docs/STATUS.md` and `docs/ROADMAP.md` after focused/full tests passed.
- Applied fresh-review fixes after the initial apply pass:
  - basename token role seeds now align with OpenSpec path-token wording for files like `src/user-container.tsx` and `src/profile-view.tsx`.
  - frozen-input coverage now passes frozen graph arrays directly into the analyzer.
  - tests now prove `childComponents` alone is insufficient without a `renders` edge.
  - hook-policy wording now says representative high-signal samples instead of exhaustive allowlist.
  - OpenSpec deferred-family requirement title is slice-scoped.
  - tasks now record that full payload with OpenSpec exceeds the active 1200-line budget.
- Preserved `packages/core/**` unchanged.

## Files changed

- `packages/adapter-react/src/container-presenter-role-drift.ts`
- `packages/adapter-react/src/container-presenter-role-drift.test.ts`
- `packages/adapter-react/src/core-adapter.ts`
- `packages/adapter-react/src/core-adapter.test.ts`
- `packages/adapter-react/src/index.ts`
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `openspec/changes/p11-s2-react-pattern-analyzers/apply-progress.md`

Existing SDD files under `openspec/changes/p11-s2-react-pattern-analyzers/` were read and left intact except for this progress file.

## TDD Cycle Evidence

| Cycle | Phase | Evidence | Result |
|---|---|---|---|
| 1 | RED | Wrote `container-presenter-role-drift.test.ts` and updated `core-adapter.test.ts` before creating the analyzer module. Ran `pnpm test packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/core-adapter.test.ts`. | Failed as expected: Vitest could not load `./container-presenter-role-drift.js`; 2 suites failed, 0 tests collected. |
| 2 | GREEN | Added `container-presenter-role-drift.ts`, wired `core-adapter.ts`, and exported from `index.ts`. Ran focused tests. | Passed: 2 files / 15 tests. |
| 3 | TRIANGULATE | Ran full Vitest suite after focused pass. | Passed: 60 files / 377 tests. |
| 4 | REFACTOR | Reviewed deterministic helpers, path seed policy, evidence naming, and core boundary. No broad refactor needed after focused/full pass. Ran full target `pnpm test && pnpm test:launcher`. | Passed: Vitest 60 files / 377 tests; Go launcher tests passed. |
| 5 | VERIFY | Ran build, typecheck, lint-equivalent, and diff checks. | Passed with note: direct `pnpm lint` under RTK wrapper returned exit 254, but raw `node scripts/check-core-framework-free.mjs` and `rtk proxy pnpm lint` passed. |
| 6 | REVIEW FIX | After fresh review, added failing coverage for basename path tokens and true frozen arrays, then updated implementation/tests/OpenSpec task notes. | Passed: focused adapter tests 2 files / 16 tests; full `pnpm test && pnpm test:launcher`; `pnpm typecheck`; `pnpm build`; `rtk proxy pnpm lint`; `git diff --check`. |
| 7 | SMOKE | Added container/presenter CLI coverage to `scripts/smoke.sh` after confirming the prior smoke script did not assert the new rule. | Passed: `./scripts/smoke.sh --build`, including `react/container-presenter-role-drift`; 18 passed, 0 failed. |

## Commands run

| Command | Exit | Summary |
|---|---:|---|
| `pnpm test packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | 1 | RED: expected missing module failure for `./container-presenter-role-drift.js`. |
| `pnpm test packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | 0 | GREEN: 2 files / 15 tests passed. |
| `pnpm typecheck` | 0 | Workspace build + TypeScript no-emit checks passed. |
| `pnpm test` | 0 | Full Vitest pass: 60 files / 377 tests. |
| `pnpm test && pnpm test:launcher` | 0 | Full Vitest pass: 60 files / 377 tests; Go launcher tests passed. |
| `pnpm build` | 0 | Workspace build passed. |
| `pnpm lint` | 254 | RTK-wrapped run reported `[warn] Linter process terminated abnormally (possibly out of memory)` before project script output. |
| `node scripts/check-core-framework-free.mjs` | 0 | Raw lint script passed. |
| `rtk proxy pnpm lint` | 0 | Raw `pnpm lint` through RTK proxy passed: `node scripts/check-core-framework-free.mjs`. |
| `git diff --check` | 0 | No whitespace errors. |
| `pnpm test packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | 0 | Review-fix focused pass: 2 files / 16 tests. |
| `pnpm typecheck` | 0 | Review-fix TypeScript checks passed. |
| `pnpm test && pnpm test:launcher` | 0 | Review-fix full Vitest pass: 60 files / 378 tests; Go launcher tests passed. |
| `pnpm build` | 0 | Review-fix workspace build passed. |
| `rtk proxy pnpm lint` | 0 | Review-fix raw lint passed: `node scripts/check-core-framework-free.mjs`. |
| `git diff --check` | 0 | Review-fix whitespace check passed. |
| `./scripts/smoke.sh --build` | 0 | Smoke pass after adding container/presenter CLI coverage: 18 passed, 0 failed. |

## Deviations from design

- No production or test changes were made under `packages/core/**`.
- No CLI production changes were needed; adapter integration coverage proved normal analysis path composition.
- No fixture files were added; inline source fixtures in `core-adapter.test.ts` were sufficient.
- Path-segment role seeds are evaluated from normalized directory tokens and qualified basename tokens. Basename token matches require at least one non-role qualifier token, so `src/user-container.tsx` and `src/profile-view.tsx` match while exact `Container.tsx`, `Presenter.tsx`, and `View.tsx` stay silent.

## Remaining tasks

- Run a fresh post-fix review/verify phase.
- Final delivery strategy resolved: maintainer approved a larger single-change size exception for the full relevant payload with OpenSpec.
- Archive/sync OpenSpec only after SDD verify approval and delivery strategy decision.
- Parent should persist memory observations because Engram tools were unavailable in the apply executor.

## Workload / PR boundary

- Resolved delivery path for implementation: `exception-ok`, `single-pr`, active 1200 changed-line review budget.
- Post-review-fix relevant payload estimate excluding unrelated/scratch files: 2,164 additions + 21 deletions = 2,185 changed lines when OpenSpec artifacts are included.
- This exceeds the active 1200-line PR budget. Maintainer approved explicit larger size exception for a single large change.
- No `packages/core/**` diff was introduced.
