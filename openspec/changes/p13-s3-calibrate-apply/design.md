# Design: P13-S3 — `rai calibrate --apply`

## Technical Approach

Add a guarded, opt-in config-write path to `runCalibrateCommand` that activates ONLY when
`apply: true` is explicitly passed. Suggestions are computed by the EXISTING pipeline
(`aggregateFeedback` → `lookupRejectedEvidence` → `computeSuggestionsWithEvidence`); the apply
branch sits strictly AFTER that. A new pure core helper `mergeSuggestionsIntoConfig` folds each
suggestion's single-group patch onto the existing RAW config input (the `loadProjectConfig` return,
NOT the defaulted `resolveConfig` output). The CLI validates the merged object with
`ConfigSchema.partial()`, serializes deterministically, compares to disk for idempotence, and writes
atomically via `atomicWrite`. The default no-flag path is byte-identical to today — `apply` defaults
to `false`, structurally preserving INV-1/INV-2 (MODIFIED requirement, Guardrail).

## Architecture Decisions

### D1 — Merge helper lives in core, pure, fs-free

**Choice**: New `packages/core/src/calibration/merge.ts`, exported via `packages/core/src/index.ts`:
`mergeSuggestionsIntoConfig(existing: RaiConfigInput, suggestions: CalibrationSuggestion[]): RaiConfigInput`.
It imports only config/suggest TYPES. It does NOT validate, serialize, read, or write. The CLI caller
owns `ConfigSchema.partial()` validation, `JSON.stringify`, idempotence compare, and `atomicWrite`.
**Alternatives**: (a) cli-level helper — rejected, merge logic is pure domain logic and core already
owns `computeSuggestions*`/`CALIBRATABLE_RULES`; (b) helper also validates+serializes — rejected,
would drag schema-error formatting and string shaping into core and make the unit trivially harder to
test. **Rationale**: keeps `packages/core` framework-free (guardrail), trivially testable as a pure
function, and gives clean separation: core MERGES, CLI POLICES (validate/serialize/write).
Covers spec *Suggestion Merge Preserves Unrelated User Config*.

### D2 — Deterministic key ordering + PARSED-equality idempotence

**Choice**: `mergeSuggestionsIntoConfig` builds the result by spreading existing keys first (insertion
order preserved), then applying each suggestion's group patch as a full shallow group-spread in
`CALIBRATABLE_RULES` order — `{ ...existing, [group]: { ...existing[group], ...patch[group] } }`.
Because no two calibratable rules share a `(group, knob)` pair the spread is collision-free.
For idempotence the CLI compares **deep-equal of PARSED objects**, not raw bytes:
`deepEqual(JSON.parse(onDiskRaw), merged)` (or equivalently compare `JSON.stringify(merged,null,2)`
against `JSON.stringify(JSON.parse(onDiskRaw),null,2)` — canonicalize BOTH sides through the same
serializer). **Alternatives**: byte-compare `JSON.stringify(merged,null,2)` directly against the raw
on-disk string — rejected: a hand-edited file with different whitespace/key-order would never
byte-equal our canonical output, so the "already calibrated" skip would almost never fire and a
no-op run would rewrite the file, breaking the idempotence scenario and INV-2 spirit.
**Rationale**: parsed-equality makes idempotence robust against benign formatting differences while
the second apply (after our own canonical write) still matches. **Spec tweak needed**: the
*Idempotent Apply Skips Redundant Write* requirement says "merged bytes equal current on-disk bytes".
Reconcile to: "after canonicalizing BOTH the merged object and the on-disk content through
`JSON.stringify(_, null, 2)`, equal canonical bytes → skip". This still satisfies the literal scenario
(disk already equals our canonical output → byte-equal → skip) and additionally survives hand-edits.

### D3 — Apply branch placement and exit codes

