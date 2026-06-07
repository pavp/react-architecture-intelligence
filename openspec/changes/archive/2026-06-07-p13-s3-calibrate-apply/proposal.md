# Proposal: P13-S3 — `rai calibrate --apply`

## Intent

P13-S1 surfaces calibration suggestions. P13-S2 grounds them in evidence. Both are strictly read-only. Users who trust the suggestions must hand-edit `rai.config.json` manually — a friction point that discourages acting on calibration output.

S3 closes the loop: `--apply` lets the user commit accepted suggestions directly to `rai.config.json` through a deliberate, guarded, opt-in write path. It is the first (and only) intentional write in the calibrate flow. The SUGGEST-ONLY invariant is preserved for the default (no-flag) path.

## Scope

### In Scope

- `ParsedArgs`: add `apply: boolean` (already has `yes: boolean`); both default `false`
- `parseArgs`: parse `--apply` flag for the `calibrate` subcommand
- `runCalibrateCommand`: preview branch (`--apply` alone) + write branch (`--apply --yes`)
- Pure merge helper `mergeSuggestionsIntoConfig` — pure function, no fs; location: `packages/core/src/calibration/merge.ts` (framework-free, testable) or a cli-level helper
- Atomic write via `atomicWrite` from `packages/cli/src/install/writers.ts`
- Banner/output conditioning: suppress or update the "suggest-only (read-only)" text when `--apply` is active
- `--json` output update: when `--apply [--yes]`, report the would-be/written merged config
- Tests in `packages/cli/src/cli.calibrate.test.ts`: preview, write, zero-suggestions no-op, idempotence, malformed-config refusal, existing-guardrail tests stay green unchanged

### Out of Scope

- No schema changes to `ConfigSchema` or `RaiConfigInput`
- No changes to `computeSuggestionsWithEvidence` or any analyzer
- No memory/finding writes; no feedback rows touched
- No interactive TTY prompt (no `readline` / `enquirer`)
- No backup file (`.rai.config.json.bak` or similar)
- No change to P13-S1 or P13-S2 behavior

## Capabilities

### New Capabilities

- `calibrate-apply`: guarded config-write path for `rai calibrate --apply [--yes]`

### Modified Capabilities

- `calibrate-suggest`: guardrail semantics tightened — invariant shifts from "never writes" to "no write without `--apply --yes`"; banner text conditioned on `apply` flag

## Approach

**Preview + commit gate (locked decision B2):**
- `--apply` alone: compute merged config, print what WOULD be written, exit 0 (dry-run)
- `--apply --yes`: compute merged config, validate, compare bytes, atomic write (or skip if already calibrated)

**Merge shape (locked decision A1):**
1. Read existing `rai.config.json` raw bytes as `RaiConfigInput` (`{}` if absent)
2. Detect malformed config: re-read via `loadProjectConfig` — if it throws `ProjectConfigError`, exit 2, write nothing
3. Detect zero suggestions: inform user, exit 0, write nothing
4. Shallow-spread each suggestion's group patch onto the raw input (collision-free: no two calibratable rules share the same `(group, knob)` pair)
5. Validate merged object with `ConfigSchema.partial().safeParse()` — reject on failure
6. `JSON.stringify(merged, null, 2)` → compare bytes to current on-disk content → if equal, report "already calibrated", skip write
7. `atomicWrite(configFilePath, mergedJson)` — temp-file + rename

**Guardrail preservation:**
- `apply` defaults to `false` in both `ParsedArgs` and `runCalibrateCommand` signature
- All 6 existing GUARDRAIL tests pass unchanged (no third argument → `apply: false`)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/cli/src/cli.ts` | Modified | `ParsedArgs.apply`, `parseArgs` calibrate branch, `runCalibrateCommand` preview/write logic, banner conditioning |
| `packages/core/src/calibration/merge.ts` | New | Pure `mergeSuggestionsIntoConfig` helper |
| `packages/cli/src/install/writers.ts` | Read-only | `atomicWrite` imported, not changed |
| `packages/cli/src/cli.calibrate.test.ts` | Modified | New apply-path tests; existing guardrail tests unchanged |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `apply` defaults truthy → INV-1/INV-2 break | Low | Explicit `false` default; existing tests catch regression immediately |
| Banner contradicts write action | Low | Condition banner text on `apply` flag before formatting |
| Idempotence serialization drift (key ordering) | Med | Byte-compare after stable `JSON.stringify(obj, null, 2)`; lock key ordering in merge helper |
| Malformed config silently overwritten | Low | Re-read via `loadProjectConfig` before merge; throw/exit 2 on `ProjectConfigError` |
| `ConfigSchema.partial().safeParse()` false-positive | Low | Validate on the merged object, not the patch alone; fail-fast with user-visible message |

## Rollback Plan

`--apply` and `yes` default to `false`. If the apply path has a defect, removing the `--apply` flag from the CLI invocation immediately reverts to suggest-only behavior — no config writes occur. The `atomicWrite` temp-rename means a crash mid-write leaves the original file intact.

## Dependencies

- P13-S1 (suggest engine) — complete
- P13-S2 (evidence grounding) — complete
- `atomicWrite` in `packages/cli/src/install/writers.ts` — exists, no changes needed

## Success Criteria

- [ ] `rai calibrate --apply` prints merged config preview, writes nothing
- [ ] `rai calibrate --apply --yes` atomically writes merged `rai.config.json`
- [ ] Re-running `--apply --yes` on an already-calibrated repo reports "already calibrated", skips write
- [ ] Zero suggestions → no write, user informed
- [ ] Malformed `rai.config.json` → exit 2, no write
- [ ] All 6 existing GUARDRAIL tests pass unchanged
- [ ] `--json --apply [--yes]` output reflects the merged config
- [ ] Single PR, ~150-250 changed lines
