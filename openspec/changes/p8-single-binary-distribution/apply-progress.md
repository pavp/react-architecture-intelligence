# Apply Progress: P8 — Single Binary Distribution

## Status

P8-S1 local Go launcher prototype complete. P8-S2 and P8-S3 remain pending.

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

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 | `internal/launcher/launcher_test.go` | Go unit | ✅ `pnpm test packages/cli/src/cli.test.ts` 20/20; baseline `go test ./...` failed because no Go module existed | ✅ Failing compile for missing `CommandSpec`, `Run`, `Options`, `ResolveEngine` | ✅ `go test ./...` passed after `go.mod`, `cmd/rai`, `internal/launcher` implementation | ✅ install, doctor, analyze, mcp, and unknown command pass-through cases | ✅ Kept command parsing out of Go except Go-owned `version` |
| 1.2 / 2.2 | `internal/launcher/launcher_test.go` | Go unit | N/A (new launcher files) | ✅ Failing tests asserted stdout/stderr passthrough, MCP stdout cleanliness, exit code propagation, diagnostics on stderr only | ✅ `go test ./...` passed with process runner and direct stdio wiring | ✅ non-zero exit and pre-exec failure cases cover different paths | ✅ Process runner isolated behind `Runner` interface; signals forwarded in exec runner |
| 1.3 / 2.3 | `internal/launcher/launcher_test.go` | Go unit | N/A (new launcher files) | ✅ Failing tests asserted dev/archive path resolution and metadata missing/mismatch failures before child execution | ✅ `go test ./...` passed with dev/archive resolver and metadata validation | ✅ missing metadata, schema mismatch, platform mismatch, archive success, dev success | ✅ Metadata validation kept pure and deterministic |
| 3.1 / 3.2 | `scripts/smoke-launcher.sh` plus `package.json` scripts | Smoke | ✅ `go test ./...` passed before script/doc changes | ✅ Smoke initially failed direct execution due missing executable bit; then failed diagnostic expectation after pass-through decision | ✅ `./scripts/smoke-launcher.sh` passed 13/13 after executable bit and engine-error assertion | ✅ doctor, install, failure propagation, MCP stdout cleanliness | ✅ Script checks delegated output without parsing engine internals |
| 3.3 / 3.4 | Verification commands and docs | Verification/docs | ✅ Existing docs read; no prior P8 apply-progress found | ✅ Verification gates and docs state required by task before complete | ✅ All required verification commands passed | ➖ Single evidence path for docs/status updates | ✅ OpenSpec tasks and docs updated for S1 only |

## Test Summary

- **Total tests written**: 6 Go test functions plus launcher smoke script.
- **Total tests passing**: `go test ./...` passes all Go tests; `pnpm test` passes 50 files / 316 tests.
- **Layers used**: Go unit, launcher smoke, TS regression.
- **Approval tests**: None — new launcher boundary, no refactor of existing TS behavior.
- **Pure functions created**: path resolution and metadata validation helpers in `internal/launcher`.

## Verification Summary

| Command | Result |
|---------|--------|
| `go test ./...` | ✅ Passed |
| `go build ./cmd/rai` | ✅ Passed |
| `pnpm test` | ✅ Passed |
| `pnpm typecheck` | ✅ Passed |
| `pnpm build` | ✅ Passed |
| `pnpm lint` | ✅ Passed |
| `git diff --check` | ✅ Passed |
| `./dist/rai/rai doctor . --json` | ✅ Passed |
| `./dist/rai/rai install --dry-run --platform opencode --no-instructions .` | ✅ Passed |
| `./scripts/smoke-launcher.sh` | ✅ Passed |

## Deviations from Design

- `dist/rai/metadata.json` was not committed. Metadata coherence is covered through archive fixture paths in Go tests, matching the design note that generated release assets are later.
- Unsupported commands are passed through to the TypeScript CLI help/error path, matching the design routing decision to avoid a second CLI source of truth.

## Remaining Tasks

- [ ] 4.1 RED first: add checks/docs tests for `.goreleaser.yaml` dry-run archive/checksum/Homebrew/Scoop/install-script shape; no real publish.
- [ ] 4.2 Add GoReleaser/Homebrew/Scoop/install-script dry-run config/docs only; document required repos, tokens, secrets, and unsupported real-publish state.
- [ ] 5.1 RED first: add guard tests/checks that publish fails unless maintainer-created GitHub release, tap, bucket, permissions, and secrets exist.
- [ ] 5.2 Enable real publish workflow only after maintainer setup exists; update docs/status/roadmap/OpenSpec with release support matrix and rollback notes.

## Workload / PR Boundary

- Mode: stacked PR slice.
- Current work unit: P8-S1 local Go launcher prototype.
- Boundary: added local Go module/launcher/tests/smoke/docs only; no GoReleaser, Homebrew, Scoop, install-script publishing, or TypeScript engine rewrite.
- Estimated review budget impact: within 800-line review budget for S1; full P8 still requires chained PRs.
