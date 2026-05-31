# Apply Progress: P8 — Single Binary Distribution

## Status

P8-S1 local Go launcher prototype, P8-S2 release dry-run shape/config/docs, P8-S3a workflow/tag policy, P8-S3c PR-title governance, and P8-S3b safe publish gates are complete. Channel repos now have initialized `main` branches with README files only; actual publishing remains blocked until first-release Formula/bucket manifests and repository Actions secrets are configured.

## Completed Tasks

- [x] 1.1 Create `go.mod`, `cmd/rai/main.go`, and `internal/launcher/*_test.go` with failing tests for `install`, `doctor`, `analyze`, `mcp` argv pass-through.
- [x] 1.2 Add failing tests proving child stdout/stderr passthrough, `mcp` stdout cleanliness, non-zero exit propagation, and launcher diagnostics only on stderr.
- [x] 1.3 Add failing tests for dev/archive engine path resolution and `dist/rai/metadata.json` missing/mismatch failures before child execution.
- [x] 2.1 Implement `cmd/rai/main.go` and `internal/launcher` routing/path/metadata/process logic; do not parse or rewrite TS CLI output.
- [x] 2.2 Wire stdin/stdout/stderr, child exit codes, and `SIGINT`/`SIGTERM` forwarding for delegated commands.
- [x] 2.3 Add local metadata fixture/schema support under `dist/rai/metadata.json` or test fixture path without committing generated release assets.
- [x] 3.1 Add `package.json` scripts `build:launcher` and `test:launcher`; keep `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` behavior intact.
- [x] 3.2 Create `scripts/smoke-launcher.sh` to build TS CLI + Go launcher and verify delegated startup, failure propagation, and `rai mcp` stdout cleanliness.
- [x] 3.3 Verify: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `go test ./...`, `go build ./cmd/rai`, `./scripts/smoke-launcher.sh`.
- [x] 3.4 Update `docs/STATUS.md`, `docs/ROADMAP.md`, and this OpenSpec change with S1 complete state and deferred release publishing.
- [x] 4.1 RED first: add checks/docs tests for `.goreleaser.yaml` dry-run archive/checksum/Homebrew/Scoop/install-script shape; no real publish.
- [x] 4.2 Add GoReleaser/Homebrew/Scoop/install-script dry-run config/docs only; document required repos, tokens, secrets, and unsupported real-publish state.
- [x] 5.1 P8-S3a extend guard tests/checks for `main` trunk/default policy, legacy branch retirement, branch naming, commit naming, PR title, PR template policy, GoReleaser/manual tag authority, no `semantic-release`, rollback policy, and maintainer-confirmed manual gates.
- [x] 5.2 P8-S3a document policy: revise workflow docs, release maintainer checklist, status/roadmap/OpenSpec for naming policy and automation deferral without dependencies, branch/tag/remote mutation, secrets, or publish channels.
- [x] 5.2a P8-S3c add commitlint conventional defaults, PR-title CI, optional local title check, flexible scopes, docs/OpenSpec updates, and no semantic-release/real-publish/branch/tag/default mutation/mandatory hooks.
- [x] 5.3 P8-S3b add RED-first release-config tests and validator gates for real channel repo names `pavp/homebrew-tap` and `pavp/scoop-bucket` while keeping `release.disable: true`.
- [x] 5.4 P8-S3b add publish-readiness checks for branch/tag policy snippets, channel branch readiness docs, exact secret names, support matrix, and fail-closed publish policy.
- [x] 5.5 P8-S3b add safe `.github/workflows/release.yml` manual preflight with `workflow_dispatch`, `RELEASE_PUBLISH_CONFIRM`, required secret gates, tag format check, `main` ancestry check, and GoReleaser `--snapshot --skip=publish` only.
- [x] 5.6 P8-S3b update release checklist, repository workflow policy, status, roadmap, tasks, and apply-progress with support matrix, rollback, exact secret names, and first-publish runbook.

## P8-S3b Discovery Refresh

| Gate | Current evidence | State |
|------|------------------|-------|
| RAI default branch | `pavp/react-architecture-intelligence` default branch is `main`; local branch tracks `origin/main`. | ✅ Ready |
| `main` protection | Required checks `Test and typecheck`, `Validate PR title`; 1 review; stale dismissal; strict status checks; linear history; no force pushes/deletions. | ✅ Ready |
| Release tag rules | Active `Protect release tags` ruleset for release tags is reported; user confirmed `refs/tags/v*` blocks deletion and non-fast-forward. | ✅ Ready |
| Homebrew tap | `pavp/homebrew-tap` exists, public/admin, default branch `main`, and root contains README only; formula output remains pending first real release. | ⚠️ Repo initialized / publish blocked |
| Scoop bucket | `pavp/scoop-bucket` exists, public/admin, default branch `main`, and root contains README only; bucket manifest remains pending first real release. | ⚠️ Repo initialized / publish blocked |
| Publish credentials | `gh secret list --repo pavp/react-architecture-intelligence` returned no Actions secrets. | ⛔ Blocked |
| GoReleaser config | `.goreleaser.yaml` has real Homebrew/Scoop repository names and still has `release.disable: true`. | ✅ Safe config ready |
| Release workflow | `.github/workflows/release.yml` is manual preflight only and runs GoReleaser snapshot with `--skip=publish`. | ✅ Safe to merge / publish blocked |

