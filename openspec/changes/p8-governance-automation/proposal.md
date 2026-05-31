# Proposal: P8 Governance Automation

## Intent

Enforce the P8-S3a repository workflow policy in CI so invalid commit/PR titles fail before merge. P8-S3b real publishing remains blocked by maintainer setup, so this slice hardens governance without changing release authority.

## Scope

### In Scope
- Add commitlint configuration for Conventional Commit messages and PR titles.
- Add dev dependencies needed for commitlint enforcement.
- Add a PR-title CI workflow that checks `pull_request` titles.
- Add package scripts if useful for local/manual validation.
- Update `docs/repository-workflow.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, and OpenSpec repository workflow requirements.
- Add lightweight tests/checks where practical, then verify with `pnpm test && pnpm test:launcher`.

### Out of Scope
- No `semantic-release` or automated versioning.
- No GoReleaser real publish activation.
- No branch/default-branch/tag/protection mutation.
- No mandatory local hooks; optional docs-only guidance may mention manual local checks.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `repository-workflow`: add CI-preferred commit/PR-title enforcement while preserving manual tag authority and publish gates.

## Approach

Use commitlint as the single Conventional Commit validator. CI checks PR titles on `pull_request` events; package script supports local/manual checks without requiring hooks. Documentation explains CI as source of enforcement and keeps GoReleaser/manual `vX.Y.Z` tags as release authority.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json`, lockfile | Modified | Add commitlint deps and scripts if useful. |
| `commitlint.config.*` | New | Central Conventional Commit rules. |
| `.github/workflows/*` | New/Modified | Add PR title validation workflow/job. |
| `docs/repository-workflow.md` | Modified | Replace automation deferral with CI enforcement guidance. |
| `docs/STATUS.md`, `docs/ROADMAP.md` | Modified | Mark P8-S3c planned/implemented state after apply. |
| `openspec/specs/repository-workflow/spec.md` | Modified | Add enforcement requirements through delta/archive flow. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Commitlint rejects valid repo scopes | Med | Keep rules conventional and avoid over-constraining scopes unless documented. |
| Workflow misses fork/rename edge cases | Low | Use GitHub PR title from event payload; no secrets needed. |
| Dependency churn exceeds review budget | Low | Keep config/workflow/docs small; no semantic-release. |

## Rollback Plan

Revert commitlint config, package dependency/script changes, PR-title workflow, and docs/spec updates. No remote, tag, publish, or local hook state needs rollback.

## Dependencies

- GitHub Actions `pull_request` event availability.
- pnpm lockfile update for commitlint dev dependencies.

## Success Criteria

- [ ] Conventional Commit PR titles fail CI when invalid and pass when valid.
- [ ] Commitlint config is reusable from package scripts/workflow.
- [ ] Docs and repository-workflow spec reflect CI enforcement and excluded release automation.
- [ ] `pnpm test && pnpm test:launcher` passes.
