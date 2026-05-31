# Repository Workflow Policy

RAI uses a simple trunk workflow: `main` is the principal trunk/default branch target, future work uses short-lived work-unit branches, and release tags come only from `main` after maintainer gates are confirmed.

## Quick path

1. Branch from `main` for one reviewable work unit using documented branch examples: feat/p8-release-policy, fix/release-check, docs/repository-workflow, chore/release-config, test/release-validator.
2. Open a PR to `main` with an approved issue, exactly one `type:*` label, passing CI, reviewable diff, repository PR template, and Conventional Commit squash merge title.
3. Let CI validate the PR title with commitlint; optional local checks may use `pnpm lint:pr-title --edit <file>` before opening or editing a PR.
4. Release publishing runs only from validated `v*` tags on `main`; manual dispatch without confirmation remains read-only preflight.

## Branch policy

| Topic | Policy |
|-------|--------|
| Trunk | `main is the principal trunk/default branch target`. |
| Legacy integration | `feat/rai-mvp-p0-p3` was retired and deleted after the first successful P8 release. |
| Future work | Use short-lived work-unit branches when a branch is needed, then merge or squash-merge to `main`. |
| Large work | Split by reviewable work units when work exceeds the active review budget, unless maintainers approve `size:exception`. |
| Non-goal | Do not introduce GitFlow, long-lived `develop`, `release/*`, or `hotfix/*` branches for current repo work. |

## Naming policy

Use naming to tell reviewers what changed before they read the diff.

| Item | Policy | Examples |
|------|--------|----------|
| Branches | Use short-lived `<type>/<kebab-case-scope>` names. Preferred types are `feat`, `fix`, `docs`, `chore`, and `test`. | `feat/p8-release-policy`, `fix/release-check`, `docs/repository-workflow`, `chore/release-config`, `test/release-validator` |
| Commit messages | Use Conventional Commit commit messages. CI-enforceable naming uses commitlint conventional defaults. | `docs(workflow): document repository naming policy`, `test(release): require workflow automation deferral` |
| PR titles | Use Conventional Commit PR titles because squash merge should preserve release-readable history. PR-title CI validates the squash-title candidate on pull_request events. | `docs(workflow): document repository naming policy` |
| PR body | Preserve the repository PR template and fill issue, type, verification, and scope fields. | Link approved issue, select exactly one `type:*` label, list tests run, and state out-of-scope work. |

Allowed/recommended scopes: `workflow`, `release`, `launcher`, `install`, `doctor`, `mcp`, `adapter-next`, `core`, `cli`, `docs`, `test`, and `openspec`. Prefer the narrowest scope reviewers can verify. Commitlint intentionally keeps flexible scopes and does not enforce a fixed package-scope list.

## PR gates

Every PR to trunk needs:

- approved issue
- exactly one type:* label
- passing CI
- PR-title CI check passing
- reviewable diff
- Conventional Commit squash merge

## Release tag policy

| Topic | Policy |
|-------|--------|
| Source | Release tags must point to commits on `main`. |
| Stable tag | Use `vX.Y.Z`. |
| Prerelease tag | Use `vX.Y.Z-rc.N` when prerelease validation is needed. |
| Immutability | published tags must not move. |
| Rollback | rollback uses a new patch or prerelease tag. |

P8-S3a documented tag policy only. The first real release was later published as `v0.1.3` after maintainer authorization and green checks.

GoReleaser remains release artifact publisher, and manual vX.Y.Z tags are release authority. semantic-release is not added in P8.

## Governance automation

P8-S3c adds commitlint and PR-title workflow enforcement after policy stabilization. CI enforcement is preferred over local hooks: local hooks are optional, not required for compliance, and no mandatory Husky or Lefthook setup is added.

Manual PR-title check:

```bash
printf '%s\n' 'docs(workflow): document repository naming policy' > /tmp/pr-title.txt
pnpm lint:pr-title --edit /tmp/pr-title.txt
```

The PR-title workflow runs on `pull_request` `opened`, `edited`, `synchronize`, and `reopened` events. It writes the GitHub PR title to a temporary file and runs `pnpm commitlint --edit <file>` using the same root `commitlint.config.cjs` as local/manual checks.

Commitlint dependencies are governance-only. semantic-release is not added in P8, automated versioning is not activated, and real publish is activated only behind tag, main ancestry, secret, and check gates.

## Manual gates

Branch renames, remote branch creation or deletion, default-branch changes, branch protection changes, tag creation, and publishing require explicit maintainer/user confirmation and are not executed in P8-S3c. This supersedes the P8-S3a statement that remote mutations were not executed in P8-S3a.

real publish is active only through fail-closed gates after P8-S3b maintainer setup, protected `main`/tag rules, release channels, secrets, permissions, and support policy exist. `v0.1.3` generated the first Homebrew formula and Scoop manifest. The release tag ruleset for refs/tags/v* blocks deletion and non-fast-forward. The publish workflow must fail closed without release secrets, including `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN`.

## Publish readiness policy

P8 release activation validates real channel names and enables checked-in publish config, but apply does not create tags or releases. Safe publish requires all of these gates:

- `main` is the GitHub default branch and protected with required checks, one review, stale review dismissal, linear history, conversation resolution, and no force pushes/deletions.
- `refs/tags/v*` is protected against deletion and non-fast-forward updates.
- `pavp/homebrew-tap` has `Formula/rai.rb` generated by the first approved real release.
- `pavp/scoop-bucket` has `rai.json` generated by the first approved real release.
- Release secrets exist with exact names: `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN`.
- Publish runs require manual maintainer confirmation and a manual `vX.Y.Z` or `vX.Y.Z-rc.N` tag. No auto-tagging, force-push, deletion, or `semantic-release` is allowed.
- Homebrew/Scoop install became available after `v0.1.3`; future releases update generated channel files through GoReleaser.

## Rollback

Rollback for P8-S3c reverts policy docs, commitlint dependency/config changes, PR-title workflow, and release validator checks only. It does not mutate branches, default-branch settings, tags, secrets, remotes, or publish channels.
