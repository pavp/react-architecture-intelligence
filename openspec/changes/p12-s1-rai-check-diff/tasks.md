# Tasks: P12-S1 — `rai check --diff` (CI Scoped Findings + Exit Gate)

Strict TDD is ACTIVE. Test runner: `pnpm test` (vitest). Every implementation task pairs a RED step
(failing test written first) with a GREEN step (minimal code to pass). Commit test + code together as
one work unit (work-unit-commits skill). Do NOT write implementation before its test is RED.

Source of truth: spec `sdd/p12-s1-rai-check-diff/spec` (8 requirements, 16 scenarios) and design
`sdd/p12-s1-rai-check-diff/design` (4 ADRs + Path-Form Trap). Honor all of it.

Structural facts verified against the codebase before writing these tasks:
- `packages/cli/src/cli.ts`: `Command` union L9, `ParsedArgs` L10, `parseArgs` L25, `runExplainCommand`
  L100-107 (the exact precedent for `runCheck`), `run()` dispatch L154, `flag()` L222, `USAGE` L141.
- `runExplainCommand` already does: `analyzeRepo({files,asOf:0})` → `findSharedOpportunities({includeSuppressed:false})`
  → `[...opportunities,...conflicts].filter(f => findingMatchesFile(f, file))`. Mirror this in `runCheck`.
- `findingMatchesFile` is exported from `@rai/core` (`explainability/file-refs.ts`) and ALREADY imported
  in cli.ts L1. No new import wiring for the matcher.
- `packages/cli/src/index.ts` L7 already does `if (code !== 0) process.exit(code)` — exit-code wiring
  is already correct (Task 5 is verify-only, expected no-op).
- `packages/core/src/index.ts` exports engine modules at L5-7 (`analyzeRepo`, `runBackfill`) — add the
  `git-diff.js` export next to them.
- `git()` helper in `codemod/git-workspace.ts` L41-44 THROWS on `status !== 0` — the precedent
  `gitChangedFiles` must mirror (throw, NOT return null).
- `repo()` test helper in `cli.test.ts` L433: `mkdtempSync` + `git init`/`config`/`commit`. Install/doctor
  tests wrap with `realpathSync(...)` — DO the same for the check temp repo so rootDir equals the git
  toplevel on macOS (`/var` → `/private/var` symlink). This is correctness-critical for the path-form match.

---

## Task 1 — RED: gitChangedFiles unit tests

- [ ] Create `packages/core/src/engine/git-diff.test.ts`. Mirror the temp-git-repo pattern from
      `packages/core/src/codemod/git-workspace.test.ts` / `cli.test.ts` `repo()`: `realpathSync(mkdtempSync(...))`,
      `git init`, `git config user.email/user.name`, commit a base state, change files, commit.
- [ ] Assert: changed `.ts`/`.tsx`/`.js`/`.jsx` files between base ref and HEAD are returned as
      repo-relative POSIX paths (spec: Source-Extension Changed-File Filtering).
- [ ] Assert: extension filter drops non-source changes (`.md`, `.json`, `.css`) — set excludes them.
- [ ] Assert: empty/whitespace lines are trimmed and dropped.
- [ ] Assert: `expect(() => gitChangedFiles(dir, "does-not-exist-ref")).toThrow()` — unknown base ref THROWS.
- [ ] Assert: git failure (e.g. non-repo dir) THROWS (NOT null-return) — gate must distinguish broke-vs-empty.
- [ ] Run `pnpm test` → these tests FAIL (RED). Record the failing test names.

## Task 2 — GREEN: implement gitChangedFiles + export

- [ ] Create `packages/core/src/engine/git-diff.ts`. `gitChangedFiles(rootDir: string, baseRef: string): string[]`:
      `spawnSync("git", ["diff", "--name-only", baseRef, "HEAD"], { cwd: rootDir, encoding: "utf8", stdio: ["ignore","pipe","pipe"] })`.
- [ ] On `result.status !== 0` THROW `new Error(result.stderr?.trim() || result.stdout?.trim() || `git diff ${baseRef} HEAD failed`)`
      (mirror `git-workspace.ts` L41-44 — THROW, do NOT return null). Also handle spawn error (`result.error`) by throwing.
- [ ] Split stdout on `\n`, `.map(trim)`, `.filter(Boolean)`, `.filter(p => /\.(tsx|jsx|ts|js)$/.test(p))`. Return that array.
- [ ] DO NOT pass `--relative` (Path-Form Trap: `--relative` emits subdir-relative paths that won't match
      `readSources` rootDir-relative refs). Output stays git-toplevel-relative.
- [ ] `packages/core/src/index.ts`: add `export { gitChangedFiles } from "./engine/git-diff.js";` next to the
      existing engine exports (L5-7).
- [ ] Run `pnpm test` → Task 1 tests PASS (GREEN). Commit test + impl + export together (work unit:
      `feat(core): add gitChangedFiles git-diff util`).

## Task 3 — RED: parseArgs + runCheck integration tests

