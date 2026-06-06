# Exploration: P13-S1 — `rai calibrate` (suggest-only) + config loading

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p13-calibration/explore` (obs #666, full P13 phase map)

## P13 Phase Map (context)

P13 = Calibration (trust-first lead phase: the noise killer). `rai calibrate`, threshold suggestions
from feedback, NO automatic config changes. Sliced into 3 PRs:

| Slice | Scope | Est. | Deps |
|-------|-------|------|------|
| **P13-S1** | feedback aggregation + suggest-only `rai calibrate` + user config-file loading | ~400-450 | none |
| P13-S2 | richer suggestions: correlate feedback with finding evidence (suggest `maxFanIn: observed+1`, not generic +1) | ~200-300 | S1 |
| P13-S3 | human-gated `rai calibrate --apply` (merge-write config, confirmation prompt) | ~150-200 | S1 |

## Critical guardrail

Per project: "threshold SUGGESTIONS from feedback, NO automatic config changes." Calibrate SUGGESTS,
never writes config in S1. Output = a `Partial<RaiConfigInput>` JSON patch a human reviews + applies.

## Key findings (grounded)

**Thresholds already in `RaiConfig`** (`packages/core/src/config/schema.ts`) — NO hardcoded-threshold
problem for core analyzers:
- `shared.*`: minCosine, minPropOverlap, minHookOverlap, minInstances, warnAtInstances, errorAtInstances → `react/shared-extraction`
- `renderCoupling.*`: maxFanIn/maxFanOut/maxDirectChildren/maxReachableDepth → `react/render-coupling`
- `overAbstraction.*`: maxProps/maxHooks/maxChildren/maxCompositionMarkers/maxConditionalBranches → `react/over-abstraction`
- `hookTopology.*`: maxFanIn/maxFanOut/maxDirectDependencies/maxReachableDepth → `react/hook-topology`
- `memory.severityMap` → downgrade severity for any rule (incl. adapter rules)

**Feedback signal = T4** `feedback_event(fingerprint, rule_id, verdict, source, ...)`. Verdicts: accept/confirm +1, reject/wontfix -1, dismiss -0.5. No cross-rule aggregate query exists yet.

**CRITICAL GAP discovered:** every CLI command calls `resolveConfig({})` — empty input, defaults only.
**No user config file is ever loaded.** So calibrate suggestions would be un-actionable (nowhere to
apply them). P13-S1 MUST add `loadProjectConfig(dir)` reading `rai.config.json`, wired into the CLI.

**Adapter rules (P11 family) are NOT calibratable via config knobs** — they don't read `ctx.config`.
Calibrate shows their feedback stats but can only suggest `memory.severityMap` downgrade for them.

## P13-S1 Scope (this change)

`rai calibrate [dir] [--json]` — reads T4, aggregates per-rule feedback, prints deterministic
suggestions. NEVER writes config.

**Touches:**
1. `packages/core/src/memory/feedback-aggregate.ts` (NEW): `aggregateFeedback(db) → RuleFeedbackStats[]` — `SELECT rule_id, verdict, COUNT(*) GROUP BY rule_id, verdict`; `negativeRate = (reject+wontfix+dismiss)/total`.
2. `packages/core/src/calibration/suggest.ts` (NEW): `computeSuggestions(stats, config) → CalibrationSuggestion[]` — deterministic pure fn; trigger `negativeRate >= 0.5 && totalEvents >= 3`; emit least-disruptive `Partial<RaiConfigInput>` patch (core rule → raise the relevant knob; any rule → `memory.severityMap` downgrade). NOT ML (that's P20).
3. `packages/cli/src/project-config.ts` (NEW): `loadProjectConfig(dir)` reads `rai.config.json`, returns `{}` if absent (backward-compatible), validates via `ConfigSchema.partial()`.
4. `packages/cli/src/cli.ts` (MODIFY): add `"calibrate"` command; `runCalibrateCommand`; wire `loadProjectConfig` into the existing `resolveConfig({})` call sites; human table + `--json` output; USAGE.
5. `packages/core/src/index.ts` (+exports for new types).

**Does NOT touch:** analyzers, config schema, feedback store, db schema (T4 exists), any memory write.

## Reuse (grounded, file paths)

| Module | Path | Used for |
|--------|------|----------|
| Config schema/resolver | `packages/core/src/config/{schema,resolve}.ts` | read current config, validate suggestions/patch |
| T4 table + openDb | `packages/core/src/db/db.ts` | read feedback_event |
| FeedbackStore | `packages/core/src/memory/feedback-store.ts` | reference; new aggregate query goes over db |
| doctor command | `packages/cli/src/doctor.ts` | exact structural pattern for runCalibrateCommand |
| CLI dispatch | `packages/cli/src/cli.ts` | command switch to extend |
| Verdict/FeedbackEvent | `packages/core/src/types.ts` | types |

## Design forks → locked recommendations for proposal

1. **suggest-only vs --apply**: suggest-only in S1 (guardrail). `--apply` deferred to S3.
2. **which rules**: core-only calibratable rules (shared-extraction, render-coupling, over-abstraction, hook-topology). Adapter rules show stats + `memory.severityMap` suggestion only.
3. **signal threshold**: `negativeRate >= 0.5 && totalEvents >= 3` (named constant; `totalEvents>=3` floor prevents calibrate becoming noise itself).
4. **suggestion output**: `Partial<RaiConfigInput>` JSON patch (copy-paste ready), not display-only text.
5. **config file location**: `rai.config.json` at project root (follows tsconfig/eslintrc pattern).
6. **S0 (config loading) merge into S1**: YES — calibrate output is inert without it; splitting ships a config-loader with no consumer. Accept ~450 lines within the 800 project budget.
7. **DB path**: default `.git/rai.sqlite` (matches backfill); `--db` flag for custom.

## Out of Scope (S1)

`--apply` config write (S3), evidence-correlated suggestions (S2), per-rule severity override (doesn't exist), T5 suppression-state display (S2), adapter config knobs.

## Risks

- No feedback events → calibrate outputs nothing; output must guide user to record feedback first.
- Config-loading wires into ~5 existing `resolveConfig({})` call sites — mechanical, MUST test backward-compat (absent file → identical defaults).
- Over-eager suggestions if threshold too low — `totalEvents >= 3` floor is essential.
- Adapter rules not config-calibratable — output must say so + point to `memory.severityMap`.
- A suggestion may not stop the exact rejected finding (fingerprint may change) — output must phrase as "may reduce future noise for similar components."

## Open Questions for Proposal

1. `rai.config.json` root (recommended) vs `.rai/config.json`.
2. Adapter-rule severity downgrade via global `memory.severityMap` (only mechanism today) vs future per-rule override — S1 uses severityMap.
3. `--min-events` flag to override the floor — defer (constant in S1).
4. Show T5 suppression state in output — defer to S2.

## Status

Ready for proposal. P13-S1 is the right first slice: suggest-only (guardrail-safe), reuses T4 + config schema, closes the config-loading gap so output is actionable, core-rule suggestions deterministic + auditable.
