# Explore: P13-S3 — `rai calibrate --apply`

Investigation only. Scopes a `--apply` flag for `rai calibrate` that WRITES the suggested config patch to `rai.config.json`. This is the FIRST write path in the calibrate flow — P13-S1 and P13-S2 were strictly SUGGEST-ONLY (a central, tested invariant). S3 deliberately introduces a guarded, opt-in write.

## Current State

`runCalibrateCommand` opens the db, runs `aggregateFeedback` + `lookupRejectedEvidence` + `computeSuggestionsWithEvidence`, and OUTPUTS suggestions only (human table via `formatCalibrateReport`, or `--json` shape `{rules, suggestions, currentConfig, configFile}`). Existing flags: `--json`, `--db`. No write occurs anywhere. `db.close()` in `finally`.

## Key Files (line refs)

| File | Lines |
|------|-------|
| `packages/cli/src/cli.ts` | 11-24 `ParsedArgs` (no `apply` field yet), 61-69 `parseArgs` calibrate (only `--json`/`--db`), 152-195 `runCalibrateCommand`, 197-241 `formatCalibrateReport`, 307-315 `runInner` calibrate case |
| `packages/cli/src/project-config.ts` | 1-59 `loadProjectConfig`, `ProjectConfigError`, `PROJECT_CONFIG_FILENAME` |
| `packages/cli/src/cli.calibrate.test.ts` | 213-219 INV-1, 221-238 INV-2, 240-256 db row count, 313-364 evidence-path guardrails |
| `packages/core/src/calibration/suggest.ts` | 15-61 `CALIBRATABLE_RULES` + `buildPatch`, 63-67 `CalibrationSuggestion` |
| `packages/core/src/config/schema.ts` | 11-92 `ConfigSchema`, `RaiConfigInput`, `RaiConfig` |
| `packages/core/src/config/resolve.ts` | 5-7 `resolveConfig` = `ConfigSchema.parse(input)` |
| `packages/cli/src/install/writers.ts` | 121-127 `atomicWrite` (temp + rename pattern) |

## Config Merge Mechanics

No existing deep-merge utility for `RaiConfigInput`. Each `CalibrationSuggestion.patch` has exactly ONE top-level group key and ONE nested knob — no two calibratable rules share the same `(group, knob)` pair, so a shallow group-level spread is collision-free.

Merge algorithm: read existing raw input (the on-disk `rai.config.json`, `{}` if absent) → iterate suggestions → for each, shallow-spread the group key on top → validate the result with `ConfigSchema.partial().safeParse()` → atomic write. `resolveConfig` fills defaults on read but does NOT merge two inputs. Unrelated user keys (`excludeGlobs`, `boundaries`, `conventions`, `reconcile`) are preserved naturally because they're carried forward from the existing raw input.

## Guardrail Impact

All 6 existing GUARDRAIL tests call `runCalibrateCommand({ dir, dbPath })` with no third argument. Adding `apply?: boolean` (default `false`) to the function signature and the `ParsedArgs` type keeps every existing test passing with zero changes. The `--apply` write path activates ONLY when `apply: true` is explicitly passed. The suggest-only invariant (no write when `--apply` absent) is structurally enforced by the default value, not by a runtime check that could be bypassed.

Assertions that must stay green on the DEFAULT (no-flag) path: INV-1 (no `rai.config.json` created), INV-2 (existing config bytes/mtime unchanged), feedback_event row count unchanged, finding row count unchanged. The write assertions are CONDITIONAL on `--apply`.

## Write-Safety Precedent

`atomicWrite` (`packages/cli/src/install/writers.ts:121-127`) — write to `<path>.tmp-<pid>-<uuid>`, then `rename()`. Uses `node:fs/promises` (`writeFile` + `rename`). This is the established safe-write pattern; reuse it (import from writers.ts or inline the same pattern). The codemod apply-pipeline (git patch + commit + typecheck) is too heavy for a config JSON write.

Writing `rai.config.json` is architecturally allowed: the three guardrails ("code is source of truth", "memory changes only through explicit feedback tools", "findings are immutable") all refer to the analysis/feedback/finding layer, not the config input layer.

## Open Questions

1. **(a) Write shape** — merged-full-config (recommended) vs patch-delta only (destroys user keys, not recommended).
2. **(b) `--apply` + `--json`** — should print the written result as JSON (`configFile` non-null).
3. **(c) Confirmation gate** — `--apply` unconditional vs `--apply --yes` to actually write (a `yes` field already exists in `ParsedArgs`).
4. **(d) Malformed existing config** — refuse to apply (re-read + throw `ProjectConfigError`); follows existing behavior.
5. **(e) Zero suggestions** — no-op, inform user; don't write.
6. **(f) Backup** — no precedent in repo; no-backup is simplest; `.rai.config.json.bak` optional.
7. **(g) `--apply` + `--db`** — fully independent, no interaction.
8. **(h) Idempotence** — write-merged-full makes this testable: re-read after apply → re-merge → compare bytes → skip if identical.

## Approach Options

| # | Description | Recommendation |
|---|-------------|----------------|
| A1 | Write merged-full-config (existing keys + patches) | YES — preserves user keys, idempotent, validated before write |
| A2 | Write patch-delta only | NO — destroys prior user config |
| B1 | `--apply` unconditional write | Likely yes — the flag IS the opt-in |
| B2 | `--apply --yes` to write, `--apply` alone for preview | Valid alternative — proposal decides |

## Risks

- The `apply` parameter MUST default to `false` in `runCalibrateCommand` — any change making it truthy by default silently breaks INV-1/INV-2. Hard requirement for the proposal.
- `formatCalibrateReport` banner says "suggest-only (read-only over feedback history)" — with `--apply` active this text must be updated or suppressed, otherwise it contradicts the write action.
- Idempotence is non-trivial if the written JSON serialization differs from what `loadProjectConfig` produces (key ordering). Proposal should spec a byte-level comparison after `JSON.stringify` with stable formatting.

## Test Runner

`pnpm test` (vitest), strict TDD active (RED-before-GREEN). Test file to touch: `packages/cli/src/cli.calibrate.test.ts` with existing `seedFeedback` / `seedFinding` raw-SQL helpers.