- [ ] In `packages/cli/src/cli.test.ts`, add `parseArgs` cases:
      - `parseArgs(["check","--base","main"])` → `{ cmd: "check", base: "main", ... }`.
      - optional `[dir]` positional: `parseArgs(["check","./pkg","--base","main"])` → dir = `./pkg`.
      - `--json`: sets `json: true`.
      - MISSING `--base`: `parseArgs(["check"])` → `base` undefined (validation happens in runCheck, not parseArgs).
- [ ] Add `runCheck` integration tests using a temp git repo helper that wraps `realpathSync(mkdtempSync(...))`
      (so rootDir === git toplevel — Path-Form Trap mitigation). Commit a base with TWO source files A and B
      that BOTH already trigger a finding; in the second commit modify only file A.
- [ ] Scenario assertions (map to the 16 spec scenarios):
      - Changed-file A finding IS reported; unchanged-file B finding IS excluded (Changed-File Scoped Reporting).
      - **MANDATORY positive-match assertion**: at least one finding for A is present in the filtered result —
        guards against a silent empty-filter regression (Path-Form Trap highest risk: gate always passes).
      - Cross-file finding touching changed A + unchanged B IS reported (Full-Analysis Correctness Preserved).
      - No changed source files (only `.md`/`.json` changed) → empty `changedFiles`, empty findings, exit 0.
      - info-only finding in changed file → exit 0 (CI Exit Code Gate: info MUST NOT cause exit 1).
      - warn/error finding in changed file → exit 1.
      - missing `--base` → exit 2 + clear usage error, no stack trace, BEFORE any git call.
      - git failure / unknown base ref → exit 2 + actionable error, no crash.
      - `--json` payload shape `{ changedFiles: string[], findings: PresentedFinding[] }`; exit code still per gate.
      - determinism: two runs over identical repo state + same ref → identical changedFiles, findings, exit code.
      - read-only: no finding mutation / no extra persistence beyond the analyze flow.
- [ ] Run `pnpm test` → new tests FAIL (RED). Record failing test names.

## Task 4 — GREEN: implement `check` command in cli.ts

- [ ] `packages/cli/src/cli.ts`: add `"check"` to the `Command` union (L9). Add `base?: string` to `ParsedArgs` (L10).
- [ ] Import `gitChangedFiles` from `@rai/core` (extend the existing L1 import; `findingMatchesFile`/`PresentedFinding`
      are already imported).
- [ ] `parseArgs` (L25): add a `check` branch — `cmd: "check"`, `dir` = first non-`--` positional or `"."`,
      `base: flag(argv, "--base")`, `json: argv.includes("--json")`.
- [ ] Implement `runCheck(input: { dir: string; base?: string; json?: boolean }): Promise<{ code: number; payload: ... }>`:
      - If `!input.base` → return `{ code: 2, payload: { error: "--base <ref> is required" } }` BEFORE any git call (ADR / Usage Error).
      - `try { changedFiles = gitChangedFiles(input.dir, input.base) } catch (err) { return { code: 2, payload: { error: <message> } } }` (ADR-1: throw → exit 2).
      - Inline the 5-line analysis setup (ADR-3, mirror `runExplainCommand` L100-107; do NOT refactor `runAnalyze`):
        `resolveConfig({})` → `loadInstalledAdapters({ rootDir: dir })` → `createSession({ config, registryFactory })`
        → `session.analyzeRepo({ files: readSources(dir), asOf: 0 })`.
      - Findings source = `session.findSharedOpportunities({ includeSuppressed: false })` (ADR-2: Session method, NOT
        the analyzeRepo counts envelope; `includeSuppressed:false` so suppressed never blocks the gate).
      - `findings = [...current.opportunities, ...current.conflicts].filter(f => changedFiles.some(cf => findingMatchesFile(f, cf)))`.
      - Sort deterministically: by file, then ruleId, then `fingerprint.structural` (Deterministic Results).
      - `blocking = findings.some(f => f.severity === "warn" || f.severity === "error")`. `code = blocking ? 1 : 0` (CI Exit Code Gate).
      - Return `{ code, payload: { changedFiles, findings } }`.
- [ ] Human renderer (default, no `--json`): summary line `RAI check: N finding(s) in M changed file(s)` + per-finding
      `  - <ruleId> (<severity>) <file>`, in the deterministic order (Output Format).
- [ ] `--json`: emit `JSON.stringify({ changedFiles, findings })`. For the error path (`code 2`) write the error
      message to stderr (no stack trace) regardless of `--json`.
- [ ] `run()` (L154): add `case "check"` — `const r = await runCheck({ dir, base, json })`; write human or json to stdout
      (or error to stderr on code 2); `return r.code`.
- [ ] Update `USAGE` (L141) with the `check [dir] --base <ref> [--json]` line.
- [ ] Run `pnpm test` → Task 3 tests PASS (GREEN). Commit test + impl together
      (work unit: `feat(cli): add rai check --base CI scoped-findings command`).

## Task 5 — Verify exit-code wiring (expected no-op)

- [ ] Confirm `packages/cli/src/index.ts` L7 maps `run()`'s return code to `process.exit`
      (`if (code !== 0) process.exit(code)`). Verified present — expected NO change.
