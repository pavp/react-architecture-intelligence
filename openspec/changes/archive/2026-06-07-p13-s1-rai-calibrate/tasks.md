# Tasks: P13-S1 — `rai calibrate` (suggest-only) + project config loading

Strict TDD ACTIVE — runner `pnpm test` (vitest). Each RED task writes a failing test FIRST; the paired GREEN task makes it pass with minimal code. Do NOT write impl before its RED test fails.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430-470 (impl ~250 + tests ~190) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR with `size:exception` (project budget = 800) |
| Delivery strategy | exception-ok (auto-forecast) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

Rationale: ~450 lines brushes the 400 default but sits well inside this project's 800 budget. Splitting `loadProjectConfig` from `calibrate` would ship a config loader with no consumer (and the wiring fix is the change's headline value), so a single PR with `size:exception` is the right call. Honor with work-unit commits below.

### Suggested Work Units (commit order within one PR)

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| 1 | core export plumbing | `chore(core): export ConfigSchema + config types` | Phase 1; unblocks tests |
| 2 | feedback aggregation | `feat(core): add read-only per-rule feedback aggregation` | Phase 2; tests with code |
| 3 | suggestion engine | `feat(core): add deterministic calibration suggestion engine` | Phase 3; tests with code |
| 4 | project config loader | `feat(cli): add rai.config.json loader (read-only)` | Phase 4; tests with code |
| 5 | config wiring (gap fix) | `fix(cli): wire project config into resolveConfig call sites` | Phase 5; BC test with code |
| 6 | calibrate command + guardrail | `feat(cli): add suggest-only rai calibrate command` | Phase 6+7; central no-write test with code |
| 7 | docs | `docs: note rai calibrate + rai.config.json convention` | Phase 9 |

## Phase 1: Foundation — core exports (D-export)

- [x] 1.1 Edit `packages/core/src/index.ts`: add `export { ConfigSchema } from "./config/schema.js";` and `export type { RaiConfig, RaiConfigInput } from "./config/resolve.js";` (currently NEITHER is exported — verified line 4 exports only `resolveConfig, DEFAULT_CONFIG`). Run `pnpm typecheck` to confirm new symbols resolve.

## Phase 2: aggregateFeedback (RED → GREEN) — INV-2, D7

- [x] 2.1 RED: create `packages/core/src/memory/feedback-aggregate.test.ts`. Seed a temp better-sqlite3 db (via `openDb`) with `feedback_event` rows by direct INSERT. Assert (Spec: Per-Rule Feedback Aggregation): `react/shared-extraction` with reject,reject,dismiss,accept → `totalEvents`=4, `negativeRate`=0.75, `byVerdict` reports reject:2 dismiss:1 accept:1 AND zero-fills confirm:0 wontfix:0; same fingerprint under two verdicts → `distinctFingerprints` counts it ONCE; rules with zero feedback absent; two calls deep-equal sorted by ruleId (byte `<`/`>`); empty db → `[]`. Run `pnpm test` — MUST fail (module missing).
- [x] 2.2 GREEN: create `packages/core/src/memory/feedback-aggregate.ts`. Export `VERDICTS`, `NEGATIVE_VERDICTS=["reject","wontfix","dismiss"]`, `RuleFeedbackStats`, `aggregateFeedback(db: Db): RuleFeedbackStats[]`. Two SELECT-only grouped queries (GROUP BY rule_id,verdict; and GROUP BY rule_id for `COUNT(DISTINCT fingerprint)`), merge by ruleId, zero-fill all 5 verdicts, `negativeRate=(reject+wontfix+dismiss)/totalEvents` (guard total=0→0), explicit JS sort by ruleId. Import ONLY `Db` + `Verdict` types. NO `node:fs`/`node:path`/React. `pnpm test` GREEN.

## Phase 3: computeSuggestions (RED → GREEN) — D0, D3, D4, pure

