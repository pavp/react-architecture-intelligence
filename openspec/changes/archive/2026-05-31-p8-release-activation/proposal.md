# Proposal: P8 Release Activation

## Intent

Enable real, maintainer-gated GoReleaser publishing now that P8 distribution is archived, channel repos exist, and required repo secrets are present. Activation must be safe: no tag/release is created by apply; final tag creation remains explicit user authorization after verify.

## Scope

### In Scope
- Activate `.goreleaser.yaml` for GitHub Release assets, Homebrew tap `pavp/homebrew-tap`, and Scoop bucket `pavp/scoop-bucket`.
- Update `.github/workflows/release.yml` for manual `workflow_dispatch` and `v*` tag publish paths guarded by preflight checks.
- Retain dry-run/preflight path and document final tag-only release runbook.

### Out of Scope
- Creating tags, releases, formulae, manifests, or channel commits during apply.
- Adding `semantic-release`, auto-tagging, or branch/tag mutations.
- Changing analyzer, MCP, installer, or launcher runtime behavior.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `distribution-install`: real publish activation replaces dry-run-only release channel behavior behind explicit tag, ancestry, checks, protections, and secret gates.

## Approach

Switch release config from disabled publish to gated publish only for validated `vX.Y.Z`/`vX.Y.Z-rc.N` refs. Workflow must expose exact secret names `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN`, prove tag ancestry to `main`, run checks/tests/build, then invoke GoReleaser publish. Manual dispatch keeps a dry-run/preflight mode unless publish is explicitly confirmed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.goreleaser.yaml` | Modified | Enable GitHub release, Homebrew, and Scoop publishing with token/env gates. |
| `.github/workflows/release.yml` | Modified | Add tag/manual publish path, preflight, ancestry, and checks. |
| `packages/cli/src/release-config.ts` | Modified | Validate activation mode, secrets, publish command shape, and no unsafe triggers. |
| `packages/cli/src/release-config.test.ts` | Modified | Cover safe publish and blocked unsafe cases. |
| `docs/release-maintainer-checklist.md`, `docs/repository-workflow.md`, `docs/STATUS.md`, `docs/ROADMAP.md` | Modified | Record activation gates, runbook, and no-tag apply constraint. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Accidental publish | Medium | Require valid tag, main ancestry, secret presence, release checks, and manual confirmation. |
| Bad first tap/bucket write | Medium | Dry-run/preflight retained; rollback uses new patch/prerelease tag only. |

## Rollback Plan

Revert workflow/config/docs/test changes; keep existing tags/releases untouched. If a later authorized release publishes bad assets, rollback through a new patch or prerelease tag.

## Dependencies

- Repo secrets exist: `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, `RAI_SCOOP_BUCKET_TOKEN`.
- `main` protected and `refs/tags/v*` ruleset active.

## Success Criteria

- [ ] `pnpm release:check`, tests, typecheck, build, lint pass.
- [ ] Workflow cannot publish without `vX.Y.Z`/`vX.Y.Z-rc.N` tag on `main` history.
- [ ] Apply creates no tag or release.
