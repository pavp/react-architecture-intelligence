# Apply Progress: P8-S3c Governance Automation

## Mode

Strict TDD.

## Completed Tasks

- [x] 1.1 Add failing Vitest checks for `commitlint.config.cjs` extending `@commitlint/config-conventional` and preserving flexible scopes.
- [x] 1.2 Add failing Vitest checks for `.github/workflows/pr-title.yml` pull request event coverage, title temp-file linting, and excluded mutation/publish behavior.
- [x] 1.3 Add failing Vitest checks for commitlint deps/script and absence of `semantic-release`, mandatory hooks, and real publish scripts.
- [x] 2.1 Add root `commitlint.config.cjs` using Conventional Commit defaults only.
- [x] 2.2 Add `@commitlint/cli` and `@commitlint/config-conventional`; update `pnpm-lock.yaml`.
- [x] 2.3 Add `lint:pr-title` package script delegating to commitlint.
- [x] 2.4 Add PR-title workflow that writes title to a temp file and runs `pnpm commitlint --edit <file>`.
- [x] 3.1 Update repository workflow docs for CI governance, optional local checks, flexible scopes, and no mandatory hooks.
- [x] 3.2 Update status and roadmap for P8-S3c governance automation and exclusions.
- [x] 3.3 Align repository-workflow OpenSpec delta and canonical spec with implementation behavior.
- [x] 4.1 Run targeted Vitest checks.
- [x] 4.2 Run strict required gate: `pnpm test && pnpm test:launcher`.
- [x] 4.3 Run practical valid/invalid title checks with `pnpm lint:pr-title --edit <file>`.
- [x] 4.4 Inspect excluded behavior: no `semantic-release`, no publish activation, no branch/default/tag mutation, no mandatory hooks.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 | `packages/cli/src/governance-automation.test.ts` | Unit/file contract | ✅ `packages/cli/src/release-config.test.ts` 7/7 baseline | ✅ Missing `commitlint.config.cjs` failed | ✅ Targeted governance test passed after config | ✅ Asserted conventional extension and no `scope-enum`/scope list | ✅ Kept file contract small |
| 1.2 / 2.4 | `packages/cli/src/governance-automation.test.ts` | Unit/file contract | N/A (new workflow) | ✅ Missing `.github/workflows/pr-title.yml` failed | ✅ Targeted governance test passed after workflow | ✅ Asserted event types, temp file, commitlint command, install, and forbidden mutation/publish patterns | ✅ Used direct workflow text checks |
| 1.3 / 2.2 / 2.3 | `packages/cli/src/governance-automation.test.ts` | Unit/file contract | ✅ `packages/cli/src/release-config.test.ts` 7/7 baseline | ✅ Missing deps/script failed | ✅ Targeted governance test passed after package/lockfile update | ✅ Asserted deps/script plus absence of semantic-release, hooks, publish scripts | ✅ Kept package assertion behavior-focused |
| 3.1 / 3.2 / 3.3 | `packages/cli/src/release-config.test.ts` | Unit/docs contract | ✅ 7/7 baseline before docs | ✅ Existing validator failed after P8-S3c superseded P8-S3a snippets | ✅ Release-config and governance tests passed after docs/validator updates | ✅ Checked new P8-S3c governance snippets and exclusions | ✅ Preserved release dry-run guard shape |
| 4.1 / 4.2 / 4.3 / 4.4 | `packages/cli/src/governance-automation.test.ts`, `packages/cli/src/release-config.test.ts`, shell checks | Verification | ✅ Targeted tests green before full gate | ✅ Invalid title check failed as expected | ✅ Full `pnpm test && pnpm test:launcher` passed | ✅ Valid title passed and invalid title failed via real commitlint | ✅ `git diff --check` passed |

## Test Summary

- **Total tests written**: 3 governance automation tests.
- **Total tests passing**: 326 Vitest tests plus Go launcher suite.
- **Layers used**: Unit/file contract (10 targeted tests across governance + release-config), Go unit/integration through launcher suite.
- **Approval tests**: Release-config docs contract preserved and updated for P8-S3c.
- **Pure functions created**: 0.

## Verification

- ✅ `pnpm test packages/cli/src/governance-automation.test.ts`
- ✅ `pnpm test packages/cli/src/release-config.test.ts`
- ✅ `pnpm test packages/cli/src/governance-automation.test.ts && pnpm test packages/cli/src/release-config.test.ts && <valid/invalid pnpm lint:pr-title checks>`
- ✅ `pnpm test && pnpm test:launcher`
- ✅ `git diff --check`
- ✅ Exclusion scan for publish/tag/default-branch/hook/semantic-release behavior.

## Deviations

None. Implementation follows design: commitlint is root dependency/config, PR title is CI-enforced, local hooks remain optional, and release authority stays manual GoReleaser tags.

## Issues Found

- `pnpm install --lockfile-only` left local `node_modules` without new commitlint binaries, so practical `pnpm lint:pr-title` failed until `pnpm install` refreshed dependencies.
- Updating P8-S3c docs required updating release-config validator snippets that previously asserted P8-S3a deferral text.

## Workload / PR Boundary

- Fresh review verdict: FAIL verification gate until review split is documented; tracked diff is 817 lines and approx 1305 lines with untracked files.
- Main size drivers: `pnpm-lock.yaml` adds 706 lines; OpenSpec/SDD artifacts add approx 336 lines. `.atl/` is untracked and must not be staged.
- Split decision: no size exception; use feature-branch-chain with three reviewable work units.
- Work unit A / PR 1: commitlint dependency foundation — `package.json`, `pnpm-lock.yaml`, `commitlint.config.cjs`, `lint:pr-title`.
- Work unit B / PR 2: governance behavior, tests, and docs — `.github/workflows/pr-title.yml`, `packages/cli/src/governance-automation.test.ts`, release-config tests, `docs/repository-workflow.md`, `docs/STATUS.md`, `docs/ROADMAP.md`.
- Work unit C / PR 3: SDD/OpenSpec sync only — `openspec/changes/p8-governance-automation/**` and `openspec/specs/repository-workflow/spec.md`.
- Boundary: governance automation only; no semantic-release, real publish, local hooks, branch/default/tag/remote mutation, package/core behavior changes, `.gitignore`, or `.atl/`.
- Verification can proceed after documenting split: Yes.

## Status

14/14 tasks complete. Split boundary documented. Ready for verify.
