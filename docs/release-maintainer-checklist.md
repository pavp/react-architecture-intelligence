# Release Maintainer Checklist

P8-S3a adds repository workflow policy gates while keeping release Dry-run only. Real publish waits for P8-S3b real publish activation gates and maintainer confirmation.

## Quick path

1. Read [`docs/repository-workflow.md`](./repository-workflow.md) and confirm P8-S3a repository workflow policy gates.
2. Run `pnpm release:check` to validate dry-run shape and policy docs.
3. Run GoReleaser with snapshot/dry-run flags only.
4. Confirm archive layout exposes one user-facing `rai` plus `lib/rai/**` internals.

## Required maintainer setup before real publish

- [ ] Homebrew tap exists, e.g. `pavp/homebrew-rai`.
- [ ] Scoop bucket exists, e.g. `pavp/scoop-rai`.
- [ ] GitHub token/secret plan exists for release, tap, and bucket writes.
- [ ] Release workflow permissions are scoped to contents/package writes needed by GoReleaser.
- [ ] `main branch protection` exists and matches repository workflow policy.
- [ ] `tag protection` exists for release tags.
- [ ] Release tag policy is documented: stable `vX.Y.Z`, optional `vX.Y.Z-rc.N`, tags only from `main`, no moving published tags.
- [ ] Rollback policy is documented for broken archives, tap formulae, and Scoop manifests.
- [ ] Native dependency support matrix is confirmed for darwin/linux/windows on amd64/arm64.
- [ ] Branch naming, Conventional Commit commit messages, Conventional Commit PR titles, and repository PR template use match the repository workflow policy.
- [ ] No new dependencies, `semantic-release`, commitlint, PR-title workflow, or local hooks are added in P8-S3a.

## P8 release gates

| Gate | State |
|------|-------|
| P8-S3a repository workflow policy gates | Docs/checks only: `main` trunk policy, legacy branch retirement, naming policy, PR template policy, tag policy, rollback, automation deferral, and manual mutation gates are documented and validated. |
| P8-S3b real publish activation gates | Pending: maintainer-created channels, secrets, permissions, protected `main`/tags, support policy, and explicit confirmation. |

## Dry-run contract

| Area | P8-S2 state |
|------|-------------|
| GitHub releases | Disabled in `.goreleaser.yaml` via `release.disable: true`. |
| Homebrew | Shape only, with `DRY_RUN_ONLY` placeholder repository owner. |
| Scoop | Shape only, with `DRY_RUN_ONLY` placeholder repository owner. |
| Install script | `scripts/install-rai.sh` prints planned dry-run behavior only. |
| Secrets | None required and none referenced by validation. |
| Branch/tag mutation | Manual only; P8-S3a does not rename branches, change default branch, create tags, or modify protections. |
| Release authority | GoReleaser remains release artifact publisher; manual `vX.Y.Z` tags remain release authority. |
| Automation | P8-S3c may add commitlint and PR-title workflow later; CI enforcement is preferred over local hooks. |

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
