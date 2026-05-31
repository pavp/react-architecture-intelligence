# Design: P8 Governance Automation

## Technical Approach

Use commitlint as the single Conventional Commit validator for both commit messages and PR titles. Keep enforcement in CI, not local hooks, so governance is consistent for all contributors without mutating developer machines or release authority. This updates repository workflow policy only; GoReleaser/manual `vX.Y.Z` tags remain the release authority and real publishing remains blocked until maintainer setup.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|--------------------------|-----------|
| Validator | Add `commitlint.config.cjs` extending `@commitlint/config-conventional` | Custom regex script; GitHub Action marketplace wrapper | Commitlint is standard, local/CI reusable, and avoids bespoke Conventional Commit parsing. CJS avoids ESM config-loader ambiguity in a `type: module` repo. |
| Dependency model | Add `@commitlint/cli` and `@commitlint/config-conventional` as root dev dependencies | Use only `pnpm dlx`; pin action version only in workflow | Root deps make local/manual scripts deterministic and let CI run with the lockfile already installed. |
| PR-title CI | Create `.github/workflows/pr-title.yml` on `pull_request` events: `opened`, `edited`, `synchronize`, `reopened` | Merge into current CI workflow; validate commits with `--from` | Separate workflow gives a clear required check and avoids fetching commit ranges. PR-title validation should lint `github.event.pull_request.title` directly. |
| Local scripts | Add `lint:pr-title` as a shell-friendly helper using `commitlint --edit`; skip mandatory hooks | Add `lint:commits --from`; add Husky/lefthook | PR-title script is useful for docs/manual verification. Commit-range linting is brittle across shallow clones and squash workflows; local hooks are out of scope. |
| Scope rules | Use conventional defaults only, no repo-specific scope enum | Enforce documented scopes in commitlint config | Current docs say scopes are recommended. Enforcing enum would reject valid future scopes and increase churn. |

## Data Flow

PR opened/edited/synchronize/reopened
    └─ GitHub event payload title
        └─ write title to temporary file
            └─ pnpm commitlint --edit <temp file>
                └─ status check pass/fail

Manual/local check
    └─ contributor writes title/message file
        └─ pnpm lint:pr-title --edit <file>
            └─ same commitlint config

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `commitlint.config.cjs` | Create | Central Conventional Commit rules via `@commitlint/config-conventional`. |
| `package.json` | Modify | Add commitlint dev dependencies and `lint:pr-title` script. |
| `pnpm-lock.yaml` | Modify | Lock new dev dependencies. |
| `.github/workflows/pr-title.yml` | Create | Validate PR title on `opened`, `edited`, `synchronize`, and `reopened`. |
| `docs/repository-workflow.md` | Modify | Replace automation deferral with CI enforcement guidance and manual local check. |
| `docs/STATUS.md` | Modify | Record P8-S3c governance automation state. |
| `docs/ROADMAP.md` | Modify | Move commitlint/PR-title enforcement from future note to completed P8 slice. |
| `openspec/changes/p8-governance-automation/specs/repository-workflow/spec.md` | Create | Delta spec for CI enforcement. |
| `openspec/specs/repository-workflow/spec.md` | Modify during archive | Merge enforcement requirements after verification. |

## Interfaces / Contracts

PR-title workflow contract:

```yaml
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
```

The job MUST install with `pnpm install --frozen-lockfile`, write `${{ github.event.pull_request.title }}` to a temporary file safely, and run `pnpm commitlint --edit <file>`. No secrets, branch mutation, tag mutation, or publish commands are used.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Config | Valid and invalid Conventional Commit titles | Manual/CI check with `pnpm commitlint --edit` using temp files. |
| Workflow | Event coverage and no release mutation | Review YAML and run syntax/lockfile install through normal CI. |
| Regression | Existing TypeScript and Go behavior unchanged | Run `pnpm test && pnpm test:launcher`; later verify should also run `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`. |

## Migration / Rollout

No data migration required. Rollout starts when GitHub Actions sees `.github/workflows/pr-title.yml` on PRs. Branch protection/default-branch settings are not changed by this slice.

## Open Questions

- None.