- [x] 3.1 RED: create `packages/core/src/calibration/suggest.test.ts`. Assert (Spec: Trigger Threshold, Core-Rule, Adapter-Rule, Deterministic Engine): trigger met (total≥3 AND negRate≥0.5) → suggestion; total<3 → none; negRate<0.5 → none; boundary total=3 negRate=0.5 → triggers (inclusive `>=`); each core rule → `raise-threshold` patch current+1 in its OWN group (`react/shared-extraction`→`shared.minInstances`, `react/render-coupling`→`renderCoupling.maxFanIn`, `react/over-abstraction`→`overAbstraction.maxProps`, `react/hook-topology`→`hookTopology.maxFanIn`); adapter/unknown rule (e.g. `react/container-presenter-role-drift`) → `downgrade-severity` with `{memory:{severityMap:{error:"warn",warn:"info"}}}` (D0: allowlist NOT prefix); core rule at cap (`current>=max`) → `downgrade-severity` fallback; EVERY emitted `configPatch` passes `ConfigSchema.partial().safeParse` (HARD gate); same input → identical output sorted by ruleId. `pnpm test` MUST fail.
- [x] 3.2 GREEN: create `packages/core/src/calibration/suggest.ts`. Export named consts `MIN_EVENTS=3`, `MIN_NEGATIVE_RATE=0.5`; `CALIBRATABLE_RULES` allowlist (4 rules → group/knob/current(c)/max=50 per design §3.3); `CalibrationSuggestion`; PURE `computeSuggestions(stats, currentConfig: RaiConfig): CalibrationSuggestion[]`. No clock/random/fs/db. Patches MINIMAL (one knob or one severityMap). Sort by ruleId. `pnpm test` GREEN.

## Phase 4: loadProjectConfig (RED → GREEN) — D2, read-only

- [x] 4.1 RED: create `packages/cli/src/project-config.test.ts`. Assert (Spec: Project Config File Loading): absent `rai.config.json` → `{}`; present valid partial `{"shared":{"minInstances":5}}` → returns parsed obj AND `resolveConfig(result)` applies override (others stay default); malformed JSON → throws `ProjectConfigError` whose message names the filename (NOT a stack); invalid shape (bad key/range) → throws `ProjectConfigError`. `pnpm test` MUST fail.
- [x] 4.2 GREEN: create `packages/cli/src/project-config.ts`. Export `PROJECT_CONFIG_FILENAME="rai.config.json"`, `ProjectConfigError`, `loadProjectConfig(dir): RaiConfigInput`. Resolve root (`isAbsolute(dir)?dir:join(process.cwd(),dir)`), `existsSync`→`{}` if absent, `readFileSync`+`JSON.parse` (throw `ProjectConfigError` on read/parse fail), validate via `ConfigSchema.partial().safeParse` for the MESSAGE but RETURN raw parsed (so `resolveConfig` fills nested `.default({})`). READS ONLY. `pnpm test` GREEN.

## Phase 5: Config-loading wiring (gap fix — highest blast radius) — BC-1

- [x] 5.1 RED: create `packages/cli/src/cli.config-backward-compat.test.ts`. BC-1a: in a temp dir with NO `rai.config.json`, assert `resolveConfig(loadProjectConfig(dir))` `deep.equal`s `resolveConfig({})` — proves all 5 wired sites are no-ops without a config file. `pnpm test` MUST fail (or assert intent before wiring).
- [x] 5.2 GREEN: edit `packages/cli/src/cli.ts` — import `loadProjectConfig`; replace `resolveConfig({})` with `resolveConfig(loadProjectConfig(<dir>))` at EXACTLY 5 sites: `runAnalyze` (~64, dir), `runBackfillCommand` (~72, input.dir), `runExplainCommand` (~101, input.dir), `buildCliMcpServer` (~136-137, dir), `run()` mcp case (~173, dir). Do NOT touch `doctor.ts` probe sites (D6). `pnpm test` GREEN (BC-1a passes).

## Phase 6: runCalibrateCommand + CLI dispatch (RED → GREEN) — D5, E1/E2

