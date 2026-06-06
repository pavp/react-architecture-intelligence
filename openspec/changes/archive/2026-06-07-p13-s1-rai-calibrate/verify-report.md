# Verify Report — p13-s1-rai-calibrate

**Verdict: PASS WITH WARNINGS**
**Status: done**

Executive summary: 0 CRITICAL, 1 WARNING, 2 SUGGESTIONS. SUGGEST-ONLY guardrail is enforced in code and proven by non-hollow tests; all 8 adversarial review points hold; all verification gates green. Ready for archive.

## Verification gates (run by verifier, not trusted from apply)

| Gate | Result |
|------|--------|
| `pnpm typecheck` (runs build first) | all 4 packages Done — clean. IDE stale "missing export" diagnostics were pre-build noise; real gate is green. |
| `pnpm test` | 70 files / 564 tests PASS |
| `node scripts/check-core-framework-free.mjs` | exit 0 |
| `git diff --check` | clean |
| Static grep (feedback-aggregate.ts + suggest.ts) for write/INSERT/UPDATE/DELETE/.run(/clock/random | 0 matches |
| New-test counts | feedback-aggregate 8, suggest 18, project-config 8, cli.calibrate 14 = **48** new tests |

### Scope (git status, incl. untracked)
- NEW: `packages/core/src/calibration/suggest.ts` (+suggest.test.ts), `packages/core/src/memory/feedback-aggregate.ts` (+test), `packages/cli/src/project-config.ts` (+test), `packages/cli/src/cli.calibrate.test.ts`
- MOD: `packages/cli/src/cli.ts`, `packages/core/src/index.ts`, `docs/STATUS.md`, `docs/ROADMAP.md`
- NO changes to analyzers, `config/schema.ts`, `db/schema.sql`, or `doctor.ts` — scope matches design exactly.

## Adversarial review points

### 1. SUGGEST-ONLY no-write (PRIMARY criterion) — ENFORCED + PROVEN (non-hollow)
**Code paths (verified read):**
- `feedback-aggregate.ts` — only `.prepare().all()` on two `SELECT ... GROUP BY` statements; no `.run/.exec/INSERT/UPDATE/DELETE`.
- `suggest.ts` — pure; no IO.
- `project-config.ts` — only `existsSync` + `readFileSync`.
- `runCalibrateCommand` (cli.ts:159-184) — `existsSync` -> `openDb` -> `aggregateFeedback` (SELECT) -> `computeSuggestions` (pure) -> `db.close()` in `finally`. No fs.write, no INSERT.
**Test (cli.calibrate.test.ts:179-222):** 3 guardrail tests actually invoke `runCalibrateCommand` over seeded feedback and assert: (a) `existsSync(rai.config.json) === false` (184); (b) pre-seeded config `afterBytes === beforeBytes` AND `afterStat.mtimeMs === beforeStat.mtimeMs` (202-203); (c) `feedback_event` `COUNT(*)` equal before/after (221). Correctly scopes no-write to config + rows, NOT db-file-existence (empty-db test 97-107 deliberately opens+closes an empty db — design §8 allows openDb to CREATE the file).

### 2. D0 allowlist NOT prefix-test — CORRECT
`computeSuggestions` uses `CALIBRATABLE_RULES.find(r => r.ruleId === stat.ruleId)` — exact equality over a 4-entry allowlist (shared-extraction, render-coupling, over-abstraction, hook-topology). Never a `react/` prefix. Adapter rule `react/container-presenter-role-drift` past trigger -> else branch -> `memory.severityMap` downgrade (real mechanism). Asserted: suggest.test.ts:88-94 (severityMap defined, `shared.minInstances` undefined) + 96-103 (exact 4-rule allowlist).

### 3. negativeRate D7 — CORRECT
`NEGATIVE_VERDICTS = [reject, wontfix, dismiss]`; numerator = full sum (dismiss = 1.0, not 0.5). Tests: "dismiss counts FULLY" (3 dismiss -> 1.0) and mixed 4/6 (feedback-aggregate.test.ts:51-73).

### 4. Trigger exactness — CORRECT
`if (totalEvents < MIN_EVENTS || negativeRate < MIN_NEGATIVE_RATE) continue` — both inclusive `>=`. COUNT-asserting tests: total<3->0 (33-37), rate<0.5->0 (39-43), boundary total=3/rate=0.5->triggers (45-49).

### 5. Config-loading backward-compat — OK, BC-1a non-hollow
project-config.test.ts:46-51 asserts `resolveConfig(loadProjectConfig(tmpDirNoFile))` deep-equals `resolveConfig({})`. 5 sites wired in cli.ts (lines 75, 83, 112, 147, 277). doctor.ts 113/133 left as `resolveConfig({})` (D6 honored — verified). Partial-merge honored (37-44: minInstances=7 applied, minCosine default 0.75 preserved).

### 6. Patches schema-valid + minimal — CORRECT
Each threshold patch hard-gated through `ConfigSchema.partial().safeParse` before being pushed (suggest.ts:88-89). Minimal: core patch keys === `["shared"]` only (test 174-179). Downgrade patch `{error:"warn", warn:"info"}` satisfies the clamp-down `superRefine` (schema.ts:41-51).

### 7. Core purity — CONFIRMED
suggest.ts imports `ConfigSchema` + types only; feedback-aggregate.ts imports `type Db` + `type Verdict` only. Zero fs/clock/random/React. framework-free guard exit 0.

### 8. openDb export ruling — ACCEPTABLE (not a leak)
Before this change the CLI obtained a db handle ONLY via `createSession({ dbPath })`, which internally calls `openDb`. But `Session` (tools.ts) keeps a PRIVATE `db`, exposes no public db accessor, no public db-close (`closeSession` is a finding-closure helper, not a lifecycle close), and NO read-all/aggregate-feedback method — only `recordFeedback` (a write). Routing calibrate through Session would have required adding a new public read method + a lifecycle close to Session and coupling a pure read-only command to the full findings/proof/registry machinery. Direct `openDb` + `aggregateFeedback(db)` + `db.close()` is the minimal, decoupled, read-only path. `Db` was already a cross-store concept. Exporting `openDb` is a modest, defensible API-surface expansion.

## Findings

### CRITICAL
- None.

### WARNING
- **W1 — `loadProjectConfig` returns the RAW parsed object, not the zod-validated `result.data`** (`project-config.ts:58`). Intentional (design D2: so `resolveConfig` fills nested `.default({})`), and safe today because every wired call site immediately passes the result into `resolveConfig(...)`, which re-validates via the full `ConfigSchema`. RISK: any FUTURE caller that consumes `loadProjectConfig(dir)` WITHOUT routing it through `resolveConfig` receives an unvalidated object (validation here only throws a friendly error, then discards the normalized data). Current code is correct; flag as maintenance hazard. FIX (optional, S2+): document the contract ("validated for errors, not normalized — must pass to resolveConfig") or return a branded type.

### SUGGESTION
- **S1 — STATUS.md says "40 new tests (8+18+8+14)"** — breakdown is right but the sum is 48, not 40. Trivial doc typo. FIX at archive: `40` -> `48`.
- **S2 — `maxCap: 50` in CALIBRATABLE_RULES is a self-imposed ceiling, not a schema constraint.** Schema knobs have `.min()` but no `.max()`; 50 is an arbitrary internal cap routing extreme cases to severity-downgrade. Covered by the at-cap test (suggest.test.ts:121-128) but the magic number is duplicated 4x with no shared constant. FIX (optional): extract `MAX_THRESHOLD_SUGGESTION`. Non-blocking.

## Tasks vs code state
All 20 tasks across 10 phases in apply-progress (#671) confirmed complete and matching disk/code state. tasks.md on disk present. No task claimed-done-but-missing.

## Archive caveat (MANDATORY)
This change introduces **TWO new capabilities**. At archive, create BOTH as **DIRECTORY-form** canonical specs from the delta — do NOT merge into an existing capability and do NOT create flat files (the P11-S6 mis-merge pattern):
- `openspec/specs/calibration/spec.md`
- `openspec/specs/project-config-loading/spec.md`

Existing specs already use directory form for new capabilities (e.g. `distribution-install/`, `react-pattern-analyzers/`), so this matches the established convention. Also apply S1 (40->48) and optionally W1 doc note / S2 const extraction at archive if cheap.

## Next recommended
`sdd-archive` (with the directory-form two-capability caveat above).
