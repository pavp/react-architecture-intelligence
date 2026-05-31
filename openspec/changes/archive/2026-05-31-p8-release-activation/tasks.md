# Tasks: P8 Release Activation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260-420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; split validator/docs if diff grows past 400 |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Publish config + workflow gates | PR 1 | Tests and docs included; no tags/releases. |

## Phase 1: RED — Release Activation Validator

- [x] 1.1 Update `packages/cli/src/release-config.test.ts` to require enabled GitHub release, Homebrew tap, Scoop bucket, exact `RAI_*` secret/env names, and retained snapshot preflight.
- [x] 1.2 Add unsafe-case tests rejecting invalid tag triggers, missing main ancestry gate, missing secrets, disabled checks, auto-tagging, `semantic-release`, force-push/delete language, and publish without `v*` tag.

## Phase 2: GREEN — Config and Workflow

- [x] 2.1 Modify `.goreleaser.yaml` to enable GitHub Release publishing and set Homebrew/Scoop repository tokens from `{{ .Env.RAI_HOMEBREW_TAP_TOKEN }}` and `{{ .Env.RAI_SCOOP_BUCKET_TOKEN }}`.
- [x] 2.2 Modify `.github/workflows/release.yml` for `v*` tag and `workflow_dispatch`, exact secrets, `GITHUB_TOKEN` mapping, tag regex, `origin/main` ancestry, `pnpm release:check`, tests, typecheck, build, prepare, snapshot preflight, and gated publish.
- [x] 2.3 Update `packages/cli/src/release-config.ts` so `pnpm release:check` validates activation mode and fails closed on unsafe publish paths.

## Phase 3: Docs and Status

- [x] 3.1 Update `docs/release-maintainer-checklist.md` with final runbook: apply does not create tags/releases; first tag requires explicit post-verify authorization.
- [x] 3.2 Update `docs/repository-workflow.md`, `docs/STATUS.md`, and `docs/ROADMAP.md` with activation state, branch/tag protections, rollback via new tag, and final pending tag action.

## Phase 4: Verification

- [x] 4.1 Run `pnpm release:check`, `pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`.
- [x] 4.2 Confirm `git status --short` shows no `.atl/` changes staged or modified and no tag/release was created.
