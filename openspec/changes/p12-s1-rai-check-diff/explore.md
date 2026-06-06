# Exploration: P12-S1 — `rai check --diff` (CI scoped findings + exit code)

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p12-ci-pr-integration/explore` (obs #660, full P12 phase map)

## P12 Phase Map (context)

P12 = CI/PR integration. Sliced into 3 sequential PRs:

| Slice | Scope | Est. | Deps |
|-------|-------|------|------|
| **P12-S1** | `rai check --diff --base <ref>`: git changed-files + full-analysis + file-scoped finding filter + CI exit code | ~300 | none beyond existing |
| P12-S2 | `--net-new` flag via existing `Session.getDrift().added` + snapshot fallback | ~250 | S1 |
| P12-S3 | GitHub PR comments (external API, idempotent posting) — most risk, least reuse | ~500 (may split) | S1+S2 |

Strong reuse: net-new is already `getDrift().added` (P4 snapshot set-algebra); file scoping is `findingMatchesFile` (exists, exported); diff source is a ~25-line `spawnSync("git", ...)` (established pattern). GitHub is the only all-new piece → correctly last.

## P12-S1 Scope (this change)

`rai check [dir] --base <ref> [--json]` — local, no snapshot, no GitHub.

**What it touches:**
1. `packages/core/src/engine/git-diff.ts` (NEW ~25 lines): `gitChangedFiles(rootDir, baseRef)` — `spawnSync("git", ["diff", "--name-only", baseRef, "HEAD"])`, filter to .ts/.tsx/.js/.jsx, return relative paths. Mirrors `git-sha.ts` pattern.
2. `packages/core/src/index.ts` (+1): export `gitChangedFiles`.
3. `packages/cli/src/cli.ts` (~80 net new): add `"check"` to `Command` union; `base?: string` on `ParsedArgs`; `if (cmd === "check")` in parseArgs; `runCheck()`; `case "check":` in `run()` switch.
4. `packages/core/src/engine/git-diff.test.ts` (NEW ~50): unit tests (temp git repo, per `git-workspace.test.ts` precedent).
5. `packages/cli/src/cli.test.ts` (~50): parseArgs + runCheck tests.

**What it does NOT touch:** snapshot store, getDrift, GitHub API, SARIF, adapters, analyzers, packages/core analysis logic.

## Reuse (grounded, file paths)

| Module | Path | Used for |
|--------|------|----------|
| `findingMatchesFile` | `packages/core/src/explainability/file-refs.ts` | filter findings to changed files (all evidence kinds covered) |
| `runAnalyze` flow | `packages/cli/src/cli.ts` | full analysis base for runCheck |
| `spawnSync("git",...)` | `git-sha.ts`, `git-workspace.ts`, `backfill.ts` | pattern for gitChangedFiles |
| `createSession`/`resolveConfig`/`loadInstalledAdapters` | cli.ts | session setup, unchanged |

## Design forks → locked recommendations for proposal

1. **base-ref**: `--base <ref>` REQUIRED in S1 (no default — avoids wrong behavior on monorepos/odd branches). Auto-detect `GITHUB_BASE_REF` deferred to S2.
2. **scoped analysis**: Option B — full analysis + post-filter via `findingMatchesFile`. NOT pass-changed-files-only (would break cross-file analyzers: shared-extraction, boundary-violation, render-coupling). pipeline.ts comment confirms incremental was deferred.
3. **exit code**: 0 if no warn/error finding in changed files; 1 if any warn/error. Info-only does NOT trigger exit 1. Hardcode threshold in S1; `--min-severity`/config deferred.
4. **gitChangedFiles location**: `packages/core/src/engine/git-diff.ts` (beside git-sha.ts). Framework-agnostic (reading changed files isn't React-specific) → core is correct, keeps it out of CLI.
5. **output**: human-readable default (count + per-finding ruleId+severity+file), `--json` for machine. Full explanation stays in `rai explain`, not inlined here.
6. **net-new / SARIF / GitHub**: all OUT of S1 (S2/S3).

## Out of Scope (S1)

Net-new comparison (S2), GitHub PR comments (S3), SARIF, `--min-severity` config, `GITHUB_BASE_REF` auto-detect, snapshot dependency, any analyzer/core-analysis change.

## Core changes needed

YES but minimal + framework-agnostic: ONE new pure util `git-diff.ts` in `packages/core/src/engine/` (subprocess git wrapper — same class as existing `git-sha.ts`, no React semantics) + one export line. No analyzer, pipeline, or fact changes. The CLI command itself lives in `packages/cli`.

## Estimated lines

~300 total (production ~150, tests ~150). Fits even the 400 default budget. Single PR.

## Risks

- **Shallow CI clones** (`fetch-depth: 1`) break `git diff --name-only <base> HEAD` if base ref unfetched → document `fetch-depth: 0` / `git fetch origin <base>`.
- `findingMatchesFile` must stay in sync with future evidence kinds (low risk — P11 complete).
- `git` absent / base ref missing → handle gracefully (clear error, non-zero exit distinct from findings exit? proposal decides).

## Open Questions for Proposal

1. `--base` required (recommended) vs `GITHUB_BASE_REF` auto-detect — S1 required, defer auto-detect to S2.
2. DB path for `rai check` — `:memory:` is fine for S1 (no snapshot needed); `.git/rai.sqlite` becomes relevant in S2.
3. Error exit code (git failure / no base ref) distinct from findings exit code (1)? Recommend: git/usage errors → exit 2; findings present → exit 1; clean → exit 0.
4. S1 output detail — ruleId+severity+file only (recommend); full explanation stays in `rai explain`.

## Status

Ready for proposal. P12-S1 is the right first slice: zero external deps, no snapshot, max reuse, delivers the core CI primitive (non-zero exit on changed-file findings).
