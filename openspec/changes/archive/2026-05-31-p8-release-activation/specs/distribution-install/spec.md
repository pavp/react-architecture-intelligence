# Delta for Distribution Install

## ADDED Requirements

### Requirement: Gated Real Release Publishing

The release system MUST publish GitHub Release assets, Homebrew formula updates, and Scoop manifest updates only from a validated `vX.Y.Z` or `vX.Y.Z-rc.N` tag that is reachable from protected `main`. It MUST NOT create tags or releases during implementation/apply; tag creation is a later explicit maintainer action.

#### Scenario: Real publish from authorized tag

- GIVEN required secrets `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN` exist
- AND a `vX.Y.Z` or `vX.Y.Z-rc.N` tag points to a commit reachable from `origin/main`
- WHEN the release workflow runs in publish mode after checks pass
- THEN GoReleaser publishes GitHub Release assets, Homebrew tap output, and Scoop bucket output

#### Scenario: Publish is blocked without safe ref

- GIVEN the workflow is not running for a valid `vX.Y.Z` or `vX.Y.Z-rc.N` tag
- WHEN publish mode is requested
- THEN the workflow fails before GoReleaser publish
- AND no release, formula, manifest, or tag is created

#### Scenario: Manual preflight remains read-only

- GIVEN a maintainer starts `workflow_dispatch` without publish confirmation
- WHEN preflight executes for a candidate release tag
- THEN it validates secrets, tag format, main ancestry, release checks, tests, build, and GoReleaser snapshot
- AND it skips publish

#### Scenario: Protection gates are documented and verified

- GIVEN release activation is reviewed
- WHEN maintainers inspect docs and release validation output
- THEN branch protection, tag ruleset for `refs/tags/v*`, required checks, review gate, and rollback through new tags are documented
- AND missing gates are reported as blockers

### Requirement: Exact Release Secret Contract

The release workflow and GoReleaser configuration MUST use repo secret/env names `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN`. Publishing MUST fail closed when any required value is absent.

#### Scenario: Required secret missing

- GIVEN any required release secret is unavailable
- WHEN release preflight or publish mode starts
- THEN the workflow exits non-zero before GoReleaser publish
- AND reports the missing secret name

#### Scenario: Tokens flow to channel publishers

- GIVEN all required release secrets exist
- WHEN GoReleaser is invoked in publish mode
- THEN GitHub Release, Homebrew tap, and Scoop bucket publishing receive their corresponding token values through the documented environment contract

## MODIFIED Requirements

None.

## REMOVED Requirements

None.
