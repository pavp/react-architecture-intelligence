# Design: P8 Release Activation

## Technical Approach

Turn existing P8 dry-run release shape into real publishing behind fail-closed gates. Keep release authority in manual `v*` tags and workflow confirmation. Apply only changes repository files; it must not call `git tag`, `gh release`, or GoReleaser publish against a real ref.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|-------------------------|-----------|
| Release trigger | `push` tags `v*` plus `workflow_dispatch` preflight/publish input | auto-versioning, branch pushes | Tags are existing release authority; dispatch preserves dry-run and controlled first publish. |
| Publish enablement | Remove `release.disable: true`; wire GoReleaser release/brews/scoops to exact env names | keep disabled and edit at release time | Config drift at release time is risky; checked-in config should match real path. |
| GitHub token | Workflow maps `RAI_RELEASE_GITHUB_TOKEN` to `GITHUB_TOKEN` and keeps original env for validation | rely on default token only | User-provided secret is explicit and least-privilege; GoReleaser expects standard GitHub auth. |
| Channel tokens | `.goreleaser.yaml` uses `{{ .Env.RAI_HOMEBREW_TAP_TOKEN }}` and `{{ .Env.RAI_SCOOP_BUCKET_TOKEN }}` for channel repositories | shared token | Separate secrets reduce blast radius. |
| Safety checks | Shell gates before GoReleaser: tag regex, main ancestry, secrets, `pnpm release:check`, tests/build | publish then inspect | Publishing must fail before side effects. |

## Data Flow

```text
maintainer creates vX.Y.Z tag after verify
  -> release.yml checks tag format + main ancestry + secrets
  -> pnpm release:check + tests + typecheck + build + release:prepare
  -> GoReleaser release --clean
  -> GitHub Release + pavp/homebrew-tap + pavp/scoop-bucket
```

Manual dispatch without publish confirmation runs same gates plus `goreleaser release --snapshot --clean --skip=publish`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.goreleaser.yaml` | Modify | Enable release publishing; set Homebrew/Scoop repository tokens from `RAI_*` env names. |
| `.github/workflows/release.yml` | Modify | Add tag trigger, dry-run/publish dispatch mode, permissions, env mapping, tag/main/secrets gates, and GoReleaser publish step. |
| `packages/cli/src/release-config.ts` | Modify | Replace dry-run-only validator expectations with activation-safe expectations. |
| `packages/cli/src/release-config.test.ts` | Modify | RED/GREEN tests for enabled publish, retained dry-run path, tag-only gate, exact secrets, and blocked unsafe workflows. |
| `docs/release-maintainer-checklist.md` | Modify | Add final activation runbook and no-tag apply rule. |
| `docs/repository-workflow.md` | Modify | Record tag/release authority and protections after activation. |
| `docs/STATUS.md`, `docs/ROADMAP.md` | Modify | Mark release activation planned/applied and final tag action pending. |

## Interfaces / Contracts

Workflow env contract:

```yaml
RAI_RELEASE_GITHUB_TOKEN: ${{ secrets.RAI_RELEASE_GITHUB_TOKEN }}
RAI_HOMEBREW_TAP_TOKEN: ${{ secrets.RAI_HOMEBREW_TAP_TOKEN }}
RAI_SCOOP_BUCKET_TOKEN: ${{ secrets.RAI_SCOOP_BUCKET_TOKEN }}
GITHUB_TOKEN: ${{ secrets.RAI_RELEASE_GITHUB_TOKEN }}
```

Valid release tags: `^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Release validator accepts safe activation and rejects unsafe publish | Vitest in `release-config.test.ts`. |
| Integration | Workflow/config snippets line up with GoReleaser token contract | `pnpm release:check`. |
| Full verify | Existing project safety | `pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `git diff --check`. |

## Migration / Rollout

No data migration. Merge activation config first. After verify, maintainer may explicitly authorize creating first `vX.Y.Z`/`vX.Y.Z-rc.N` tag.

## Open Questions

None.
