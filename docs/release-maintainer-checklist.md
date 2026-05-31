# Release Maintainer Checklist

P8-S2 defines local dry-run release shape only. Dry-run only means no publish until every setup item below exists and P8-S3 enables release gates.

## Quick path

1. Run `pnpm release:check` to validate dry-run shape.
2. Run GoReleaser with snapshot/dry-run flags only.
3. Confirm archive layout exposes one user-facing `rai` plus `lib/rai/**` internals.

## Required maintainer setup before real publish

- [ ] Homebrew tap exists, e.g. `pavp/homebrew-rai`.
- [ ] Scoop bucket exists, e.g. `pavp/scoop-rai`.
- [ ] GitHub token/secret plan exists for release, tap, and bucket writes.
- [ ] Release workflow permissions are scoped to contents/package writes needed by GoReleaser.
- [ ] Release tag policy is documented, e.g. signed `vX.Y.Z` tags.
- [ ] Rollback policy is documented for broken archives, tap formulae, and Scoop manifests.
- [ ] Native dependency support matrix is confirmed for darwin/linux/windows on amd64/arm64.

## Dry-run contract

| Area | P8-S2 state |
|------|-------------|
| GitHub releases | Disabled in `.goreleaser.yaml` via `release.disable: true`. |
| Homebrew | Shape only, with `DRY_RUN_ONLY` placeholder repository owner. |
| Scoop | Shape only, with `DRY_RUN_ONLY` placeholder repository owner. |
| Install script | `scripts/install-rai.sh` prints planned dry-run behavior only. |
| Secrets | None required and none referenced by validation. |

## Portable archive layout

```text
rai(.exe)
lib/rai/metadata.json
lib/rai/engine/packages/cli/dist/index.js
lib/rai/runtime/...
lib/rai/native/<os>-<arch>/...
```

`rai` is the only user-facing command. Everything under `lib/rai` is an internal implementation detail for the launcher.

## Validation commands

```bash
pnpm release:check
goreleaser release --snapshot --clean --skip=publish
```

If GoReleaser is unavailable locally, `pnpm release:check` still validates repo-owned dry-run guardrails without publishing.
