# Archive Report: P8 Repository Workflow Policy

## Outcome

P8-S3a repository workflow policy is verified and archived. The `repository-workflow` capability now lives in active OpenSpec specs and the historical change folder is ready to move under the dated archive path.

## Change

| Field | Value |
|-------|-------|
| Change | `p8-repository-workflow-policy` |
| Archive date | `2026-05-31` |
| Artifact mode | `hybrid` / `both` |
| Verify verdict | PASS WITH WARNINGS |
| Critical issues | None |
| Warning carried forward | Known unrelated local diffs: `CLAUDE.md`, `openspec/config.yaml`, `.atl/`; avoid `git add .`. |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `repository-workflow` | Created active spec | Copied verified full delta from `openspec/changes/p8-repository-workflow-policy/specs/repository-workflow/spec.md` to `openspec/specs/repository-workflow/spec.md`. |

## Requirements Archived

- Main trunk workflow with `main` as trunk/default target.
- Legacy `feat/rai-mvp-p0-p3` retirement after P8.
- Short-lived work-unit branch policy.
- Branch naming, Conventional Commit commit naming, Conventional Commit PR title, and PR template policy.
- PR gates: approved issue, exactly one `type:*` label, completed template, CI, reviewable size, Conventional Commit squash merge.
- Release tag policy: `vX.Y.Z`, optional `vX.Y.Z-rc.N`, immutable published tags, rollback through new patch/prerelease tags.
- GoReleaser/manual tag authority remains; `semantic-release` is not added in P8.
- P8-S3c commitlint + PR-title workflow remains deferred.
- P8-S3b publish activation remains blocked until maintainer setup exists.
- No branch, default-branch, tag, remote, protection, secret, or publish mutation was performed.

## Source Artifact Traceability

| Artifact | Engram ID | Filesystem path |
|----------|-----------|-----------------|
| Proposal | `#279` | `openspec/changes/archive/2026-05-31-p8-repository-workflow-policy/proposal.md` |
| Spec | `#281` | `openspec/changes/archive/2026-05-31-p8-repository-workflow-policy/specs/repository-workflow/spec.md` |
| Design | `#280` | `openspec/changes/archive/2026-05-31-p8-repository-workflow-policy/design.md` |
| Tasks | `#282` | `openspec/changes/archive/2026-05-31-p8-repository-workflow-policy/tasks.md` |
| Apply progress | `#285` | `openspec/changes/archive/2026-05-31-p8-repository-workflow-policy/apply-progress.md` |
| Verify report | `#287` | `openspec/changes/archive/2026-05-31-p8-repository-workflow-policy/verify-report.md` |

## Verification Summary

| Check | Result |
|-------|--------|
| Verify report has CRITICAL issues | ✅ None |
| Tasks complete | ✅ 12/12 |
| Requirement compliance | ✅ 10/10 scenarios compliant |
| Tests/build/typecheck/lint | ✅ Passed in verify report |
| `git diff --check` | ✅ Passed in verify report |
| Review budget | ✅ 265 changed lines for scoped P8-S3a diff, below 800-line budget |

## Archive Checklist

- [x] Active `repository-workflow` spec created.
- [x] Archive report written before folder move.
- [x] Source artifact Engram IDs recorded.
- [x] Destructive merge avoided; no existing active `repository-workflow` spec was overwritten.
- [x] Remote/default-branch/tag/publish mutation avoided.
- [x] Historical change folder preserved under dated archive path.

## Next Recommended Work

Proceed to P8-S3b only after maintainer-owned setup exists: release channels, secrets, permissions, protected `main` and tags, explicit remote/default-branch confirmation, and support policy.
