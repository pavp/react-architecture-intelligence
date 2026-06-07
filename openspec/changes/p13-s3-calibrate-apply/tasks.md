# Tasks: P13-S3 — `rai calibrate --apply`

Strict TDD ACTIVE: `pnpm test` (vitest). RED (failing test) → GREEN (minimal impl) for every code group.
Persistence: hybrid. Merges into `calibration` capability spec.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150–250 (core merge.ts ~40, cli.ts ~60, exports ~2, tests ~100) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR, work-unit commits |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (single PR; well under budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units (commits within ONE PR)

| Unit | Goal | Commit |
|------|------|--------|
| 1 | core merge helper + export | `feat(core): add mergeSuggestionsIntoConfig pure helper (P13-S3)` |
| 2 | export atomicWrite | `refactor(cli): export atomicWrite from writers (P13-S3)` |
| 3 | parseArgs --apply + apply sub-flow + banner + json | `feat(cli): add rai calibrate --apply guarded write (P13-S3)` |
| 4 | docs STATUS + ROADMAP | `docs(p13): mark P13-S3 calibrate --apply complete` |

## Phase A: Core merge helper (RED→GREEN→CHECK)

- [x] A.1 [SEQ][RED] Add `packages/core/src/calibration/merge.test.ts`: assert empty `{}` base + 1 `renderCoupling` suggestion → result has ONLY `renderCoupling`, NO default tree (CRITICAL guard #1); unrelated keys (`excludeGlobs`/`boundaries`/`conventions`/`reconcile`) preserved; multi-suggestion collision-free group-spread; deterministic CALIBRATABLE_RULES ordering. Ref: spec *Suggestion Merge Preserves Unrelated User Config*; ADR D1/D2.
- [x] A.2 [SEQ][GREEN] Create `packages/core/src/calibration/merge.ts` — pure `mergeSuggestionsIntoConfig(existing: RaiConfigInput, suggestions: CalibrationSuggestion[]): RaiConfigInput`; spread existing first, then group patches in CALIBRATABLE_RULES order; NO fs, NO validation, config/suggest TYPES only. Ref: ADR D1.
- [x] A.3 [SEQ][GREEN] Export `mergeSuggestionsIntoConfig` from `packages/core/src/index.ts` (next to `computeSuggestions*`, line ~11). Ref: ADR D1.

## Phase B: Export atomicWrite (GREEN)

- [x] B.1 [PAR][GREEN] Add `export` to `atomicWrite` in `packages/cli/src/install/writers.ts:121` (one word, no behavior change). Ref: design Interfaces/Contracts.

## Phase C: parseArgs --apply (RED→GREEN)

- [x] C.1 [SEQ][RED] In `cli.calibrate.test.ts`: assert `parseArgs(["calibrate",".","--apply","--yes"])` → `{ apply:true, yes:true }`; absence → `apply:false`/`yes:false`. Ref: spec *Guarded Config-Write via `--apply`*.
- [x] C.2 [SEQ][GREEN] Add `apply?: boolean` to `ParsedArgs` (cli.ts:12); calibrate branch (cli.ts:61) parse `argv.includes("--apply")` and `argv.includes("--yes")`. Ref: ADR D3.

## Phase D: runCalibrateCommand apply sub-flow (RED→GREEN)

- [x] D.1 [SEQ][RED] Tests in `cli.calibrate.test.ts` (one per scenario): (a) `--apply` no `--yes` → no file written, exit 0, result.applied="preview"; (b) `--apply --yes` → file written, exit 0, applied="written", on-disk == merged; (c) unrelated keys survive write; (d) empty config → writes ONLY suggested groups (CRITICAL #1); (e) zero suggestions → applied="noop", no write, exit 0; (f) idempotent: pre-seed canonical config → applied="idempotent", no rewrite, exit 0 (canonical equality, CRITICAL #3); (g) malformed config → exit 2, bytes byte-identical. Ref: spec scenarios + ADR D2/D3/D6.
- [x] D.2 [SEQ][GREEN] Refactor cli.ts:176 to `const rawInput = loadProjectConfig(absDir); const currentConfig = resolveConfig(rawInput);` (single load, RAW base — CRITICAL #1/#2). Ref: ADR D6.
- [x] D.3 [SEQ][GREEN] Add `apply?: boolean; yes?: boolean` (both default `false`) to `runCalibrateCommand` input; inside existing `try`, AFTER suggestions: `if (!apply) return suggest-only result`; else sub-flow per ADR D6 data flow — noop / merge / `ConfigSchema.partial().safeParse` / canonical(merged)==canonical(onDisk) skip / preview / `atomicWrite(configPath, canonical+"\n")`. `db.close()` stays in `finally`. Ref: ADR D2/D3/D4/D6.
- [x] D.4 [SEQ][GREEN] Extend `CalibrateResult` with `merged?: RaiConfigInput` + `applied?: "preview"|"written"|"noop"|"idempotent"` (cli.ts:152). Pass `apply`/`yes` in `runInner` calibrate case (cli.ts:308). Ref: ADR D4.

## Phase E: Output conditioning (RED→GREEN)

- [x] E.1 [SEQ][RED] Tests: human banner becomes `RAI calibrate — apply mode` and suggest-only NOTE suppressed when `result.applied` set; `--json --apply` (dry-run) stdout valid JSON with `merged`+`applied`, no write; `--json --apply --yes` JSON matches on-disk. Ref: spec *JSON Output Reflects Merged Config*; MODIFIED banner.
- [x] E.2 [SEQ][GREEN] `formatCalibrateReport` (cli.ts:197): single conditional on `result.applied` swaps banner + suppresses NOTE + appends D4 apply lines. `--json` needs NO runInner branch change (existing `JSON.stringify(result)` emits new fields). Ref: ADR D4/D5.

## Phase F: Guardrail no-regression (CHECK)

- [x] F.1 [SEQ][CHECK] Run the 6 existing GUARDRAIL tests UNCHANGED (cli.calibrate.test.ts:213,221,240,313,324,345) — all call `runCalibrateCommand({dir,dbPath})` (no `apply` → false). Do NOT edit them. Ref: spec MODIFIED *Suggest-Only* (default zero-write); CRITICAL #2.

## Phase G: Verification gate (CHECK)

- [x] G.1 [SEQ][CHECK] `pnpm test` (all green), `pnpm typecheck`, `pnpm build`. Result: 73 files / 615 tests all green.
- [x] G.2 [SEQ][CHECK] Framework-free: `rg "react|node:fs|fs/promises" packages/core/src/calibration/merge.ts` returns NOTHING (core stays framework/fs-free).
- [x] G.3 [SEQ][CHECK] `git diff --stat` confirms NO change to `config/schema.ts` or any analyzer; only merge.ts, index.ts, cli.ts, writers.ts (one word), tests.

## Phase H: Docs (GREEN)

- [x] H.1 [SEQ][GREEN] Update `docs/STATUS.md` + `docs/ROADMAP.md`: mark P13-S3 `rai calibrate --apply` complete.

## Phase I: Archive-merge note

- [ ] I.1 [SEQ] At archive: merge these deltas IN PLACE into `openspec/specs/calibration/spec.md` (existing capability — do NOT create a new path). Idempotence requirement already uses canonical-serialized equality. Ref: design Open Questions.

## Spec → Task Traceability

| Spec Requirement | Tasks |
|------------------|-------|
| Guarded Config-Write via `--apply` | C.1–C.2, D.1(a,b), D.3 |
| Suggestion Merge Preserves Unrelated User Config | A.1–A.3, D.1(c,d), D.3 |
| Apply Refuses on Malformed Existing Config | D.1(g), D.2, D.3 |
| Apply Is a No-Op When There Are No Suggestions | D.1(e), D.3 |
| Idempotent Apply Skips Redundant Write (canonical) | A.1, D.1(f), D.3 |
| Apply Write Is Atomic and Durable | B.1, D.3 |
| JSON Output Reflects the Merged Config Under `--apply` | D.4, E.1, E.2 |
| MODIFIED: Suggest-Only Calibration (Guardrail) | C.2, D.2, D.3, E.2, F.1 |
