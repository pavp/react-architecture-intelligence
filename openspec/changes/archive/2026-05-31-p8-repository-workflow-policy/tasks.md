# Tasks: P8-S3a Repository Workflow Policy

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300-420 |
| 400-line budget risk | Medium |
| 800-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR: naming-policy SDD extension + validator RED/GREEN + workflow/checklist/status sync |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Policy/checks slice | PR 1 | Keep tests, docs, status, roadmap, and OpenSpec sync together; no new dependencies, `semantic-release`, or remote/default-branch/tag mutation. |

## Phase 1: RED — Release Policy Guard Tests

- [x] 1.1 Add failing Vitest temp-root cases in `packages/cli/src/release-config.test.ts` for missing `docs/repository-workflow.md` and incomplete main trunk/tag policy snippets.
- [x] 1.2 Add failing checklist-link case requiring `docs/release-maintainer-checklist.md` to reference P8-S3a/P8-S3b branch, tag, and publish gates.
- [x] 1.3 Add failing cases for branch naming, commit naming, PR title, PR template policy, GoReleaser/manual tag authority, no `semantic-release`, and P8-S3c automation deferral.

## Phase 2: GREEN — Read-Only Validator Checks

- [x] 2.1 Extend `packages/cli/src/release-config.ts` with deterministic checks for workflow doc existence, `main` trunk/default target, legacy branch retirement, PR gates, `vX.Y.Z`/`vX.Y.Z-rc.N` tag gates, immutable tags, rollback, and publish-disabled wording.
- [x] 2.2 Keep `validateReleaseDryRunConfig(root)` read-only; failures must name missing repository workflow/checklist prerequisites without touching branches, default-branch settings, tags, remotes, secrets, or publish channels.
- [x] 2.3 Extend checks for naming policy, PR template completion, GoReleaser/manual tag authority, no new dependencies, no `semantic-release`, and future P8-S3c CI-preferred enforcement.

## Phase 3: Documentation Policy

- [x] 3.1 Create `docs/repository-workflow.md` with quick path, `main` trunk/default target, `feat/rai-mvp-p0-p3` retirement after P8, PR gates, work-unit split rules, tag gates, rollback, and non-goals.
- [x] 3.2 Update `docs/release-maintainer-checklist.md` with repository workflow link plus P8-S3a policy gates and P8-S3b real-publish blockers.
- [x] 3.3 Revise workflow/checklist/status/roadmap docs for explicit branch/commit/PR-title/template policy and automation deferral; do not add dependencies or semantic-release.

## Phase 4: OpenSpec Sync and Verification

- [x] 4.1 Update `openspec/changes/p8-single-binary-distribution/tasks.md` Phase 5 to split S3a repository workflow/tag policy from S3b real publish activation.
- [x] 4.2 Sync `openspec/changes/p8-single-binary-distribution/tasks.md` Phase 5 with S3a naming/automation deferral and S3b real publish gates.
- [x] 4.3 Verify with focused release tests, `pnpm release:check`, `pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm lint`, and `git diff --check`.
