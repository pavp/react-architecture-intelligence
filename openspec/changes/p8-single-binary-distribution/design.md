# Design: P8 — Portable Go Launcher Distribution

## Technical Approach

Add a thin Go launcher under `cmd/rai` that is the portable archive entrypoint and delegates unchanged arguments to the existing TypeScript CLI. The TypeScript engine remains source of truth for analysis, install, doctor, MCP, storage, and native dependency behavior. P8-S1 should ship only the local Go prototype plus smoke tests; GoReleaser config belongs in P8-S2 to keep the first review slice small and prove stdio/process safety before release shape work.

## Architecture Decisions

| Topic | Choice | Alternatives considered | Rationale |
|------|--------|-------------------------|-----------|
| Repo layout | `cmd/rai` for Go main, `internal/launcher` for process/path logic, `dist/rai/` for assembled local assets | `packages/launcher-go`, Go inside `packages/cli` | `cmd/rai` is idiomatic Go and does not imply pnpm package ownership. |
| Engine location | Dev resolves repo root `packages/cli/dist/index.js`; archive resolves sibling `lib/rai/engine/packages/cli/dist/index.js` from executable dir | Hardcoded cwd, global npm lookup | Works from any cwd and supports future extracted archives. |
| Routing | Launcher allowlists `install`, `doctor`, `analyze`, `mcp`, `version`; all other args pass to TS help/error path | Re-parse all CLI flags in Go | Avoids second CLI source of truth and preserves TS behavior. |
| Release scope | P8-S1 local prototype only; P8-S2 GoReleaser dry-run | Include GoReleaser in P8-S1 | Stdio and asset coherence are riskier than YAML release shape; split protects 800-line budget. |
| Runtime | Archive may bundle Node/runtime later; S1 can use discovered `node` with doctor warning | True one-file binary | Proposal excludes true single executable; native addons still need platform assets. |

## Data Flow

```text
user -> rai(Go) -> resolve metadata/assets -> node + packages/cli/dist/index.js -> TS CLI/core
                 -> stderr launcher diagnostics only
                 -> stdout engine passthrough (MCP JSON for `mcp`)
```

For `rai mcp`, Go wires stdin/stdout/stderr directly to the child. It must not print banners, progress, JSON wrappers, or logs to stdout. Signals (`SIGINT`, `SIGTERM`) forward to the child; launcher exits with the child exit code. Launcher-only startup failures exit `1` with stderr diagnostics before engine execution.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `cmd/rai/main.go` | Create | Minimal Go entrypoint calling launcher package. |
| `internal/launcher/*.go` | Create | Path resolution, metadata checks, child process execution, signal forwarding. |
| `internal/launcher/*_test.go` | Create | Go unit tests for routing, path lookup, exit propagation, stdio rules. |
| `dist/rai/metadata.json` | Generate later | Local/release asset coherence metadata. |
| `scripts/smoke-launcher.sh` | Create | Builds Go launcher, builds TS CLI, verifies delegation and MCP stdout cleanliness. |
| `package.json` | Modify | Add non-breaking scripts such as `build:launcher` and `test:launcher`; keep `pnpm build/test/typecheck` behavior intact. |
| `.goreleaser.yaml` | Defer | P8-S2 dry-run archive/checksum/channel config. |
| `docs/STATUS.md` / `docs/ROADMAP.md` | Modify | Record P8 slice state and deferred release setup. |

## Interfaces / Contracts

Metadata file fields: launcher version, engine package version, asset schema version, runtime kind/path, platform (`goos/goarch`), git commit, build date, checksum map. Launcher requires compatible asset schema and matching engine/launcher version unless dev mode is detected.

Command contract: `rai install`, `rai doctor`, `rai analyze`, and `rai mcp` invoke the TypeScript CLI with equivalent argv. `rai version` may be Go-owned because it reports launcher plus asset metadata and does not touch findings or MCP JSON.

Future archive layout:

```text
rai(.exe)
lib/rai/metadata.json
lib/rai/engine/packages/cli/dist/index.js
lib/rai/runtime/...
lib/rai/native/<os>-<arch>/...
```

Future release design mirrors Gentle-AI shape: GoReleaser creates darwin/linux/windows amd64+arm64 archives, checksums, GitHub release assets, Homebrew tap formula, Scoop bucket manifest, and install-script fallback. Maintainer setup checklist: create tap and bucket repos, decide archive signing policy, add `GITHUB_TOKEN`/tap/bucket secrets, reserve release workflow permissions, and document support matrix. No real publish in P8-S1.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Go unit | Path modes, metadata mismatch, unsupported platform, exit propagation | `go test ./...` independent of pnpm. |
| Integration | Delegation for `install`, `doctor`, `analyze`; missing asset failures | Temporary fixture with built TS CLI and fake metadata. |
| Smoke | MCP stdout cleanliness, signal forwarding, exit codes | `scripts/smoke-launcher.sh` alongside existing `scripts/smoke.sh`. |
| TS regression | Existing CLI behavior | Keep `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint` unchanged. |

## Migration / Rollout

No data migration required. P8-S1 adds opt-in local launcher artifacts; npm/TS CLI remains primary. Later slices add GoReleaser dry-run, then real publishing only after maintainer setup exists.

## Open Questions

- [ ] Which Node runtime bundling strategy is preferred after S1: bundled Node, documented system Node, or staged extractor?
- [ ] Which platforms get first native addon support if `better-sqlite3`/`sqlite-vec` artifacts are incomplete?
