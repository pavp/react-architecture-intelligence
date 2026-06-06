# Design: P12-S1 — `rai check --diff` (CI Scoped Findings + Exit Gate)

## Technical Approach

Add a `check` command that runs the SAME full analysis as `analyze`/`explain`, then post-filters presented findings to those whose file refs intersect the git-changed-file set, and returns a CI exit code. No analyzer, pipeline, fact-extraction, or memory change. One new framework-agnostic core util (`gitChangedFiles`), one new core export, and a CLI command (parseArgs + `runCheck` + switch case). `runCheck` mirrors `runExplainCommand`'s proven path: `session.analyzeRepo(...)` populates `lastPresented`; `session.findSharedOpportunities({ includeSuppressed: false })` yields the filterable `PresentedFinding[]`. The pipeline's `analyzeRepo` return is a counts envelope (no finding array), so the Session method — not the pipeline return — is the finding source.

## Architecture Decisions

### Decision: gitChangedFiles error signaling — throw, not return null
**Choice**: `gitChangedFiles(rootDir, baseRef): string[]` throws `Error` on non-zero git status (mirrors `git-workspace.ts` / `backfill.ts`'s `git()` helper).
**Alternatives**: (a) return `null` like `resolveCommitSha` in `git-sha.ts`; (b) discriminated result `{ ok }`.
**Rationale**: `resolveCommitSha` returns `null` because failure is a benign diagnostic ("no SHA → skip snapshot"). Here, git failure (bad base ref, shallow clone, git absent) MUST become exit 2 with an actionable message — distinct from exit 0 (empty diff). `null`/empty-array conflates "no changes" with "git broke." The repo already has TWO precedents: graceful-null (`git-sha`) and throw-on-failure (`git-workspace`, `backfill`). The throw precedent fits a hard CI gate. `runCheck` catches and maps to exit 2.

### Decision: Finding source = findSharedOpportunities, not analyzeRepo return
**Choice**: After `session.analyzeRepo(...)`, read findings via `session.findSharedOpportunities({ includeSuppressed: false })` → `[...opportunities, ...conflicts]`.
**Alternatives**: read pipeline `analyzeRepo().presented`; expose a new Session method.
**Rationale**: `runAnalyze` returns the §5.2 counts envelope (no findings). `runExplainCommand` already establishes the exact filterable-finding path. `findSharedOpportunities` already excludes suppressed findings, which the gate wants (suppressed must never block CI). Reusing it avoids a new API surface.

### Decision: Share the analysis flow inline; do not refactor runAnalyze
**Choice**: `runCheck` builds its own `resolveConfig → loadInstalledAdapters → createSession → readSources → analyzeRepo` sequence (same 5 lines as `runExplainCommand`).
**Alternatives**: extract a shared `prepareSession(dir)` helper.
**Rationale**: `runAnalyze` returns counts, `runExplainCommand` returns explained findings — they already duplicate the 5-line setup intentionally. A premature shared helper expands the diff and couples three commands. Keep S1 additive; refactor is out of scope.

### Decision: Exit code via run() return value, not process.exit
**Choice**: `runCheck` returns `0|1|2`; `run()` returns it; `index.ts` calls `process.exit(code)`.
**Alternatives**: `process.exit` inside `runCheck`/the case.
**Rationale**: `packages/cli/src/index.ts` is the SOLE `process.exit` site (`if (code !== 0) process.exit(code)`). Every command returns a number from `run()`. Calling `process.exit` mid-flow would break test `captureStdout` (which awaits `run()`'s return). Match the convention exactly.

## Path-Form Trap (correctness-critical)

`readSources(rootDir)` stores `relative(rootDir, full)`, so finding file refs (`span.file`, `role.file`) are **rootDir-relative POSIX paths** (e.g. `app/dashboard/page.tsx`). `git diff --name-only <base> HEAD` (cwd=rootDir, NO `--relative`) emits paths relative to the **git repository toplevel**. These match IFF `rootDir` is the git repo root — which holds for the `repo()` test helper and the documented CI usage (run at repo root). `findingMatchesFile` normalizes ONLY a leading `./` (`file.replace(/^\.\//, "")`) — it does NOT handle backslashes or `--relative` subdir paths. Mitigation: (1) `gitChangedFiles` must NOT pass `--relative`; (2) document that `rai check` runs at the git repo root in S1 (subdir support is deferred); (3) the integration test asserts a positive match to catch silent empty-filter regressions. This is the single highest-risk failure mode — a mismatch silently filters everything out and the gate always passes.

## Data Flow

    argv ──parseArgs──▶ {cmd:"check", dir, base, json}
                              │
        gitChangedFiles(dir, base) ──▶ string[] (.ts/.tsx/.js/.jsx, repo-relative)
                              │ (throws → catch → exit 2)
        session.analyzeRepo({files:readSources(dir), asOf:0})  (FULL repo)
                              │
        findSharedOpportunities({includeSuppressed:false}) ──▶ PresentedFinding[]
                              │
        filter: keep f iff ∃ cf ∈ changed · findingMatchesFile(f, cf)
                              │
        sort (file, ruleId, fingerprint) ──▶ render (human|--json) + exit 0/1/2

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/engine/git-diff.ts` | Create | `gitChangedFiles(rootDir, baseRef): string[]` (~25 lines) |
| `packages/core/src/index.ts` | Modify | `export { gitChangedFiles } from "./engine/git-diff.js"` |
| `packages/cli/src/cli.ts` | Modify | `Command` += `"check"`; `ParsedArgs` += `base?`; parseArgs branch; `runCheck`; switch case; USAGE line |
| `packages/core/src/engine/git-diff.test.ts` | Create | Unit tests (temp git repo, mirrors `repo()` precedent) |
| `packages/cli/src/cli.test.ts` | Modify | parseArgs + `runCheck` integration tests |

## Interfaces / Contracts

```ts
// packages/core/src/engine/git-diff.ts
export function gitChangedFiles(rootDir: string, baseRef: string): string[] {
  const result = spawnSync("git", ["diff", "--name-only", baseRef, "HEAD"],
    { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git diff ${baseRef} HEAD failed`);
  }
  return (result.stdout ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
}
```

```ts
// cli.ts — parseArgs additions (match existing flag()/positional style)
// Command union: "analyze" | "explain" | "mcp" | "backfill" | "install" | "doctor" | "check" | "help"
// ParsedArgs: add `base?: string | undefined;`
if (cmd === "check") {
  const positional = argv.slice(1).filter((a) => !a.startsWith("--"));
  const checkDir = positional[0] && !positional[0].startsWith("--") ? positional[0] : ".";
  return { cmd: "check", dir: checkDir, base: flag(argv, "--base"), json: argv.includes("--json") };
}

// runCheck pseudocode → returns 0|1|2
export async function runCheck(input: { dir; base?; json? }): Promise<{ code; payload }> {
  if (!input.base) return { code: 2, payload: { error: "--base <ref> is required" } };
  let changed: string[];
  try { changed = gitChangedFiles(input.dir, input.base); }
  catch (e) { return { code: 2, payload: { error: e.message } }; }
  const config = resolveConfig({});
  const adapters = await loadInstalledAdapters({ rootDir: input.dir });
  const session = createSession({ config, registryFactory: adapters.registryFactory });
  session.analyzeRepo({ files: readSources(input.dir), asOf: 0 });
  const { opportunities, conflicts } = session.findSharedOpportunities({ includeSuppressed: false });
  const findings = [...opportunities, ...conflicts]
    .filter((f) => changed.some((cf) => findingMatchesFile(f, cf)))
    .sort(compareCheckFinding); // file → ruleId → fingerprint.structural
  const blocking = findings.some((f) => f.severity === "warn" || f.severity === "error");
  return { code: blocking ? 1 : 0, payload: { changedFiles: changed, findings } };
}

// run() switch:
case "check": {
  const r = await runCheck({ dir, base, json });
  process.stdout.write(json ? `${JSON.stringify(r.payload, null, 2)}\n` : renderCheckReport(r.payload));
  return r.code; // index.ts calls process.exit when non-zero
}
```

Severity uses `f.severity` (the presented/clamped value) for the gate, consistent with the §5.2 counts envelope `bySeverity`. `--json` payload: `{ changedFiles: string[]; findings: PresentedFinding[] }`. Human output: `renderCheckReport` prints `RAI check: N finding(s) in M changed file(s)` then one line per finding `  - <ruleId> (<severity>) <file>` using the first matching changed file (or the finding's primary file ref).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `gitChangedFiles`: changed list, extension filter (drops `.md`/`.json`), throw on bad base ref | Temp git repo via `mkdtempSync` + `git init/config/commit` (mirror `repo()`); assert array + `expect(() => …).toThrow()` for `gitChangedFiles(dir, "nonexistent")` |
| Unit | `parseArgs`: `check` routing, `--base`, optional `[dir]`, `--json`, missing `--base` (base undefined) | `expect(parseArgs([...])).toEqual({...})` like existing parseArgs tests |
| Integration | `runCheck`: scoping (finding in changed file reported, finding in unchanged file excluded), exit 0/1/2, `--json` shape, deterministic order, read-only (no feedback writes) | Build a temp repo where commit 2 changes file A (a finding source) but not B; assert exit 1 + A reported + B excluded; assert exit 2 when `base` omitted; assert sorted order stable |

Strict TDD (if active): write each test before/with its implementation unit; commit test + code together per work-unit-commits.

## Migration / Rollout

No migration. Purely additive: new file + new export + new dispatch branch. Rollback = revert the single PR (delete `git-diff.ts`, the export line, the `check` case, and the `"check"` union member). No existing behavior changes.

## Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| `--base` missing | exit 2, `--base <ref> is required` (before any git call) |
| base ref doesn't exist / shallow clone | `gitChangedFiles` throws → catch → exit 2 with git stderr |
| git absent from PATH | `spawnSync` status≠0 (or error) → throw → exit 2 |
| empty diff (no changed files) | empty `changed` → no findings match → exit 0, `0 finding(s)` |
| changed files, no findings in them | exit 0 |
| findings only in unchanged files | filtered out → exit 0 |
| info-only findings in changed files | not warn/error → exit 0 |
| warn/error finding in changed file | exit 1 |
| non-source changed file (`.md`, `.json`, `.css`) | filtered out by extension regex in `gitChangedFiles` |
| cross-file finding spanning changed + unchanged file | reported — `findingMatchesFile` matches via the changed file's ref |
| `rootDir` ≠ git toplevel (subdir) | path-form mismatch → empty filter; documented S1 constraint (run at repo root); deferred |
| suppressed finding in changed file | excluded — `findSharedOpportunities({includeSuppressed:false})` drops it |

## No-Analyzer-Change Confirmation

Analyzers, pipeline analysis logic, fact extraction, graph build, memory/overlay: ALL unchanged. `gitChangedFiles` is a subprocess git util in `core/engine` with no React/JSX semantics — same category as `resolveCommitSha`/`runBackfill`. `packages/core` stays framework-agnostic. Filtering is presentation-only over already-presented findings; no finding mutation, no new persistence.

## Open Questions

- None blocking. Subdir (`rootDir` ≠ git root) path normalization and `--relative` handling are explicitly deferred to a later slice.
