# Tasks: P8-S3c Governance Automation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1305 including untracked SDD artifacts |
| 400-line budget risk | High |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 dependency foundation → PR 2 governance behavior/docs → PR 3 SDD/OpenSpec sync |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Verification can proceed after documenting split: Yes

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| A | Commitlint dependency foundation | PR 1 | Base = tracker branch; `package.json`, `pnpm-lock.yaml`, `commitlint.config.cjs`, `lint:pr-title`. |
| B | Governance behavior, tests, and docs | PR 2 | Base = PR 1 branch; PR-title workflow, governance/release-config tests, workflow/status/roadmap docs. |
| C | SDD/OpenSpec sync only | PR 3 | Base = PR 2 branch; `openspec/changes/p8-governance-automation/**` and repository-workflow spec sync. Exclude `.atl/`. |

## Phase 1: RED Tests

- [x] 1.1 Add failing Vitest checks in `packages/cli/src/governance-automation.test.ts` for `commitlint.config.cjs` extending `@commitlint/config-conventional` and preserving flexible scopes.
- [x] 1.2 Add failing Vitest checks for `.github/workflows/pr-title.yml`: `pull_request` types `opened`, `edited`, `synchronize`, `reopened`, title-to-temp-file linting, and no secrets/publish/tag/default-branch mutation.
- [x] 1.3 Add failing Vitest checks that `package.json` includes commitlint deps/script and excludes `semantic-release`, mandatory hook tooling, and real publish scripts.

## Phase 2: GREEN Governance Automation

- [x] 2.1 Add root `commitlint.config.cjs` using Conventional Commit defaults only; do not add repo-specific scope enum.
- [x] 2.2 Add `@commitlint/cli` and `@commitlint/config-conventional` dev dependencies; update `pnpm-lock.yaml`.
- [x] 2.3 Add `package.json` script `lint:pr-title` that delegates to `commitlint` for manual `--edit <file>` checks.
- [x] 2.4 Create `.github/workflows/pr-title.yml` to install with `pnpm install --frozen-lockfile`, write PR title safely to a temp file, and run `pnpm commitlint --edit <file>`.

## Phase 3: Docs and OpenSpec

- [x] 3.1 Update `docs/repository-workflow.md` with CI-enforced PR-title/commit naming, optional local checks, flexible scopes, and no required local hooks.
- [x] 3.2 Update `docs/STATUS.md` and `docs/ROADMAP.md` with P8-S3c governance automation state and no semantic-release/real-publish scope.
- [x] 3.3 Keep `openspec/changes/p8-governance-automation/specs/repository-workflow/spec.md` aligned with implementation behavior for CI enforcement and remote-mutation exclusions.

## Phase 4: Verification

- [x] 4.1 Run targeted Vitest for governance automation tests, then fix failures without broadening scope.
- [x] 4.2 Run strict required gate: `pnpm test && pnpm test:launcher`.
- [x] 4.3 Run practical governance checks with temp files: valid title passes, invalid title fails via `pnpm lint:pr-title --edit <file>`.
- [x] 4.4 Inspect diff for excluded behavior: no `semantic-release`, no publish activation, no branch/default/tag mutation, no mandatory hooks.
