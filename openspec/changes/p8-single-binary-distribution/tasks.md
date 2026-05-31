# Tasks: P8 — Single Binary Distribution

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | P8-S1: 550-750; P8-S2: 250-400; P8-S3: 150-300; full P8: 950-1,450 |
| 400-line budget risk | High |
| 800-line budget risk | High for full P8; Low/Medium for S1 only |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 P8-S1 local launcher → PR 2 P8-S2 dry-run release config/docs → PR 3 P8-S3 publish enablement only after maintainer setup |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
800-line budget risk: High for full P8; Low/Medium for S1 only

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Local Go launcher prototype | PR 1 | Base main/feature branch; tests, scripts, docs included. |
| 2 | Release dry-run shape | PR 2 | Depends on PR 1; no real publish. |
| 3 | Publish activation | PR 3 | Only after maintainer repos/secrets exist. |

## Phase 1: P8-S1 RED — Launcher Contract Tests

- [x] 1.1 Create `go.mod`, `cmd/rai/main.go`, and `internal/launcher/*_test.go` with failing tests for `install`, `doctor`, `analyze`, `mcp` argv pass-through.
- [x] 1.2 Add failing tests proving child stdout/stderr passthrough, `mcp` stdout cleanliness, non-zero exit propagation, and launcher diagnostics only on stderr.
- [x] 1.3 Add failing tests for dev/archive engine path resolution and `dist/rai/metadata.json` missing/mismatch failures before child execution.

## Phase 2: P8-S1 GREEN — Local Prototype

- [x] 2.1 Implement `cmd/rai/main.go` and `internal/launcher` routing/path/metadata/process logic; do not parse or rewrite TS CLI output.
- [x] 2.2 Wire stdin/stdout/stderr, child exit codes, and `SIGINT`/`SIGTERM` forwarding for delegated commands.
- [x] 2.3 Add local metadata fixture/schema support under `dist/rai/metadata.json` or test fixture path without committing generated release assets.

## Phase 3: P8-S1 Build, Smoke, Docs

- [x] 3.1 Add `package.json` scripts `build:launcher` and `test:launcher`; keep `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` behavior intact.
- [x] 3.2 Create `scripts/smoke-launcher.sh` to build TS CLI + Go launcher and verify delegated startup, failure propagation, and `rai mcp` stdout cleanliness.
- [x] 3.3 Verify: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `go test ./...`, `go build ./cmd/rai`, `./scripts/smoke-launcher.sh`.
- [x] 3.4 Update `docs/STATUS.md`, `docs/ROADMAP.md`, and this OpenSpec change with S1 complete state and deferred release publishing.

## Phase 4: P8-S2 — Future Dry-Run Release Shape

- [x] 4.1 RED first: add checks/docs tests for `.goreleaser.yaml` dry-run archive/checksum/Homebrew/Scoop/install-script shape; no real publish.
- [x] 4.2 Add GoReleaser/Homebrew/Scoop/install-script dry-run config/docs only; document required repos, tokens, secrets, and unsupported real-publish state.

## Phase 5: P8-S3 — Repository Workflow and Publish Gates

- [x] 5.1 P8-S3a extend guard tests/checks for `main` trunk/default policy, legacy branch retirement, branch naming, commit naming, PR title, PR template policy, GoReleaser/manual tag authority, no `semantic-release`, rollback policy, and maintainer-confirmed manual gates.
- [x] 5.2 P8-S3a document policy: revise workflow docs, release maintainer checklist, status/roadmap/OpenSpec for naming policy and automation deferral without dependencies, branch/tag/remote mutation, secrets, or publish channels.
- [x] 5.2a P8-S3c add commitlint conventional defaults, PR-title CI, optional local title check, flexible scopes, docs/OpenSpec updates, and no semantic-release/real-publish/branch/tag/default mutation/mandatory hooks.
- [ ] 5.3 P8-S3b RED first: add guard tests/checks that real publish fails unless maintainer-created GitHub release, tap, bucket, permissions, branch/tag protection, and secrets exist.
- [ ] 5.4 P8-S3b enable real publish workflow only after maintainer setup exists; update docs/status/roadmap/OpenSpec with release support matrix and rollback notes.
