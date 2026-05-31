# Proposal: P8 — Portable Go Launcher Distribution

## Intent

Reduce RAI install friction by shipping platform-specific portable archives with a Go launcher, bundled runtime/assets path, and existing TypeScript engine intact. “Portable distribution” means users install an archive/package containing `rai` plus required runtime/assets for that platform; it is not a true one-file executable yet.

## Scope

### In Scope
- Define portable archive layout, version metadata, checksums, and launcher-to-engine contract.
- Prototype thin Go launcher pass-through for `install`, `doctor`, `analyze`, and `mcp`.
- Add GoReleaser dry-run release shape for GitHub Releases, Homebrew, Scoop, and install-script fallback.
- Keep TypeScript engine as source of truth for analyzer behavior, MCP behavior, storage, and native dependency usage.

### Out of Scope
- True single executable with embedded/extracted Node runtime.
- Go rewrite of analyzer engine, storage, MCP server, or CLI behavior source of truth.
- Publishing Homebrew/Scoop assets before maintainer creates repos, taps, buckets, tokens, and secrets.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `distribution-install`: Add portable Go launcher distribution requirements, release channels, and safety constraints.

## Approach

Build P8 in three slices: P8-S1 local Go launcher prototype that discovers bundled/external engine path and delegates unchanged arguments; P8-S2 GoReleaser config plus dry-run docs; P8-S3 real publish only after maintainer setup exists. Launcher owns process dispatch, path resolution, platform/version reporting, and stderr diagnostics. Launcher MUST NOT interpret analyzer output, mutate findings, reimplement storage, or pollute MCP stdout passthrough.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `cmd/rai` or equivalent Go entry | New | Thin launcher and platform path logic. |
| `packages/cli` | Modified | JS engine bundle entry remains behavior source. |
| `packages/core` | Unchanged | Analyzer/storage behavior remains TypeScript-owned. |
| `.goreleaser.yaml` | New | Archive, checksum, channel dry-run config. |
| `docs/` | Modified | Install, doctor, release, maintainer setup docs. |
| `openspec/specs/distribution-install/spec.md` | Modified | Portable distribution contract. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MCP stdio pollution breaks agents | Med | All launcher logs go to stderr; stdout is passthrough for `mcp`. |
| Version drift between launcher and TS engine | Med | Embed/surface shared version metadata and test mismatch handling. |
| Native asset matrix gaps | Med | Start with dry-run artifacts and documented platform limits. |
| Channel setup blocks publish | High | Defer P8-S3 until repos/secrets exist. |

## Rollback Plan

Remove Go launcher artifacts/config/docs and keep existing npm TypeScript CLI path. Do not change analyzer contracts or persisted data formats in P8.

## Dependencies

- Go toolchain and GoReleaser for release dry-runs.
- Maintainer-created GitHub secrets, Homebrew tap, and Scoop bucket before real publish.

## Success Criteria

- [ ] Local launcher delegates all target commands without changing TS output semantics.
- [ ] `rai mcp` stdout remains clean; launcher diagnostics use stderr only.
- [ ] Release dry-run emits platform archives plus checksums.
- [ ] Docs distinguish portable archive from true single executable and list deferred maintainer setup.
