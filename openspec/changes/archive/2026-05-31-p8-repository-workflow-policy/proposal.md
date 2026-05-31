# Proposal: P8 Repository Workflow Policy

## Intent

Define workflow, naming, PR template, and release branch/tag policy before P8-S3 real publishing. `main` becomes trunk/default target; `feat/rai-mvp-p0-p3` becomes legacy integration to retire after P8.

## Scope

### In Scope
- Document trunk workflow, branch naming, commit naming, PR title rules, PR template rules, tag gates, rollback, and release authority.
- Keep real publish blocked until policy and maintainer setup pass; add no dependencies.
- Link P8-S3 publish work from release/status/roadmap artifacts.

### Out of Scope
- GitFlow or long-lived `develop`, `release/*`, or `hotfix/*` branches.
- Branch rename, default-branch mutation, remote branch creation/deletion, protection changes, or tag creation without explicit maintainer/user confirmation.
- Real publish, secrets, tap/bucket ownership, release workflow execution, `semantic-release`, commitlint, PR-title workflow, or local hooks.

## Capabilities

### New Capabilities
- `repository-workflow`: Governance policy for trunk, naming, PR template, tag, release, rollback, and dry-run-to-publish gates.

### Modified Capabilities
- None.

## Approach

Use trunk-based simple policy, not GitFlow. Require short-lived branches, Conventional Commit commit messages and PR titles, one `type:*` label, issue link, PR template completion, passing CI, and reviewable diff size. Define stable `vX.Y.Z`, optional `vX.Y.Z-rc.N`, immutable published tags, and rollback via new patch/prerelease. Keep GoReleaser/manual tag authority and publish workflows dry-run/disabled. Defer commitlint + PR-title workflow to future P8-S3c; prefer CI enforcement over local hooks later.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/repository-workflow.md` | New/Modified | Trunk, naming, PR template, tag, release, rollback policy. |
| `docs/release-maintainer-checklist.md` | Modified | Naming, branch, tag, and publish prerequisites. |
| `docs/STATUS.md`, `docs/ROADMAP.md` | Modified | P8-S3a prerequisite for P8-S3b publish gates. |
| `packages/cli/src/release-config.ts` | Modified | Reject publish unless policy gates are represented. |
| `packages/cli/src/release-config.test.ts` | Modified | Cover policy gates. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Policy implies branch migration | Med | State no remote/default-branch mutation without explicit confirmation. |
| Naming implies tooling | Med | State no dependencies, commitlint, PR-title workflow, or hooks in P8-S3a. |

## Rollback Plan

Revert policy docs and validator changes. No branches, default-branch settings, tags, secrets, publish settings, or dependencies are mutated.

## Dependencies

- P8 exploration and existing dry-run release config.
- Later maintainer approval for branch/tag protection and publish secrets.
- Future P8-S3c may add CI commitlint/PR-title workflow; local hooks remain optional.

## Success Criteria

- [ ] `repository-workflow` capability covers naming and automation deferral.
- [ ] Policy names branch/commit/PR-title/template rules.
- [ ] Release policy keeps GoReleaser/manual tag authority without `semantic-release` or new dependencies.
- [ ] Remote/default-branch mutation and P8-S3b real publish remain blocked until gates pass.
