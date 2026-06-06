# Proposal: P12-S1 — `rai check --diff` (CI Scoped Findings + Exit Gate)

## Intent

`rai check [dir] --base <ref> [--json]` gives CI pipelines a non-zero exit gate scoped to changed files. Today `rai analyze` always exits 0 and always reports all findings — making it useless as a blocking CI check. This slice introduces the foundational primitive: run full analysis (so cross-file analyzers stay correct), post-filter presented findings to those whose file references intersect the git-changed-file set, and exit 1 when any warn/error finding is present. This is the necessary first slice of P12; S2 (net-new via getDrift) and S3 (GitHub PR comments) depend on it.

## Scope

### In Scope

- `rai check [dir] --base <ref> [--json]` command — `--base` is REQUIRED (no default)
- `gitChangedFiles(rootDir, baseRef)` utility in `packages/core/src/engine/git-diff.ts` (~25 lines, spawnSync, filter .ts/.tsx/.js/.jsx); exported from `@rai/core`
- Full analysis (all repo files, existing `analyzeRepo` flow) + post-filter findings via existing `findingMatchesFile`
- Exit codes: 0 = no warn/error in changed files; 1 = ≥1 warn/error; 2 = git/usage error (missing `--base`, git failure)
- Human-readable output (count + per-finding ruleId + severity + file); `--json` for machine output
- Tests: parseArgs for `check`, unit tests for `gitChangedFiles`, runCheck integration test (~150 lines)

### Out of Scope

- Net-new finding comparison via `Session.getDrift` (S2)
- GitHub PR comments (S3)
- SARIF output
- `--min-severity` / severity threshold config
- `GITHUB_BASE_REF` auto-detect (defer to S2)
- Snapshot store dependency — S1 runs without snapshots
- Any analyzer, pipeline, or core analysis logic change

## Capabilities

### New Capabilities

- `ci-check-diff`: CLI command `rai check --diff --base <ref>` — scoped finding report with CI exit code

### Modified Capabilities

- None — existing analysis pipeline, explainability, and CLI adapter loading specs are unchanged at the requirement level

## Approach

1. Add `gitChangedFiles(rootDir, baseRef)` to `packages/core/src/engine/git-diff.ts` following the `spawnSync("git", ...)` pattern already used in `git-sha.ts`, `git-workspace.ts`, and `backfill.ts`. Framework-agnostic subprocess util — same category as `resolveCommitSha`.
2. Extend `ParsedArgs.cmd` union with `"check"` and add `base?: string`. Wire parseArgs branch.
3. Implement `runCheck({ dir, base, json? })` in `packages/cli/src/cli.ts`: call `gitChangedFiles`, then run the existing `analyzeRepo` flow (full repo, all files), then filter `presented` findings using `findingMatchesFile(finding, changedFile)` for each file in the diff set.
4. Add `case "check":` to `run()` switch: human output by default, `--json` flag for machine, `process.exit` with the resolved code (0/1/2).
5. Findings are read-only; filtering is a presentation concern — no finding mutation, no pipeline change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/engine/git-diff.ts` | New | `gitChangedFiles` util — ~25 lines |
| `packages/core/src/index.ts` | Modified | +1 export for `gitChangedFiles` |
| `packages/cli/src/cli.ts` | Modified | `check` command: parseArgs + runCheck + switch case (~80 net new lines) |
| `packages/core/src/engine/git-diff.test.ts` | New | Unit tests for gitChangedFiles (~50 lines) |
| `packages/cli/src/cli.test.ts` | Modified | parseArgs + runCheck tests (~50 lines) |

**Estimated total**: ~300 lines (production ~150, tests ~150). Fits single PR within 400-line budget.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Shallow CI clone: `git diff origin/main` fails if base not fetched | High | Document `fetch-depth: 0` / `git fetch origin <base>` as prerequisite; exit 2 with clear message |
| `findingMatchesFile` misses future evidence kinds | Low | Gap is P13+ concern; document as known debt |
| `git` absent in non-standard CI environment | Low | Detect spawnSync failure → exit 2 with actionable error message |

## Resolved Open Questions

| OQ | Decision |
|----|----------|
| OQ1: `--base` default? | Required, no default in S1. `GITHUB_BASE_REF` auto-detect deferred to S2. |
| OQ2: DB path for `rai check`? | `:memory:` is fine — S1 needs no snapshot. `.git/rai.sqlite` becomes relevant in S2. |
| OQ3: Distinct error exit code? | Yes — exit 2 for git/usage errors; exit 1 for findings present; exit 0 for clean. |
| OQ4: Output detail level? | ruleId + severity + file only. Full explanation stays in `rai explain`. |

## Rollback Plan

Delete the `check` case from `run()`, remove the `"check"` entry from the `Command` union, and delete `git-diff.ts`. All changes are additive (new file + extension of existing dispatch) — no existing behavior is modified. Rollback is a `git revert` of the single PR.

## Dependencies

- None beyond the existing codebase. No new npm dependencies.
- `git` must be available in the execution environment (documented prerequisite).

## Acceptance Signals (spec/design must preserve)

- [ ] Full `analyzeRepo` runs (cross-file analyzers receive full repo graph)
- [ ] Changed-file filter uses `findingMatchesFile` from `packages/core/src/explainability/file-refs.ts`
- [ ] Exit codes are exactly 0 / 1 / 2 with the defined semantics
- [ ] `--base` absent produces exit 2 with a clear usage error (not exit 1 or unhandled throw)
- [ ] Output order is deterministic (sorted by file then ruleId)
- [ ] `packages/core` remains framework-agnostic — `git-diff.ts` has no React semantics
- [ ] Info-only findings in changed files do NOT trigger exit 1