**Choice**: Inside the existing `try { … } finally { db.close() }`, AFTER `suggestions` is computed:
`if (!apply) return existing suggest-only result`. Else run the apply sub-flow (D6 ordering) and
return its result. `db.close()` stays in `finally` and runs on every path. Exit codes: `0` for
preview / write / idempotent-skip / zero-suggestion no-op; `2` ONLY for malformed config
(via `ProjectConfigError`). **Alternatives**: a separate `runApplyCommand` — rejected, duplicates the
aggregate→suggest pipeline and the db lifecycle. **Rationale**: single source of truth for suggestion
computation; the write is a terminal decision on already-computed data. Covers *Guarded Config-Write*,
*Zero-Suggestion No-Op*, *Apply Refuses on Malformed*.

### D4 — Preview vs write output (human + `--json`)

**Choice**: Reuse the merged object as the payload. Human mode:
- `--apply` (no `--yes`): print `"DRY-RUN — would write rai.config.json:"` then
  `JSON.stringify(merged, null, 2)`, then a hint `"Re-run with --apply --yes to write."`
- `--apply --yes` (wrote): print `"Wrote rai.config.json"` + the path.
- idempotent skip: `"already calibrated — rai.config.json unchanged"`.
- zero suggestions: `"Nothing to apply — no calibration suggestions."`

`--json`: extend `CalibrateResult` with optional `merged?: RaiConfigInput` and
`applied?: "preview" | "written" | "noop" | "idempotent"`. Under `--json --apply[ --yes]` the
existing `JSON.stringify(result, null, 2)` already emits these new fields (no `runInner` branch
change). **Rationale**: one payload for both modes; `--json` callers inspect `merged`/`applied`
programmatically. Covers *JSON Output Reflects Merged Config*.

### D5 — Banner conditioning (minimal)

**Choice**: `formatCalibrateReport` takes the result; gate its first line on `result.applied`. When
`applied` is set, the header becomes `"RAI calibrate — apply mode"` and the suggest-only NOTE / banner
is suppressed; otherwise the existing `"suggest-only (read-only over feedback history)"` text is
unchanged. The apply-mode output lines (D4) are appended by a small branch keyed on `result.applied`.
**Alternatives**: a second formatter — rejected, duplicates the stats table. **Rationale**: a single
conditional keeps the diff tiny and avoids contradicting the write action (explore risk).
Covers MODIFIED *Suggest-Only Calibration Command* banner change.

### D6 — Malformed detection ordering, no double-load

**Choice**: The apply sub-flow reuses the RAW input from a SINGLE `loadProjectConfig(absDir)` call.
Today `runCalibrateCommand` already calls `resolveConfig(loadProjectConfig(absDir))` to build
`currentConfig`; refactor to `const rawInput = loadProjectConfig(absDir); const currentConfig =
resolveConfig(rawInput);` so the raw input is captured once and reused as the merge base. Because
`loadProjectConfig` THROWS `ProjectConfigError` on malformed JSON/shape, a malformed file aborts at
that single call — propagated to `run()` which maps it to exit 2 — BEFORE any merge or write, with no
double read. **Alternatives**: a second re-read before merge — rejected, redundant; the existing load
already fails fast on malformed input. **Rationale**: one read, fail-fast, no compute-then-discard
waste, no race window. Covers *Apply Refuses on Malformed* (exit 2, file byte-identical).
NOTE: the merge base is the RAW `RaiConfigInput` (preserves only user-set keys), NOT the
fully-defaulted `RaiConfig` — writing the resolved config would explode the file with every default.

