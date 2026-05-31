# Release Maintainer Checklist

P8 release activation enables real GoReleaser publishing in checked-in config, but apply does not create tags or releases. Homebrew/Scoop install becomes available only after the first successful vX.Y.Z release makes Homebrew/Scoop install available through generated tap formula and bucket manifest commits.

## Quick path

1. Read [`docs/repository-workflow.md`](./repository-workflow.md) and confirm P8-S3a repository workflow policy gates.
2. Run `pnpm release:check` to validate channel names, policy docs, and safe publish gates.
3. Use `workflow_dispatch` without `RELEASE_PUBLISH_CONFIRM` for read-only preflight; it runs GoReleaser with snapshot/dry-run flags.
4. Confirm archive layout exposes one user-facing `rai` plus `lib/rai/**` internals.

## Required maintainer setup before real publish

- [x] Homebrew tap exists: `pavp/homebrew-tap`.
- [x] Scoop bucket exists: `pavp/scoop-bucket`.
- [x] Homebrew tap has default branch `main` and initial README content.
- [x] Scoop bucket has default branch `main` and initial README content.
- [ ] First Homebrew formula exists in `pavp/homebrew-tap` after an explicitly approved first real release.
- [ ] First Scoop bucket manifest exists in `pavp/scoop-bucket` after an explicitly approved first real release.
- [x] GitHub token/secret plan exists for release, tap, and bucket writes.
- [x] `RAI_RELEASE_GITHUB_TOKEN` exists in repo Actions secrets for GitHub Release asset writes.
- [x] `RAI_HOMEBREW_TAP_TOKEN` exists in repo Actions secrets for `pavp/homebrew-tap` writes.
- [x] `RAI_SCOOP_BUCKET_TOKEN` exists in repo Actions secrets for `pavp/scoop-bucket` writes.
- [ ] Release workflow permissions are scoped to contents/package writes needed by GoReleaser.
- [ ] `main branch protection` exists and matches repository workflow policy.
- [ ] `tag protection` exists for release tags.
- [ ] Release tag policy is documented: stable `vX.Y.Z`, optional `vX.Y.Z-rc.N`, tags only from `main`, no moving published tags.
- [ ] Rollback policy is documented for broken archives, tap formulae, and Scoop manifests.
- [ ] Native dependency support matrix is confirmed for `support matrix darwin/linux/windows amd64/arm64`.
- [ ] rollback for GitHub Release assets, Homebrew formulae, and Scoop manifests is rehearsed through a new patch/prerelease tag.
- [ ] Branch naming, Conventional Commit commit messages, Conventional Commit PR titles, and repository PR template use match the repository workflow policy.
- [ ] No new dependencies, `semantic-release`, commitlint, PR-title workflow, or local hooks are added in P8-S3a.

## P8 release gates

| Gate | State |
|------|-------|
| P8-S3a repository workflow policy gates | Docs/checks only: `main` trunk policy, legacy branch retirement, naming policy, PR template policy, tag policy, rollback, automation deferral, and manual mutation gates are documented and validated. |
| P8-S3b real publish activation gates | Active config: channel repos exist, secrets are named and wired, tag/main/secret/check gates protect publish, and dry-run preflight remains available. Still pending: explicit maintainer tag action and first successful release-generated Formula/bucket manifests. |

## Dry-run contract

| Area | P8-S2 state |
|------|-------------|
| GitHub releases | Enabled in `.goreleaser.yaml`; workflow publishes only from validated `vX.Y.Z`/`vX.Y.Z-rc.N` tags on `origin/main`. |
| Homebrew | Real channel repository configured as `pavp/homebrew-tap`; repo has README-only `main`; formula publishing blocked until secrets, preflight, and first real release pass. |
| Scoop | Real channel repository configured as `pavp/scoop-bucket`; repo has README-only `main`; manifest publishing blocked until secrets, preflight, and first real release pass. |
| Install script | `scripts/install-rai.sh` prints planned dry-run behavior only. |
| Secrets | Required exact names: `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, `RAI_SCOOP_BUCKET_TOKEN`. |
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

## First publish runbook (post-verify explicit authorization required)

1. Confirm `main` branch protection, required checks, one-review gate, linear history, and release tag ruleset for `refs/tags/v*`.
2. Confirm `pavp/homebrew-tap` and `pavp/scoop-bucket` both have README-only `main` default branches; Formula/bucket manifest generation belongs to the first approved real release.
3. Confirm `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN` have least-privilege scopes.
4. Run `pnpm release:check` and keep failures at zero.
5. Create a manual `vX.Y.Z-rc.N` or `vX.Y.Z` tag only after explicit post-verify maintainer authorization; do not force-push or move tags.
6. If publish fails, rollback uses a new patch or prerelease tag; do not mutate published tags.
