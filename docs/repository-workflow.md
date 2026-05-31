# Repository Workflow Policy

RAI uses a simple trunk workflow: `main` is the principal trunk/default branch target, future work uses short-lived work-unit branches, and release tags come only from `main` after maintainer gates are confirmed.

## Quick path

1. Branch from `main` for one reviewable work unit using documented branch examples: feat/p8-release-policy, fix/release-check, docs/repository-workflow, chore/release-config, test/release-validator.
2. Open a PR to `main` with an approved issue, exactly one `type:*` label, passing CI, reviewable diff, repository PR template, and Conventional Commit squash merge title.
3. Keep release work dry-run only until P8-S3b maintainer setup is complete.

## Branch policy

| Topic | Policy |
|-------|--------|
| Trunk | `main is the principal trunk/default branch target`. |
| Legacy integration | `feat/rai-mvp-p0-p3 is legacy integration to retire after P8`. |
| Future work | Use short-lived work-unit branches when a branch is needed, then merge or squash-merge to `main`. |
| Large work | Split by reviewable work units when work exceeds the active review budget, unless maintainers approve `size:exception`. |
| Non-goal | Do not introduce GitFlow, long-lived `develop`, `release/*`, or `hotfix/*` branches for current repo work. |

## Naming policy

Use naming to tell reviewers what changed before they read the diff.

| Item | Policy | Examples |
|------|--------|----------|
| Branches | Use short-lived `<type>/<kebab-case-scope>` names. Preferred types are `feat`, `fix`, `docs`, `chore`, and `test`. | `feat/p8-release-policy`, `fix/release-check`, `docs/repository-workflow`, `chore/release-config`, `test/release-validator` |
| Commit messages | Use Conventional Commit commit messages. | `docs(workflow): document repository naming policy`, `test(release): require workflow automation deferral` |
| PR titles | Use Conventional Commit PR titles because squash merge should preserve release-readable history. | `docs(workflow): document repository naming policy` |
| PR body | Preserve the repository PR template and fill issue, type, verification, and scope fields. | Link approved issue, select exactly one `type:*` label, list tests run, and state out-of-scope work. |

Allowed/recommended scopes: `workflow`, `release`, `launcher`, `install`, `doctor`, `mcp`, `adapter-next`, `core`, `cli`, `docs`, `test`, and `openspec`. Prefer the narrowest scope reviewers can verify.

## PR gates

Every PR to trunk needs:

- approved issue
- exactly one type:* label
- passing CI
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

P8-S3a documents tag policy only. It does not create tags.

GoReleaser remains release artifact publisher, and manual vX.Y.Z tags are release authority. semantic-release is not added in P8.

## Automation deferral

P8-S3a adds no local hooks, no CI workflow enforcement, and no new dependencies in P8-S3a. Future P8-S3c may add commitlint and PR-title workflow after policy is stable; CI enforcement is preferred over local hooks. Local hooks may remain optional later.

## Manual gates

Branch renames, remote branch creation or deletion, default-branch changes, branch protection changes, tag creation, and publishing require explicit maintainer/user confirmation and are not executed in P8-S3a.

real publish remains disabled until P8-S3b maintainer setup, protected `main`/tag rules, release channels, secrets, permissions, and support policy exist.

## Rollback

Rollback for P8-S3a reverts policy docs and release validator checks only. It does not mutate branches, default-branch settings, tags, secrets, remotes, or publish channels.
