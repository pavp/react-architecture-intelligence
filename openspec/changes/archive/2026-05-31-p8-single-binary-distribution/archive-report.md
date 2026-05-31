# Archive Report: P8 — Single Binary Distribution

## Change

- Change: `p8-single-binary-distribution`
- Archived at: 2026-05-31
- Archived to: `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/`
- Persistence mode: hybrid
- Verification verdict: PASS WITH WARNINGS

## Executive Summary

P8 single-binary distribution is archived after P8-S1/S2/S3a/S3b safe gates passed. Active `distribution-install` spec now includes portable Go launcher, engine integrity, local prototype, version/asset coherence, release channel, and non-goal requirements.

Real Homebrew/Scoop install is not live: no tag, release, formula, manifest, or secrets exist. Channel repos `pavp/homebrew-tap` and `pavp/scoop-bucket` are initialized on `main` with README only; release workflow remains manual preflight/snapshot only and GoReleaser release stays disabled.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `distribution-install` | Updated | Added 6 P8 requirements and 11 scenarios from `single-binary-distribution` delta. |

## Archive Inputs

| Artifact | Source |
|----------|--------|
| Proposal | `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/proposal.md`; Engram #249 |
| Spec | `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/specs/single-binary-distribution/spec.md`; Engram #250 |
| Design | `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/design.md`; Engram #251 |
| Tasks | `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/tasks.md`; Engram topic `sdd/p8-single-binary-distribution/tasks` (#252 latest related memory) |
| Apply progress | `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/apply-progress.md`; Engram topic `sdd/p8-single-binary-distribution/apply-progress` (#256 latest related memory) |
| Verify report | `openspec/changes/archive/2026-05-31-p8-single-binary-distribution/verify-report.md`; Engram #265 |

## Verification Gate

- Critical issues: none.
- Warnings: channel repos contain README only; first Formula/bucket manifest remains future real-release setup.
- Safety constraints observed: no tags, releases, secrets, or `.atl/` changes created by archive.

## Source of Truth Updated

- `openspec/specs/distribution-install/spec.md`

## Next Recommended

Start P9 explainability work. Treat real publish activation as future gated release change after secrets and maintainer approval exist.

## Risks

- Real publish remains blocked until `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN` exist.
- First Homebrew Formula and Scoop manifest are still ungenerated; create only during explicitly approved first real release.
- Keep `.goreleaser.yaml` `release.disable: true` and workflow `--skip=publish` until real publish change is approved.
