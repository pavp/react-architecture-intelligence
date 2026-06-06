# Design: P13-S1 — `rai calibrate` (suggest-only) + config-file loading

Phase: design · Persistence: hybrid · Engram topic: `sdd/p13-s1-rai-calibrate/design`
Reads: proposal (obs #667), explore.md. Every structural claim below was verified against the
actual source files listed in §0.

## 0. Grounded facts (verified by reading source)

| Fact | Source | Verified value |
|------|--------|----------------|
| Core calibratable rule IDs | `analyzers/*.ts` `RULE_ID` | `react/shared-extraction`, `react/render-coupling`, `react/over-abstraction`, `react/hook-topology` |
| Adapter rule IDs ALSO use `react/` prefix | `adapter-react/.../container-presenter-role-drift.ts:19` | `react/container-presenter-role-drift` etc. — **cannot** distinguish core vs adapter by prefix |
| Config knobs | `config/schema.ts` | `shared.{minInstances,maxVariance,warnAtInstances,errorAtInstances,minCosine,minPropOverlap,minHookOverlap,minFpCardinality,outlierFreq}`, `renderCoupling.{maxFanIn,maxFanOut,maxDirectChildren,maxReachableDepth}`, `overAbstraction.{maxProps,maxHooks,maxChildren,maxCompositionMarkers,maxConditionalBranches}`, `hookTopology.{maxFanIn,maxFanOut,maxDirectDependencies,maxReachableDepth}`, `memory.severityMap` |
| `renderCoupling`/`overAbstraction`/`hookTopology` are `.strict()` | `config/schema.ts:57,64,70` | extra keys rejected — patches must use only real knob names |
| `memory.severityMap` shape | `config/schema.ts:39` | `Record<"info"\|"warn"\|"error", "info"\|"warn"\|"error">` optional; superRefine forbids raising severity (clamp DOWN only) |
| Verdicts | `types.ts:252` | `"accept" \| "reject" \| "wontfix" \| "confirm" \| "dismiss"` |
| T4 columns | `db/schema.sql:26-30` | `feedback_event(id, fingerprint, rule_id, verdict, source, origin_run_id, weight_hint, reason, commit_sha, created_at)` |
| T4 index | `db/schema.sql:31` | `idx_feedback_fp ON feedback_event(fingerprint, rule_id)` (no rule_id-only index; full scan acceptable for aggregate) |
| `openDb(path)` | `db/db.ts:12` | sync, opens `better-sqlite3`, sets WAL, loads sqlite-vec, execs schema (CREATE IF NOT EXISTS — opening absent path CREATES an empty db) |
| FeedbackStore query style | `memory/feedback-store.ts:58-67` | `db.prepare(sql).all(...)` → cast `as any[]` → map snake_case→camelCase |
| `resolveConfig(input)` | `config/resolve.ts:5` | `ConfigSchema.parse(input)` — throws ZodError on invalid; `resolveConfig({})` → `DEFAULT_CONFIG` |
| `RaiConfigInput` | `config/schema.ts:92` | `z.input<typeof ConfigSchema>` — all keys optional (every field has `.default`) |
| `resolveConfig({})` call sites in cli.ts | `cli.ts` | lines **64, 72, 101, 137, 173** (5 sites) |
| `resolveConfig({})` call sites in doctor.ts | `doctor.ts` | lines **113, 133** — both are **synthetic MCP construction probes**, NOT project analysis → leave as-is (see §2) |
| doctor command pattern | `doctor.ts:53-60` | `runDoctor` returns a report object; `formatDoctorReport` renders human text; `run()` switches `json` flag |
| CLI db path | `cli.ts:56,177,236` | default `.git/rai.sqlite`; `--db` flag; `resolveDbPath(dir, dbPath)` joins relative to dir |

**Decision D0 (blast-radius):** adapter rules share the `react/` namespace with core rules, so the
core-vs-adapter split MUST be an explicit allowlist (`CALIBRATABLE_RULES`), never a prefix test.
This is the single most important correctness fact for `suggest.ts`.

---

## 1. Architecture approach

Layered, additive, framework-agnostic-preserving. Three pure/near-pure layers + one I/O shell:

```
                 ┌─────────────────────────── packages/core (framework-agnostic) ───────────────────────────┐
  T4 (sqlite) ──▶│ aggregateFeedback(db)            │      computeSuggestions(stats, currentConfig)          │
                 │   memory/feedback-aggregate.ts   │ ───▶   calibration/suggest.ts                          │
                 │   • read-only SELECT             │        • PURE: no db, no fs, no clock, no random        │
                 │   • RuleFeedbackStats[]          │        • CALIBRATABLE_RULES allowlist (D0)              │
                 │   • deterministic sort by ruleId │        • CalibrationSuggestion[] (minimal config patch) │
                 └──────────────────────────────────┴────────────────────────────────────────────────────────┘
                                                                          ▲
                 ┌────────────────────── packages/cli (I/O shell) ───────┼───────────────────────────────────┐
  rai.config.json│ loadProjectConfig(dir): RaiConfigInput                │                                    │
  (project root) │   project-config.ts — READ-ONLY                       │                                    │
                 │                                                       │                                    │
                 │ runCalibrateCommand({dir, json, db?})                 │                                    │
                 │   cli.ts — opens db (SELECT-only) → aggregate ────────┘ → computeSuggestions               │
                 │            → CalibrateResult → human table | --json                                        │
                 │ + wire loadProjectConfig into the 5 resolveConfig({}) project-analysis call sites           │
                 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why this layering:** aggregation (SQL over T4) and suggestion math (pure transform) are
framework-neutral domain logic → they belong in `packages/core`. File-path conventions
(`rai.config.json` at root) and process concerns (argv, stdout, exit codes, db path) are CLI
concerns → `packages/cli`. This honors the guardrail "packages/core must stay framework-agnostic"
and "adapter/CLI code belongs outside core." Neither new core module imports `node:fs`/`node:path`
or any React semantics — they operate on a `Db` handle and plain config objects only.

**Pattern:** mirrors the existing `doctor` shape exactly — a pure report builder (`aggregate` +
`computeSuggestions` ≈ `runDoctor`) plus a renderer (`formatCalibrateReport` ≈ `formatDoctorReport`)
plus a `run()` switch case that toggles `--json`. No new architectural pattern is introduced.

---

## 2. Config-loading wiring (the gap fix — highest blast radius)

### 2.1 Enumerated `resolveConfig({})` call sites

**cli.ts (5 sites — ALL operate on a project dir → MUST wire `loadProjectConfig`):**

| # | Line | Function | Current | Change |
|---|------|----------|---------|--------|
| 1 | 64 | `runAnalyze(dir)` | `resolveConfig({})` | `resolveConfig(loadProjectConfig(dir))` |
| 2 | 72 | `runBackfillCommand({dir,...})` | `resolveConfig({})` | `resolveConfig(loadProjectConfig(input.dir))` |
| 3 | 101 | `runExplainCommand({dir,...})` | `resolveConfig({})` | `resolveConfig(loadProjectConfig(input.dir))` |
| 4 | 137 | `buildCliMcpServer(dir)` | `resolveConfig({})` | `resolveConfig(loadProjectConfig(dir))` |
| 5 | 173 | `run()` case `"mcp"` | `serveStdio({ config: resolveConfig({}), rootDir: dir, ...})` | `serveStdio({ config: resolveConfig(loadProjectConfig(dir)), rootDir: dir, ...})` |

**doctor.ts (2 sites — DO NOT wire):**

| # | Line | Context | Decision |
|---|------|---------|----------|
| — | 113 | `checkMcpConstruction` — synthetic "does the MCP server even construct" probe | **Leave `resolveConfig({})`.** This is a health check that the server *constructs*, not project analysis. Loading user config here would couple a diagnostic to user-config validity and could make `doctor` fail on a malformed `rai.config.json` — which is exactly the scenario the user runs `doctor` to debug. Keep it defaults-only. |
| — | 133 | `defaultNativeProbe` — synthetic native-dependency probe | **Leave `resolveConfig({})`.** Same reasoning: it only needs *a* valid config to open a db and load native deps. |

> Note: in S1 `runCalibrateCommand` itself does NOT call `resolveConfig` for analysis — it loads
> `loadProjectConfig(dir)` to *display* the current effective config (`resolveConfig(loadProjectConfig(dir))`)
> so the user sees what their patch would modify. That is site #6 (new), inside the new command.

### 2.2 Backward-compatibility invariant (BC-1)

`loadProjectConfig(dir)` returns `{}` when `rai.config.json` is absent. `resolveConfig({})` ≡
`DEFAULT_CONFIG` (proven: `DEFAULT_CONFIG = ConfigSchema.parse({})` at `resolve.ts:3`). Therefore for
any repo without a config file, every wired site produces a **byte-identical** config to today.

> **Edge BC-1a:** `resolveConfig({})` and `resolveConfig(loadProjectConfig(dir))` with absent file
> must `deep.equal`. The backward-compat test asserts exactly this on a temp dir with no config file,
> for at least one wired site (and structurally argues the other four are identical edits).

### 2.3 `loadProjectConfig` contract

**Decisions:**
- **D2a — absent file → `{}` silently.** No warning. This is the common case (no config yet) and
  must be noiseless for BC-1.
- **D2b — malformed JSON / invalid shape → throw `ProjectConfigError` (clear message, NOT a stack
  trace).** Justification: a malformed config silently falling back to defaults would mask a user
  typo and silently ignore their intended thresholds — a trust violation in a trust-first phase.
  The CLI `run()` wrapper catches `ProjectConfigError` and prints the message to stderr with exit
  code 2 (config error), never a raw stack. A custom error class lets `run()` distinguish
  user-config errors from internal failures.
- **D2c — validate via `ConfigSchema.partial().safeParse` for the *message*, but return the raw
  parsed object** so `resolveConfig` does the authoritative parse+default-fill.

### 2.4 `@rai/core` export additions

New symbols added to `packages/core/src/index.ts`:
- `export { ConfigSchema } from "./config/schema.js"`
- `export type { RaiConfig, RaiConfigInput } from "./config/resolve.js"`
- `export { aggregateFeedback, NEGATIVE_VERDICTS, VERDICTS } from "./memory/feedback-aggregate.js"`
- `export type { RuleFeedbackStats } from "./memory/feedback-aggregate.js"`
- `export { computeSuggestions, CALIBRATABLE_RULES, MIN_EVENTS, MIN_NEGATIVE_RATE } from "./calibration/suggest.js"`
- `export type { CalibrationSuggestion } from "./calibration/suggest.js"`
- `export { openDb } from "./db/db.js"`
- `export type { Db } from "./db/db.js"`

---

## 3. New modules

### 3.1 `packages/core/src/memory/feedback-aggregate.ts`

Exports `VERDICTS`, `NEGATIVE_VERDICTS`, `RuleFeedbackStats`, `aggregateFeedback(db: Db): RuleFeedbackStats[]`.
Two SELECT-only grouped queries (GROUP BY rule_id,verdict; and GROUP BY rule_id for COUNT(DISTINCT fingerprint)),
merge by ruleId, zero-fill all 5 verdicts, `negativeRate=(reject+wontfix+dismiss)/totalEvents` (guard total=0→0),
explicit JS sort by ruleId. Import ONLY `Db` + `Verdict` types. NO `node:fs`/`node:path`/React.

### 3.2 `packages/core/src/calibration/suggest.ts`

Exports `MIN_EVENTS=3`, `MIN_NEGATIVE_RATE=0.5`, `CALIBRATABLE_RULES` allowlist (4 rules → group/knob/current/max=50),
`CalibrationSuggestion`, PURE `computeSuggestions(stats, currentConfig: RaiConfig): CalibrationSuggestion[]`.
No clock/random/fs/db. Patches MINIMAL (one knob or one severityMap). Sort by ruleId.

### 3.3 `packages/cli/src/project-config.ts`

Exports `PROJECT_CONFIG_FILENAME="rai.config.json"`, `ProjectConfigError`, `loadProjectConfig(dir): RaiConfigInput`.
Resolve root, existsSync→{} if absent, readFileSync+JSON.parse (throw ProjectConfigError on fail),
validate via ConfigSchema.partial().safeParse for the MESSAGE but RETURN raw parsed. READS ONLY.

### 3.4 `packages/cli/src/cli.ts` additions

- `"calibrate"` added to Command union.
- `parseArgs` branch for calibrate.
- `runCalibrateCommand({dir, json, db?})`: samples `dbPresent=existsSync(path)` BEFORE `openDb`,
  `aggregateFeedback` → `loadProjectConfig(dir)` → `resolveConfig(...)` for `currentConfig` →
  `computeSuggestions`, `db.close()` in `finally`.
- `formatCalibrateReport(result)` pure renderer.
- `run()` case `"calibrate"` with json vs human, exit 0.
- `USAGE` line added.
- `ProjectConfigError` handling: single `try/catch` inside `run()`, exit 2, never a raw stack.

---

## 4. ADR-style decisions

| ADR | Decision | Rationale | Rejected alternative |
|-----|----------|-----------|----------------------|
| D0 | Core-vs-adapter split is an explicit `CALIBRATABLE_RULES` allowlist | adapter rules share the `react/` prefix (verified) — a prefix test would misclassify them | prefix test → WRONG, would match adapter rules |
| D1 | Aggregation + suggestion math live in `packages/core`; file/IO in `packages/cli` | framework-agnostic domain logic; honors core-purity guardrail | putting `loadProjectConfig` in core → would import `node:fs` into core |
| D2 | Malformed `rai.config.json` → throw `ProjectConfigError`, exit 2; absent → `{}` silent | silent default-fallback on malformed config masks user intent | warn+default → user's thresholds silently ignored |
| D3 | Core-rule suggestion = `current+1` on a single chosen knob; knob-at-cap or adapter rule → `memory.severityMap` downgrade | +1 is the least-disruptive deterministic step with no evidence correlation in S1 | suggest whole config (noisy); per-rule override (does not exist) |
| D4 | Per core rule, ONE representative knob | S1 has no evidence to pick among a rule's several knobs | suggest every knob of the group → noisy, not minimal |
| D5 | `runCalibrateCommand` records `dbPresent` before `openDb` | `openDb` CREATEs the file via `CREATE IF NOT EXISTS`, so presence must be sampled before open | sampling after open → always reports present (wrong) |
| D6 | `doctor.ts` `resolveConfig({})` sites NOT wired | they are synthetic health probes, not project analysis | wire all 7 sites → doctor becomes brittle |
| D7 | `negativeRate` numerator = reject+wontfix+dismiss only | grounded verdict polarity; `dismiss` counts as negative noise signal | counting dismiss as neutral → under-counts noise |

---

## 5. SUGGEST-ONLY enforcement (central guardrail)

**Invariant INV-1 (no config write):** No code path in `feedback-aggregate.ts`, `suggest.ts`, or
`runCalibrateCommand` writes, creates, or modifies any file. `loadProjectConfig` only `existsSync` +
`readFileSync`. There is NO `writeFileSync`/`mkdirSync`/`appendFileSync` anywhere in the new modules.

**Invariant INV-2 (no memory/db write):** `aggregateFeedback` issues only `SELECT`. No INSERT/UPDATE/
DELETE on `feedback_event`, `weight`, or any table.

**How tests assert it (the CENTRAL test):**
- Run `runCalibrateCommand` in a temp dir that has NO `rai.config.json`. Assert: after the call,
  `existsSync(join(tmp, "rai.config.json")) === false`.
- Pre-seed a `rai.config.json`, capture `statSync(...).mtimeMs` + byte contents before; run calibrate;
  assert mtime and contents are **unchanged**.
- T4 no-write: record `SELECT COUNT(*) FROM feedback_event` before and after; assert equal.

---

## 6. Output format

### 6.1 `--json` (deterministic, sorted by ruleId)

```json
{
  "rules": [],
  "suggestions": [],
  "currentConfig": {},
  "configFile": "/abs/path/rai.config.json | null"
}
```

### 6.2 Human (`formatCalibrateReport`)

Per-rule stats table + suggestion block + always-present SUGGEST-ONLY footer.

---

## 7. Edge cases & failure modes

| # | Scenario | Behavior | Exit |
|---|----------|----------|------|
| E1 | Empty T4 | `rules: []`, `suggestions: []`; human prints "No feedback recorded yet…" | 0 |
| E2 | DB file absent | `dbPresent=false`; human prints "No feedback database at <path>. Run analyze/feedback first." | 0 |
| E3 | Malformed `rai.config.json` | `ProjectConfigError`; `run()` prints `error.message` to stderr, no stack | 2 |
| E4 | `totalEvents===3 && negativeRate===0.5` (boundary) | triggers (both `>=`), emits suggestion | 0 |

---

## 8. DB open mode

`runCalibrateCommand` opens the db with the existing `openDb(path)`. Read-only INTENT enforced
behaviorally (SELECT-only). `openDb` does set WAL and exec the schema (idempotent CREATE IF NOT EXISTS),
which on an absent path creates an empty file — handled by sampling `dbPresent` BEFORE open (D5/E2).
`db.close()` called in a `finally`.

> **Accepted minor side effect:** opening an absent path creates an empty `rai.sqlite` (schema only,
> zero rows). Does NOT violate SUGGEST-ONLY (which concerns *config* files and *feedback/weight* mutation).

---

## 9. No analyzer / schema / db change confirmation

- **Analyzers:** UNCHANGED.
- **Config schema (`schema.ts`):** UNCHANGED.
- **DB schema (`schema.sql`):** UNCHANGED.
- **Core framework-agnostic:** `feedback-aggregate.ts` imports only `Db` type + `Verdict` type;
  `suggest.ts` imports only config + stats types. ZERO `node:fs`/`node:path`/React imports in core.
