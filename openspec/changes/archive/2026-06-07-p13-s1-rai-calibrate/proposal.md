# Proposal: P13-S1 — `rai calibrate` (suggest-only) + config-file loading

## Intent

RAI surfaces findings, users reject or dismiss them, and the noise persists across every subsequent
run because no mechanism adapts thresholds to repo-specific patterns. P13-S1 closes that loop:
`rai calibrate [dir] [--json]` aggregates per-rule negative feedback from T4 (`feedback_event`)
and emits a deterministic, human-readable `Partial<RaiConfigInput>` patch the engineer reviews and
applies manually. This is the trust-first lead capability — SUGGEST-ONLY, no automatic config
changes, ever. The command is only actionable if the CLI can load a user config file; P13-S1
therefore also adds `loadProjectConfig(dir)` reading `rai.config.json` at the project root,
wired into all existing `resolveConfig({})` call sites. No config is loaded today, making every
calibration suggestion currently inert — this is a prerequisite, not a bonus.

## Guardrail Compliance (CRITICAL)

| Guardrail | Compliance |
|-----------|------------|
| No automatic config changes | `calibrate` is SUGGEST-ONLY; no write path exists in S1; asserted by a test verifying no config file is created/modified by the command |
| Findings immutable | `calibrate` reads T4 and config read-only; no insert/update anywhere |
| Memory changes only through explicit feedback tools | `calibrate` does NOT write feedback or T5 weights |
| Deterministic + auditable | `computeSuggestions` is a pure function; same T4 input → same output |
| `packages/core` framework-agnostic | feedback aggregation and suggestion engine are framework-neutral; `loadProjectConfig` lives in CLI only |

## Scope

### In Scope

- `rai calibrate [dir] [--json]` command (CLI dispatch, parseArgs, runCalibrateCommand, USAGE)
- Feedback aggregation: `aggregateFeedback(db) → RuleFeedbackStats[]` over T4 (GROUP BY rule_id, verdict)
- Deterministic suggestion engine: `computeSuggestions(stats, config) → CalibrationSuggestion[]`
  - Trigger: `negativeRate >= 0.5 && totalEvents >= MIN_EVENTS` (named constant, MIN_EVENTS = 3)
  - Output: `Partial<RaiConfigInput>` JSON patch (copy-paste ready)
  - Core calibratable rules: `react/shared-extraction`, `react/render-coupling`, `react/over-abstraction`, `react/hook-topology`
  - Adapter rules (P11 family): show feedback stats + suggest `memory.severityMap` downgrade only
- Config-file loading: `loadProjectConfig(dir) → RaiConfigInput` reads `rai.config.json` at project root; returns `{}` if absent (backward-compatible); validated via `ConfigSchema.partial()`; wired into all existing `resolveConfig({})` call sites (~5 sites in `cli.ts` + `doctor.ts`)
- Human table output + `--json` output
- Export of new types from `packages/core/src/index.ts`
- Unit tests: `aggregateFeedback`, `computeSuggestions` (determinism, empty-feedback, trigger boundary), CLI dispatch, backward-compat (absent config file → identical defaults)

### Out of Scope

- `--apply` config write (S3)
- Evidence-correlated suggestions — suggest `maxFanIn: observed+1` not generic `+1` (S2)
- Per-rule severity override config key (does not exist today)
- T5 suppression-state display in output (S2)
- Adapter config knobs for P11 family (no `ctx.config` reads in those analyzers)
- Any analyzer change, config schema change, db schema change
- Any memory write or feedback write

## Resolved Open Questions

| OQ | Decision |
|----|----------|
| OQ1: config file location | `rai.config.json` at project root (follows tsconfig/eslintrc pattern) |
| OQ2: adapter-rule downgrade mechanism | `memory.severityMap` only — no per-rule override exists today |
| OQ3: `--min-events` flag | Deferred; `MIN_EVENTS = 3` is a named constant in S1 |
| OQ4: T5 suppression state in output | Deferred to S2 |

## Capabilities

### New Capabilities

- `calibration-suggest`: Feedback aggregation, deterministic suggestion engine, `rai calibrate` command (SUGGEST-ONLY)
- `project-config-loading`: `loadProjectConfig` convention — `rai.config.json` at project root, backward-compatible CLI wiring

### Modified Capabilities

- None (no existing spec-level behavior changes)

## Reuse

| Module | Path | Used for |
|--------|------|----------|
| Config schema + resolver | `packages/core/src/config/{schema,resolve}.ts` | Read current config; validate suggestions |
| T4 + openDb | `packages/core/src/db/db.ts` | Read `feedback_event` |
| FeedbackStore | `packages/core/src/memory/feedback-store.ts` | Reference; new aggregate query goes over `db` |
| doctor command | `packages/cli/src/doctor.ts` | Exact structural pattern for `runCalibrateCommand` |
| CLI dispatch | `packages/cli/src/cli.ts` | Extend command switch |
| Verdict / FeedbackEvent | `packages/core/src/types.ts` | Types |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/memory/feedback-aggregate.ts` | New | `aggregateFeedback(db)` — per-rule feedback stats |
| `packages/core/src/calibration/suggest.ts` | New | `computeSuggestions(stats, config)` — deterministic pure fn |
| `packages/cli/src/project-config.ts` | New | `loadProjectConfig(dir)` — reads `rai.config.json` |
| `packages/cli/src/cli.ts` | Modified | Add `calibrate` command; wire `loadProjectConfig` into all `resolveConfig({})` calls |
| `packages/core/src/index.ts` | Modified | Export new types (minimal) |

## Acceptance Signals (spec/design must preserve)

- [ ] `calibrate` produces no config file; test asserts no file created/modified after command run
- [ ] `computeSuggestions` is deterministic: same T4 snapshot → same suggestion list
- [ ] Trigger is exactly `negativeRate >= 0.5 && totalEvents >= 3` (named constant)
- [ ] Absent `rai.config.json` → `resolveConfig` output is byte-identical to current defaults
- [ ] Empty T4 → `calibrate` exits cleanly with a "no feedback recorded" message
- [ ] `packages/core` has no `fs` or path imports in new calibration modules

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| No feedback events → empty output confuses user | Med | Output guides user: "run analysis and record feedback first" |
| Config-loading wires into ~5 call sites | Low | Backward-compat test; absent file returns `{}` |
| Over-eager suggestions if floor too low | Low | `MIN_EVENTS = 3` constant; document it |
| Adapter rules not config-calibratable | Med | Output explicitly names adapter rules, points to `memory.severityMap` |
| Suggestion may not stop the exact rejected finding | Med | Phrase as "may reduce future noise for similar components" |

## Rollback Plan

Feature is purely additive (new files + CLI branch). To revert: remove new modules and the `"calibrate"` case from `cli.ts`. The `loadProjectConfig` wiring reverts to `resolveConfig({})` at each call site. No DB schema change, no data mutation.

## Size Note

~400–450 lines estimated. Brushes the 400-line default budget; within the 800-line project exception. Splitting config-loading to a standalone PR (S0, ~60 lines) is possible but not recommended — calibrate output is inert without it.

## Dependencies

- T4 `feedback_event` rows must exist (user must have run analysis + recorded feedback)
- No new npm dependencies