- [x] 6.1 RED: create `packages/cli/src/cli.calibrate.test.ts` (integration). Assert (Spec: Calibrate Output Shape, Graceful Empty-Feedback): `parseArgs(["calibrate","."])` → `{cmd:"calibrate",...}`; seeded feedback crossing threshold → `--json` has keys `rules`,`suggestions`,`currentConfig` (+`configFile`) AND is deterministic; human output contains stats table + copy-paste patch + SUGGEST-ONLY footer; empty feedback → human contains "No feedback recorded yet", exit 0 (E1); absent db → "No feedback database", exit 0 (E2). `pnpm test` MUST fail.
- [x] 6.2 GREEN: edit `packages/cli/src/cli.ts` — add `"calibrate"` to `Command` union (line 9); add `parseArgs` branch (`calibrate [dir] --json [--db]`); export `CalibrateResult` + `runCalibrateCommand({dir,json,db?})`: sample `dbPresent=existsSync(path)` BEFORE `openDb` (D5), `aggregateFeedback` → `loadProjectConfig(dir)` → `resolveConfig(...)` for `currentConfig` → `computeSuggestions`, `db.close()` in `finally`; add `formatCalibrateReport` renderer (per design §6.2); add `run()` case `"calibrate"` (json vs human, exit 0); add USAGE line. `pnpm test` GREEN.
- [x] 6.3 GREEN: edit `packages/cli/src/cli.ts` `run()` — wrap body so a thrown `ProjectConfigError` prints `error.message` to stderr and returns exit 2 (NEVER a stack; rethrow non-`ProjectConfigError`). Covers E3.

## Phase 7: CENTRAL GUARDRAIL — SUGGEST-ONLY no-write (INV-1 + INV-2) — PRIMARY acceptance

- [x] 7.1 Add to `cli.calibrate.test.ts` the dedicated no-write block (Spec: Suggest-Only Calibration Command, all 3 scenarios): (a) run calibrate in temp dir with no config → `existsSync(join(tmp,"rai.config.json"))===false`; (b) pre-seed `rai.config.json` → capture `statSync().mtimeMs`+bytes before, run, assert mtime+bytes UNCHANGED; (c) `SELECT COUNT(*) FROM feedback_event` equal before/after run. Scope: assert on `rai.config.json` + feedback row count, NOT "no db file" (openDb legitimately creates empty db — design §8). `pnpm test` GREEN.
- [x] 7.2 Static purity guard: grep `packages/core/src/memory/feedback-aggregate.ts` and `packages/core/src/calibration/suggest.ts` for `node:fs`/`fs.`/`writeFileSync`/`INSERT|UPDATE|DELETE` → MUST be zero matches. Record the grep result in the apply notes.

## Phase 8: VERIFY GATE (run all; record exact counts)

- [x] 8.1 `pnpm test` — record new total test count (pass/fail). All green.
- [x] 8.2 `pnpm test:launcher` — green.
- [x] 8.3 `pnpm typecheck` — green.
- [x] 8.4 `pnpm build` — green.
- [x] 8.5 `node scripts/check-core-framework-free.mjs` (or `pnpm lint`) — new core files framework-free, no React semantics.
- [x] 8.6 `git diff --check` (no whitespace errors) and `git diff --stat` — CONFIRM scope: 2 new core files + 1 new cli file; `cli.ts` + `index.ts` modified; NO analyzer / config-schema / db-schema change.

## Phase 9: Docs

- [x] 9.1 Update `docs/STATUS.md`: P13 In progress; P13-S1 `rai calibrate` (suggest-only) shipped; note P13-S2 (evidence-correlated suggestions) next.
- [x] 9.2 Update `docs/ROADMAP.md`: mark P13-S1 done / P13 in progress; add brief `rai calibrate [dir] [--json]` usage note + the `rai.config.json` project-root convention.

## Phase 10: SPEC SYNC NOTE for archive (do NOT do now — archive does this)

- [x] 10.1 At ARCHIVE only: promote the delta into TWO canonical capabilities in DIRECTORY form (matching how other capabilities are stored): `openspec/specs/calibration/spec.md` AND `openspec/specs/project-config-loading/spec.md`. Do not collapse into one file. Source = `openspec/changes/p13-s1-rai-calibrate/spec.md`.

## Traceability (task → spec requirement)

| Tasks | Spec requirement |
|-------|------------------|
| 2.1-2.2 | Per-Rule Feedback Aggregation |
| 3.1-3.2 | Deterministic Suggestion Engine, Suggestion Trigger Threshold, Core-Rule Threshold, Adapter-Rule Severity Downgrade |
| 4.1-4.2 | Project Config File Loading |
| 5.1-5.2 | Backward-Compatible CLI Wiring |
| 6.1-6.3 | Calibrate Output Shape, Graceful Empty-Feedback |
| 7.1-7.2 | Suggest-Only Calibration Command (PRIMARY) |
| 1.1 | enables Deterministic Suggestion Engine (patch validation needs ConfigSchema) |
