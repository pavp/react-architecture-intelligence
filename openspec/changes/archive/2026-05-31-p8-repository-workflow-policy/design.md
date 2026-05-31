# Design: P8 Repository Workflow Policy

## Technical Approach

Implement P8-S3a as a policy-and-checks slice only. Add concise workflow policy for trunk, branch naming, commit naming, PR titles, PR template use, tags, and release authority; link it from release/status/roadmap artifacts; extend read-only release validation for policy evidence. Real publishing remains blocked; no dependencies, branches, default-branch settings, tags, remotes, secrets, GitHub settings, or `semantic-release` are added.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Workflow model | `main` trunk, short-lived branches, legacy `feat/rai-mvp-p0-p3` retirement after P8. | GitFlow; keep legacy branch as trunk. | Matches user decision without risky remote mutation. |
| Naming policy | Document branch prefixes, Conventional Commit commit/PR titles, and PR template completion now. | Add commitlint, PR-title workflow, or hooks now. | User chose no dependencies yet; future P8-S3c may add CI enforcement, local hooks optional. |
| Release authority | Keep GoReleaser/manual tag authority; define stable/prerelease tag rules and immutable published tags. | Add `semantic-release` in P8. | User explicitly deferred semantic-release; P8-S3b keeps real publish gates. |
| Enforcement boundary | Enforce repo-owned evidence only through docs and read-only validator snippets. | Mutate branch protections, tags, or remote branches. | P8-S3a documents and gates maintainer-owned changes, not executes them. |

## Data Flow

```text
docs/repository-workflow.md
        ├── linked by docs/release-maintainer-checklist.md
        ├── referenced by docs/STATUS.md and docs/ROADMAP.md
        └── checked by validateReleaseDryRunConfig()
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `docs/repository-workflow.md` | Create/Modify | Canonical `main` trunk, branch naming, commit/PR-title naming, PR template, tag/release/rollback policy. |
| `docs/release-maintainer-checklist.md` | Modify | Link naming, branch, tag, and P8-S3b publish prerequisites. |
| `docs/STATUS.md` | Modify | Show P8-S3a policy/checks and P8-S3b maintainer-gated publish activation. |
| `docs/ROADMAP.md` | Modify | Split P8-S3a policy/naming from S3b publish and future S3c automation. |
| `openspec/changes/p8-single-binary-distribution/tasks.md` | Modify | Sync Phase 5 with S3a naming/automation deferral and S3b real publish gates. |
| `packages/cli/src/release-config.ts` | Modify later | Check workflow snippets for naming policy, PR template policy, GoReleaser/manual tag authority, no `semantic-release`, and automation deferral. |
| `packages/cli/src/release-config.test.ts` | Modify later | Add RED/GREEN tests for incomplete naming/automation policy and passing repo policy gates. |

## Interfaces / Contracts

`validateReleaseDryRunConfig(root)` remains read-only. New evidence checks should verify workflow/checklist text states:
- `main` principal trunk/default branch target and `feat/rai-mvp-p0-p3` legacy retirement after P8;
- branch prefixes such as `feat/`, `fix/`, `docs/`, `chore/`, or `test/` with kebab-case scope;
- Conventional Commit commit messages and PR titles;
- repository PR template completion with issue, type, verification, and scope fields;
- GoReleaser/manual tag authority, `vX.Y.Z`, optional `vX.Y.Z-rc.N`, immutable published tags, and rollback via new patch/prerelease;
- no dependencies, `semantic-release`, commitlint, PR-title workflow, or local hooks in P8-S3a;
- future P8-S3c may add CI workflow enforcement; P8-S3b remains real publish gates.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Validator rejects missing/incomplete naming, PR template, tag, automation-deferral, rollback, and mutation-gate docs. | Add Vitest temp-root cases in `packages/cli/src/release-config.test.ts` during apply. |
| Integration | Actual repo passes dry-run release guard. | Existing `release:check` plus focused release-config test. |
| Docs | Workflow/checklist/status/roadmap align on S3a/S3b/S3c split. | Review markdown links and required snippets; run `git diff --check`. |

## Migration / Rollout

No migration executed. Rollout is documentation and validation only. P8-S3b or maintainer action can later update remote/default branch settings after explicit confirmation, then add real publish workflow after repositories, secrets, permissions, protected `main`/tag settings, and support matrix are confirmed. P8-S3c may add commitlint + PR-title CI workflow; local hooks stay optional.

## Open Questions

- [ ] None blocking. Maintainer still must approve future branch normalization and real publish setup.