- [ ] Confirm via the Task 3 integration tests that the 2-vs-1-vs-0 paths each return the correct code from `run()`.
      If (and only if) index.ts did not already wire it, add the mapping. Do not introduce mid-flow `process.exit`
      anywhere in cli.ts (ADR-4: single process.exit site; mid-flow exit breaks test stdout capture).

## Task 6 — VERIFY GATE (run all; record exact counts)

- [ ] `pnpm test` — record new total test count (must be higher than baseline; all green).
- [ ] `pnpm test:launcher` (`go test ./...`) — green.
- [ ] `pnpm typecheck` — green.
- [ ] `pnpm build` — green.
- [ ] `pnpm lint` (= `node scripts/check-core-framework-free.mjs`) — core stays framework-free. `gitChangedFiles`
      is a subprocess git util with NO React/JSX semantics (same category as `resolveCommitSha`/`runBackfill`), so
      this MUST still pass.
- [ ] `git diff --check` — no whitespace errors.
- [ ] `git diff --stat` — confirm ONLY these touched: `packages/core/src/engine/git-diff.ts` (new),
      `packages/core/src/engine/git-diff.test.ts` (new), `packages/core/src/index.ts` (export line),
      `packages/cli/src/cli.ts`, `packages/cli/src/cli.test.ts`, plus docs (Task 7). NO analyzer/pipeline/
      fact-extraction/memory/graph change (No-Analyzer-Change Confirmation).

## Task 7 — Docs

- [ ] `docs/STATUS.md`: mark P12 In progress; P12-S1 `rai check --diff` shipped; record the new baseline (test count
      from Task 6).
- [ ] `docs/ROADMAP.md`: P12 In progress; P12-S1 done; note P12-S2 (net-new via getDrift) is next.
- [ ] Add a brief `rai check [dir] --base <ref> [--json]` usage note AND the CI prerequisite (CI must fetch the base
      ref — `fetch-depth: 0` or explicit `git fetch` of the base — and `rai check` must run from the git repo ROOT,
      since S1 does not normalize subdir paths) to README or the appropriate doc (per the design Path-Form Trap risk).
- [ ] Keep docs in the same work-unit commit as the feature where reasonable (work-unit-commits: docs ship with the
      user-visible change).

## Task 8 — SPEC SYNC NOTE for archive (do at ARCHIVE, not now)

- [ ] This is a NEW capability `ci-check-diff`. At ARCHIVE, create the canonical spec in DIRECTORY form:
      `openspec/specs/ci-check-diff/spec.md` (matching how `cli-adapter-loading/`, `next-route-coupling/`, etc. are
      stored — verified: all `openspec/specs/*/spec.md`). Promote it from the delta in
      `openspec/changes/p12-s1-rai-check-diff/spec.md`.
- [ ] Do NOT merge into `react-pattern-analyzers` (or any existing capability) — `ci-check-diff` is its own capability.

---

## Parallelization

- Sequential chain: **Task 1 → Task 2** (RED before GREEN; export needed before CLI imports it),
  then **Task 3 → Task 4** (RED before GREEN; runCheck imports `gitChangedFiles` from Task 2),
  then **Task 5**, **Task 6**.
- Task 2 MUST complete (export available) before Task 3's `runCheck` integration tests can pass.
- **Task 7 (docs)** can be drafted in parallel once Task 4 is GREEN, but the STATUS baseline test count
  depends on Task 6 — finalize docs after Task 6.
- **Task 8** is an archive-time note; not executed in apply.
- Net: effectively one sequential implementation spine. No safe parallel writers (single PR, additive).

## Requirement → Task traceability

| Spec requirement | Task(s) |
|------------------|---------|
| Source-Extension Changed-File Filtering | 1, 2 |
| Changed-File Scoped Reporting | 3, 4 |
| Full-Analysis Correctness Preserved | 3, 4 |
| CI Exit Code Gate | 3, 4, 5 |
| Git and Usage Error Handling | 1, 2, 3, 4 |
| Output Format and JSON Shape | 3, 4 |
| Read-Only Findings Behavior | 3, 4, 6 |
| Deterministic Results | 3, 4 |

---

## Review Workload Forecast

- **Estimated changed lines**: ~250-300 net.
  - `git-diff.ts` ~25 + `git-diff.test.ts` ~70 (temp repo helper + 5 assertions).
  - `cli.ts` ~50 (Command/ParsedArgs/parseArgs branch + runCheck + renderer + switch + USAGE).
  - `cli.test.ts` ~90-110 (parseArgs cases + multi-scenario runCheck integration with temp repo).
  - `index.ts` core export +1; docs (STATUS/ROADMAP/usage note) ~20-30.
- **400-line budget risk**: **Low**. Honestly: ~300 fits comfortably inside both the 400 default budget and
  the 800 review budget for this change. The bulk is test code, which is expected and reviewable as one story.
- **Chained PRs recommended**: **No**. Single additive PR. The work is one coherent capability (core util +
  CLI command + tests + docs) with a clean rollback (revert one PR).
- **Decision needed before apply**: **No**. Proceed as a single PR with work-unit commits
  (commit 1: core gitChangedFiles + tests + export; commit 2: cli check command + tests; commit 3: docs).
