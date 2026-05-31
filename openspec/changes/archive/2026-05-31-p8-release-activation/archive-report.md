# Archive Report: P8 Release Activation

## Change

`p8-release-activation`

## Status

Archived successfully on 2026-05-31.

## Summary

Release activation was verified and archived. The `distribution-install` source-of-truth spec now includes gated real release publishing and the exact release secret contract. No tag, release, secret, or protection mutation was created during archive.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `distribution-install` | Updated | Added 2 requirements: `Gated Real Release Publishing`, `Exact Release Secret Contract`. Modified 0. Removed 0. |

## Archived To

`openspec/changes/archive/2026-05-31-p8-release-activation/`

## Archive Contents

- `proposal.md` ✅
- `specs/distribution-install/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ — 9/9 tasks complete
- `verify-report.md` ✅ — PASS WITH WARNINGS, no critical issues
- `archive-report.md` ✅

## Source of Truth Updated

- `openspec/specs/distribution-install/spec.md`

## Verification Notes

- Active change directory `openspec/changes/p8-release-activation/` no longer exists.
- Archive directory contains required SDD artifacts.
- Verification report recorded no critical issues.
- Homebrew/Scoop install remains unavailable until first successful maintainer-authorized `vX.Y.Z` release generates tap formula and bucket manifest commits.
- Required repo secrets exist per final state, but secret values are unreadable by design.
- `.atl/` remained untracked and untouched.

## Engram Artifact IDs

| Artifact | Observation ID |
|----------|----------------|
| `sdd/p8-release-activation/proposal` | `324` |
| `sdd/p8-release-activation/spec` | `323` |
| `sdd/p8-release-activation/design` | `325` |
| `sdd/p8-release-activation/tasks` | `326` |
| `sdd/p8-release-activation/apply-progress` | `327` |
| `sdd/p8-release-activation/verify-report` | `330` |

## Risks / Follow-up

- Maintainer must explicitly authorize any future `vX.Y.Z` or `vX.Y.Z-rc.N` tag creation.
- Maintainer should confirm branch protection, tag ruleset, and repo secrets in GitHub UI before first real release.
- First successful release is required before Homebrew/Scoop install paths become live.