## Data Flow

    parseArgs(--apply,--yes) ─→ runCalibrateCommand({dir,dbPath,apply,yes})
                                        │
        loadProjectConfig (RAW, fail-fast exit2) ─→ resolveConfig ─→ aggregate+evidence+suggest
                                        │
                          apply? ──no──→ suggest-only result (unchanged)
                            │yes
        suggestions.length==0 ──→ noop result (exit 0)
                            │
        mergeSuggestionsIntoConfig(rawInput, suggestions)  [core, pure]
                            │
        ConfigSchema.partial().safeParse(merged) ──fail──→ throw → caller maps to non-0
                            │
        canonical(merged) == canonical(onDisk)? ──yes──→ idempotent skip (exit 0)
                            │no
                  yes flag? ──no──→ preview result (exit 0, no write)
                     │yes
              atomicWrite(configPath, canonical(merged)+"\n") ─→ written result (exit 0)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/calibration/merge.ts` | Create | Pure `mergeSuggestionsIntoConfig(existing, suggestions)` |
| `packages/core/src/index.ts` | Modify | Export `mergeSuggestionsIntoConfig` |
| `packages/cli/src/cli.ts` | Modify | `ParsedArgs.apply`; `parseArgs` calibrate `--apply`; `runCalibrateCommand` apply sub-flow; `CalibrateResult.merged`/`.applied`; banner conditioning in `formatCalibrateReport`; pass `apply`/`yes` in `runInner` calibrate case |
| `packages/cli/src/install/writers.ts` | Read-only | `atomicWrite` reused; export it (currently file-private) or inline the temp+rename pattern in cli.ts |
| `packages/cli/src/cli.calibrate.test.ts` | Modify | New apply-path tests; 6 GUARDRAIL tests unchanged |

## Interfaces / Contracts

```ts
// packages/core/src/calibration/merge.ts
export function mergeSuggestionsIntoConfig(
  existing: RaiConfigInput,
  suggestions: CalibrationSuggestion[],
): RaiConfigInput; // pure: shallow group-spread in CALIBRATABLE_RULES order; no fs/validation

// packages/cli/src/cli.ts — extended result
export interface CalibrateResult {
  rules: RuleFeedbackStats[];
  suggestions: CalibrationSuggestion[];
  currentConfig: ReturnType<typeof resolveConfig>;
  configFile: string | null;
  merged?: RaiConfigInput;                                 // present under --apply
  applied?: "preview" | "written" | "noop" | "idempotent"; // apply outcome
}
// runCalibrateCommand input gains: apply?: boolean; yes?: boolean  (both default false)
```

`atomicWrite` is currently a file-private function in `writers.ts`. Decision: add `export` to it
(one-word change, no behavior change) and import it in `cli.ts`. This avoids duplicating the
temp+rename pattern and keeps a single safe-write implementation.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (core) | `mergeSuggestionsIntoConfig` preserves unrelated keys; collision-free group-spread; deterministic ordering; `{}` base | Pure-function vitest, no fs |
| Unit (cli) | preview (no write, exit 0); write (file written, exit 0); idempotent skip; zero-suggestion noop; malformed → exit 2 + bytes unchanged; merged validates; `--json --apply[ --yes]` shape | `run([...])` + tmp dir + `seedFeedback`/`seedFinding`; assert `existsSync`/bytes/exit code |
| Guardrail (regression) | 6 existing GUARDRAIL tests (INV-1/INV-2, row counts) | Unchanged — no `apply` arg → `false` default |

Strict TDD: RED test per spec scenario first, then GREEN. ~150–250 LOC single PR.

## Migration / Rollout

No migration. Rollback: drop `--apply` from the invocation → suggest-only behavior; `atomicWrite`
temp-rename means a crash mid-write leaves the original `rai.config.json` intact
(*Apply Write Is Atomic and Durable*). Memory/findings remain read-only on every path
(only the config file is written) — *Memory and findings stay read-only even under `--apply --yes`*.

## Failure Modes

| Failure | Handling | Exit |
|---------|----------|------|
| Malformed `rai.config.json` | `loadProjectConfig` throws `ProjectConfigError` at the single load, before merge/write | 2 |
| Merged object fails `ConfigSchema.partial()` | Throw with the schema issues; no write | non-0 (mapped by caller) |
| Write permission denied | `atomicWrite` throws (writeFile/rename); propagate, original intact | non-0 |
| Partial write / crash before rename | temp file orphaned at `<path>.tmp-*`; canonical path untouched | n/a |
| `--yes` without `--apply` | `yes` ignored — only meaningful with `apply`; suggest-only path runs | 0 |
| Zero suggestions under `--apply[ --yes]` | `applied: "noop"`, inform user, no write | 0 |

## Open Questions

- [ ] Confirm exporting `atomicWrite` from `writers.ts` is acceptable vs inlining (design recommends export).
- [ ] Spec text in *Idempotent Apply Skips Redundant Write* should be reworded from "merged bytes equal on-disk bytes" to "canonical-serialized equality" (D2). Flag to sdd-spec/sdd-archive.
