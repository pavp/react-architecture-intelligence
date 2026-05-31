# Apply Progress: P8-S3a Repository Workflow Policy

## Mode

Strict TDD.

## Completed Tasks

- [x] 1.1 Add failing Vitest temp-root cases for missing `docs/repository-workflow.md` and incomplete main trunk/tag policy snippets.
- [x] 1.2 Add failing checklist-link case requiring P8-S3a/P8-S3b branch, tag, and publish gates.
- [x] 1.3 Add failing cases for branch naming, commit naming, PR title, PR template policy, GoReleaser/manual tag authority, no `semantic-release`, and P8-S3c automation deferral.
- [x] 2.1 Extend release validator with deterministic workflow/checklist checks.
- [x] 2.2 Keep validator read-only; no branch, default-branch, tag, remote, secret, or publish mutation.
- [x] 2.3 Extend checks for naming policy, PR template completion, GoReleaser/manual tag authority, no new dependencies, no `semantic-release`, and future P8-S3c CI-preferred enforcement.
- [x] 3.1 Create `docs/repository-workflow.md`.
- [x] 3.2 Update `docs/release-maintainer-checklist.md`.
- [x] 3.3 Revise workflow/checklist/status/roadmap docs for explicit branch/commit/PR-title/template policy and automation deferral; do not add dependencies or semantic-release.
- [x] 4.1 Split P8-S3a/S3b in `openspec/changes/p8-single-binary-distribution/tasks.md`.
- [x] 4.2 Sync `openspec/changes/p8-single-binary-distribution/tasks.md` Phase 5 with S3a naming/automation deferral and S3b real publish gates.
- [x] 4.3 Verify release check, tests, typecheck, lint, and diff whitespace.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `packages/cli/src/release-config.test.ts` | Unit | ✅ 3/3 baseline | ✅ Missing workflow and incomplete policy tests failed | ✅ 6/6 focused tests pass | ✅ Missing doc + incomplete main/tag snippets | ✅ Extracted snippet arrays in validator |
| 1.2 | `packages/cli/src/release-config.test.ts` | Unit | ✅ 3/3 baseline | ✅ Checklist gate test failed | ✅ 6/6 focused tests pass | ✅ P8-S3a/S3b plus branch/tag protection snippets | ✅ Kept read-only validation path |
| 1.3 | `packages/cli/src/release-config.test.ts` | Unit | ✅ 6/6 focused baseline | ✅ Naming/automation test failed before validator snippets | ✅ 7/7 focused tests pass | ✅ Branch, commit, PR title, PR template, scope, GoReleaser, no semantic-release, no dependencies, P8-S3c deferral snippets | ✅ Kept deterministic string checks |
| 2.1-2.3 | `packages/cli/src/release-config.test.ts` | Unit | ✅ 6/6 baseline before extension | ✅ New policy tests red before implementation | ✅ 7/7 focused tests pass | ✅ Actual repo `pnpm release:check` passes after docs | ✅ Pure snippet checks, no shell/git mutation |
| 3.1-3.3 | `packages/cli/src/release-config.test.ts` + docs | Docs/Unit | ✅ Focused tests protected current release config | ✅ Actual repo failed until docs contained required naming/automation policy | ✅ `pnpm release:check` passes | ✅ Workflow doc + checklist + status/roadmap alignment | ✅ Cognitive-doc quick path/tables/checklists |
| 4.1-4.3 | `packages/cli/src/release-config.test.ts` + OpenSpec | Docs/Unit | ✅ Focused tests and release check green before OpenSpec sync | ✅ S3a naming/automation split absent before tasks update | ✅ Verification commands passed | ✅ Active P8 tasks and P8-S3a tasks aligned | ✅ Progress persisted in filesystem and Engram |

## Test Summary

- **Total tests written**: 4 new Vitest tests.
- **Total tests passing**: 7 focused release-config tests; full-suite verification recorded below.
- **Layers used**: Unit and docs validation.
- **Approval tests**: None — no refactoring-only task.
- **Pure functions created**: 0; extended existing pure read-only validator.

## Verification

- `rtk vitest packages/cli/src/release-config.test.ts --run` — RED: 3 expected failures after new tests.
- `rtk vitest packages/cli/src/release-config.test.ts --run` — GREEN: 6 passing focused tests.
- `rtk vitest packages/cli/src/release-config.test.ts --run` — RED: naming/automation deferral test failed before validator/docs updates.
- `rtk vitest packages/cli/src/release-config.test.ts --run` — GREEN: 7 passing focused tests.
- `pnpm release:check` — pass.
- `pnpm typecheck` — pass.
- `git diff --check` — pass.
- `pnpm test && pnpm test:launcher` — pass, 51 Vitest files / 323 tests plus Go launcher tests.
- `pnpm lint` — initial wrapper attempts reported `[warn] Linter process terminated abnormally (possibly out of memory)`; `/opt/homebrew/bin/pnpm lint` passed.

## Deviations

None — implementation matches design. `packages/core` remained untouched.

## Remaining Work

- P8-S3b real publish activation remains pending maintainer-owned repositories, secrets, branch/tag protections, support policy, and explicit confirmation.
