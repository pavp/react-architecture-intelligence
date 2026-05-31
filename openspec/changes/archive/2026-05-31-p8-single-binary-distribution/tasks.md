# Tasks: P8 — Single Binary Distribution

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | P8-S3b remaining: 250-450 |
| 400-line budget risk | Medium |
| 800-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single P8-S3b PR; split if over 400 lines |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium
800-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Publish readiness gates | PR 1 | Validator/tests/docs until blockers clear. |
| 2 | Publish workflow activation | PR 1 or split | Manual tag-driven GoReleaser after secrets/repos ready. |

## Phase 1: P8-S1 Launcher Prototype — Complete

- [x] 1.1 Add Go launcher contract tests for argv passthrough, stdio, exits, metadata, and path resolution.
- [x] 1.2 Implement `cmd/rai`, `internal/launcher`, process wiring, signal forwarding, and metadata validation.
- [x] 1.3 Add `build:launcher`, `test:launcher`, `scripts/smoke-launcher.sh`, verification, and docs/status updates.

## Phase 2: P8-S2 Release Dry-Run Shape — Complete

- [x] 2.1 Add release dry-run validator/tests for `.goreleaser.yaml`, channels, install script, and no real publish.
- [x] 2.2 Add GoReleaser dry-run config, checklist, scripts, and docs with `DRY_RUN_ONLY` placeholders.

## Phase 5: P8-S3 — Repository Workflow and Publish Gates

- [x] 5.1 P8-S3a add checks/docs for `main`, legacy branch retirement, naming, PR template, tag policy, rollback, manual gates, no `semantic-release`.
- [x] 5.2 P8-S3c add commitlint defaults, PR-title CI, optional local check, flexible scopes, and no real publish/mutations/hooks.
- [x] 5.3 P8-S3b RED first: extend `packages/cli/src/release-config.test.ts` and validator planning for actual channels `pavp/homebrew-tap` and `pavp/scoop-bucket`, replacing `DRY_RUN_ONLY` placeholders only after gates pass.
- [x] 5.4 P8-S3b add publish-readiness checks for `main` default/protection, `refs/tags/v*` immutability rules, non-empty tap/bucket default branches, required repo secrets/tokens, and manual `vX.Y.Z`/`vX.Y.Z-rc.N` tag authority.
- [x] 5.5 P8-S3b activate `.goreleaser.yaml`/`.github/workflows/release.yml` only behind manual tag workflow, least-privilege permissions, no semantic-release, no auto-tagging, no force-push/delete, and fail-closed preflight.
- [x] 5.6 P8-S3b update `docs/release-maintainer-checklist.md`, `docs/repository-workflow.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, `tasks.md`, and `apply-progress.md` with support matrix, rollback, initialized README-only channel repos, pending first-release Formula/bucket manifests, and first-publish runbook.