## P8-S3b Remaining Blockers

1. Generate first Homebrew formula into `pavp/homebrew-tap` during an explicitly approved first real release; current repo root contains README only.
2. Generate first Scoop bucket manifest into `pavp/scoop-bucket` during an explicitly approved first real release; current repo root contains README only.
3. Add least-privilege GitHub Actions secrets/tokens: `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN`.
4. Keep `.goreleaser.yaml` publishing disabled until a future change intentionally removes `release.disable: true` after all gates pass.
5. Keep release workflow preflight-only until maintainer explicitly chooses a real publish workflow.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 | `internal/launcher/launcher_test.go` | Go unit | ✅ `pnpm test packages/cli/src/cli.test.ts` 20/20; baseline `go test ./...` failed because no Go module existed | ✅ Failing compile for missing `CommandSpec`, `Run`, `Options`, `ResolveEngine` | ✅ `go test ./...` passed after `go.mod`, `cmd/rai`, `internal/launcher` implementation | ✅ install, doctor, analyze, mcp, and unknown command pass-through cases | ✅ Kept command parsing out of Go except Go-owned `version` |
| 1.2 / 2.2 | `internal/launcher/launcher_test.go` | Go unit | N/A (new launcher files) | ✅ Failing tests asserted stdout/stderr passthrough, MCP stdout cleanliness, exit code propagation, diagnostics on stderr only | ✅ `go test ./...` passed with process runner and direct stdio wiring | ✅ non-zero exit and pre-exec failure cases cover different paths | ✅ Process runner isolated behind `Runner` interface; signals forwarded in exec runner |
| 1.3 / 2.3 | `internal/launcher/launcher_test.go` | Go unit | N/A (new launcher files) | ✅ Failing tests asserted dev/archive path resolution and metadata missing/mismatch failures before child execution | ✅ `go test ./...` passed with dev/archive resolver and metadata validation | ✅ missing metadata, schema mismatch, platform mismatch, archive success, dev success | ✅ Metadata validation kept pure and deterministic |
| 3.1 / 3.2 | `scripts/smoke-launcher.sh` plus `package.json` scripts | Smoke | ✅ `go test ./...` passed before script/doc changes | ✅ Smoke initially failed direct execution due missing executable bit; then failed diagnostic expectation after pass-through decision | ✅ `./scripts/smoke-launcher.sh` passed 13/13 after executable bit and engine-error assertion | ✅ doctor, install, failure propagation, MCP stdout cleanliness | ✅ Script checks delegated output without parsing engine internals |
| 3.3 / 3.4 | Verification commands and docs | Verification/docs | ✅ Existing docs read; no prior P8 apply-progress found | ✅ Verification gates and docs state required by task before complete | ✅ All required verification commands passed | ➖ Single evidence path for docs/status updates | ✅ OpenSpec tasks and docs updated for S1 only |
| 4.1 | `packages/cli/src/release-config.test.ts` | TS unit/config | ✅ `go test ./...` passed and `pnpm test packages/cli/src/cli.test.ts` passed 20/20 before edits | ✅ Failing import for missing `release-config.js`, then failing repo validation before `.goreleaser.yaml`/docs/scripts existed | ✅ `pnpm test packages/cli/src/release-config.test.ts` passed 3/3 after validator and dry-run artifacts | ✅ Happy path, real publish workflow rejection, and missing maintainer setup docs | ✅ Validator kept pure/read-only over repo files |
| 4.2 | `.goreleaser.yaml`, `docs/release-maintainer-checklist.md`, `scripts/install-rai.sh`, `scripts/prepare-release-dry-run.sh` | Config/docs/script | ✅ P8-S1 verification baseline preserved; no publishing workflow existed | ✅ `pnpm release:check` failed until dry-run checklist included required setup wording; `pnpm release:prepare` failed until scripts were executable | ✅ `pnpm release:check` and `pnpm release:prepare` passed; generated assets stay under ignored `dist/` | ✅ Archive layout, Homebrew/Scoop placeholders, install-script dry-run, and no-secret policy covered | ✅ Docs lead with dry-run contract and maintainer checklist; no real publish added |
| 5.3 | `packages/cli/src/release-config.test.ts` | TS unit/config | ✅ `pnpm test packages/cli/src/release-config.test.ts` 7/7 and `pnpm release:check` passed before edits | ✅ 4 new/changed tests failed for real channel names, publish docs, and workflow gates | ✅ `pnpm test packages/cli/src/release-config.test.ts` passed 10/10 after validator/config/docs/workflow updates | ✅ dry-run placeholders fail, real channels pass, unsafe workflow fails, missing docs fail | ✅ Validator remains read-only and does not call GitHub APIs or mutate refs/secrets |
| 5.4 | `packages/cli/src/release-config.ts` | TS unit/config | ✅ Same release-config baseline before edits | ✅ Tests required exact secrets, tap/bucket branch docs, support matrix, tag immutability, and fail-closed policy before implementation | ✅ `pnpm test packages/cli/src/release-config.test.ts` and `pnpm release:check` passed | ✅ secret, channel, support matrix, rollback, and tag policy snippets covered | ✅ Kept checks deterministic over repository files for CI safety |
| 5.5 | `.github/workflows/release.yml` | Workflow/preflight | N/A (new workflow) | ✅ Test rejected push-tag publish workflow, missing confirmation, and missing secrets | ✅ Manual preflight workflow added with `workflow_dispatch`, confirmation, secret gates, tag format, main ancestry, and `--snapshot --skip=publish` | ✅ unsafe push workflow and safe manual workflow paths covered | ✅ Least privilege `contents: read`; no release publish, tag creation, force push, deletion, or semantic-release |
| 5.6 | Docs/OpenSpec status files | Docs/config | ✅ Existing docs read before edits | ✅ `pnpm release:check` failed until docs contained exact secret names/readiness snippets | ✅ `pnpm release:check`, `pnpm test && pnpm test:launcher`, and `pnpm typecheck` passed | ✅ checklist, workflow policy, status, roadmap, tasks, and progress all updated | ✅ Docs lead with blocked real publish and exact next actions |

## Test Summary

- **Total tests written**: 6 Go test functions, launcher smoke script, and 10 TS release-config tests total (3 new P8-S3b tests plus updated channel-shape expectation).
- **Total tests passing**: `pnpm test` passes 52 files / 329 tests; `pnpm test:launcher` passes Go launcher tests.
- **Layers used**: Go unit, launcher smoke, TS unit/config, TS regression.
- **Approval tests**: None — new launcher boundary, no refactor of existing TS behavior.
- **Pure functions created**: path resolution and metadata validation helpers in `internal/launcher`; read-only release validator in `packages/cli/src/release-config.ts`.

## Verification Summary

| Command | Result |
|---------|--------|
| `go test ./...` | ✅ Passed |
| `go build ./cmd/rai` | ✅ Passed |
| `pnpm test` | ✅ Passed |
| `pnpm test && pnpm test:launcher` | ✅ Passed — 52 files / 329 TS tests plus Go launcher tests |
| `pnpm typecheck` | ✅ Passed |
| `pnpm build` | ✅ Passed |
| `pnpm lint` | ✅ Passed |
| `git diff --check` | ✅ Passed |
| `./dist/rai/rai doctor . --json` | ✅ Passed |
| `./dist/rai/rai install --dry-run --platform opencode --no-instructions .` | ✅ Passed |
| `./scripts/smoke-launcher.sh` | ✅ Passed |
| `pnpm release:check` | ✅ Passed |
| `pnpm release:prepare` | ✅ Passed |
| `pnpm test packages/cli/src/release-config.test.ts` | ✅ Passed — 10/10 |

## Deviations from Design

- `dist/rai/metadata.json` was not committed. Metadata coherence is covered through archive fixture paths in Go tests, matching the design note that generated release assets are later.
- Unsupported commands are passed through to the TypeScript CLI help/error path, matching the design routing decision to avoid a second CLI source of truth.
- GoReleaser itself is optional for local validation in P8-S2; repo-owned `pnpm release:check` validates dry-run shape without requiring GoReleaser or secrets.
- P8-S3b workflow is preflight-only and uses `goreleaser release --snapshot --clean --skip=publish`; real GitHub release publishing stays disabled through `.goreleaser.yaml` `release.disable: true`.

## Remaining Tasks

- None for P8 apply. P8 verify/archive remains next.

## Workload / PR Boundary

- Mode: stacked PR slice.
- Current work unit: P8-S3b real publish readiness and activation planning.
- Boundary for this batch: P8-S3b safe publish gates, config/docs/workflow, tests, and OpenSpec progress only; no tags, releases, artifacts, secrets, `.gitignore`, or `.atl/` changes.
- Estimated review budget impact: ~300 changed tracked lines plus one new workflow; within 800-line review budget and near 400-line soft budget.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | P8-S3b implemented: ~300 tracked changed lines plus one new workflow |
| 400-line budget risk | Medium |
| 800-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single P8-S3b planning/activation PR; split only if workflow + docs exceed 400 lines |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium
800-line budget risk: Low
