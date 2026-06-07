# Delta for calibration

Change: `p13-s3-calibrate-apply` · Persistence: hybrid
Merges into the existing `calibration` capability (`openspec/specs/calibration/spec.md`).

---

## ADDED Requirements

### Requirement: Guarded Config-Write via `--apply`

The system MUST provide a guarded, opt-in write path through `rai calibrate --apply [--yes]`.
`--apply` alone MUST be a dry-run: it computes the merged config and PRINTS a preview of what it
WOULD write, exits 0, and writes NOTHING to disk. `--apply --yes` MUST atomically write the merged
full `rai.config.json` and exit 0. The `apply` flag MUST default to `false`; absence of `--apply`
preserves strict suggest-only behavior. This is the ONLY intentional write in the calibrate flow.

#### Scenario: `--apply` without `--yes` previews only, writes nothing

- GIVEN a project with feedback that triggers one or more suggestions
- WHEN `rai calibrate --apply` runs (no `--yes`)
- THEN it computes the merged config and prints a preview of what it would write
- AND no `rai.config.json` is created or modified on disk
- AND it exits with code 0.

#### Scenario: `--apply --yes` atomically writes the merged config

- GIVEN a project with feedback that triggers one or more suggestions
- WHEN `rai calibrate --apply --yes` runs
- THEN the merged full `rai.config.json` is written to the project root
- AND it exits with code 0.

### Requirement: Suggestion Merge Preserves Unrelated User Config

The merge MUST read the existing `rai.config.json` raw input (`{}` if absent) and shallow-merge each
suggestion's single-group patch onto it. Because no two calibratable rules share the same
`(group, knob)` pair, the group-level spread is collision-free. Unrelated user keys (`excludeGlobs`,
`boundaries`, `conventions`, `reconcile`) MUST be preserved. The merged object MUST validate against
`ConfigSchema.partial()` before any write; on validation failure the command MUST NOT write.

#### Scenario: Unrelated user keys survive the merge

- GIVEN an existing `rai.config.json` with `excludeGlobs`, `boundaries`, `conventions`, and `reconcile` keys
- AND a suggestion that patches one threshold group (e.g. `renderCoupling`)
- WHEN `rai calibrate --apply --yes` runs
- THEN the written config still contains the original `excludeGlobs`, `boundaries`, `conventions`, and `reconcile` values
- AND the patched threshold group reflects the suggested value.

#### Scenario: Merged config validates before write

- GIVEN suggestions are computed and merged onto the existing raw input
- WHEN the merged object is validated with `ConfigSchema.partial()`
- THEN validation succeeds before any write occurs
- AND the patch contains only keys that exist in the config schema.

### Requirement: Apply Refuses on Malformed Existing Config

When the existing `rai.config.json` is malformed (fails `loadProjectConfig` with `ProjectConfigError`),
`rai calibrate --apply [--yes]` MUST refuse to proceed, MUST exit with code 2, and MUST write nothing.

#### Scenario: Malformed config aborts apply with exit 2

- GIVEN an existing `rai.config.json` that is malformed (raises `ProjectConfigError`)
- WHEN `rai calibrate --apply --yes` runs
- THEN the command exits with code 2
- AND the on-disk `rai.config.json` content is byte-identical before and after the run.

### Requirement: Apply Is a No-Op When There Are No Suggestions

When the suggestion engine emits zero suggestions, `rai calibrate --apply [--yes]` MUST write
nothing, MUST inform the user that there is nothing to apply, and MUST exit with code 0.

#### Scenario: Zero suggestions writes nothing

- GIVEN feedback state that produces zero suggestions
- WHEN `rai calibrate --apply --yes` runs
- THEN no `rai.config.json` is created or modified
- AND the user is informed there is nothing to apply
- AND it exits with code 0.

### Requirement: Idempotent Apply Skips Redundant Write

`rai calibrate --apply --yes` MUST be idempotent. The comparison is by **canonical-serialized
equality**: both the merged config and the current on-disk content are normalized through
`JSON.stringify(_, null, 2)` and compared. If they are equal, the command MUST report
"already calibrated", MUST skip the write, and MUST exit with code 0. (Canonical-equality is
chosen over raw byte-compare so a benign hand-edit — different key ordering or whitespace that
parses to the same config — still triggers the skip rather than a redundant rewrite.)

#### Scenario: Already-calibrated repo skips the write

- GIVEN a repo whose on-disk `rai.config.json` canonicalizes (via `JSON.stringify(_, null, 2)`) to the same content as the merged config
- WHEN `rai calibrate --apply --yes` runs again
- THEN it reports "already calibrated"
- AND it does not rewrite `rai.config.json`
- AND it exits with code 0.

### Requirement: Apply Write Is Atomic and Durable

The config write MUST be atomic via a temp-file-plus-rename pattern (`atomicWrite`). A crash partway
through the write MUST leave the original `rai.config.json` intact — a partially written or truncated
config MUST NOT be observable at the canonical path.

#### Scenario: Crash mid-write leaves the original file intact

- GIVEN an existing valid `rai.config.json`
- WHEN the write is interrupted before the rename completes
- THEN the canonical `rai.config.json` still holds the original, complete content
- AND no partial or truncated config is left at the canonical path.

### Requirement: JSON Output Reflects the Merged Config Under `--apply`

When `--json` is combined with `--apply [--yes]`, the machine-readable output MUST reflect the merged
config that was written (or, in dry-run, would be written), so callers can inspect the result
programmatically.

#### Scenario: `--json --apply` reports the would-be merged config

- GIVEN feedback that triggers suggestions
- WHEN `rai calibrate --json --apply` runs (dry-run, no `--yes`)
- THEN stdout is valid JSON reflecting the merged config that would be written
- AND no `rai.config.json` is created or modified.

#### Scenario: `--json --apply --yes` reports the written merged config

- GIVEN feedback that triggers suggestions
- WHEN `rai calibrate --json --apply --yes` runs
- THEN stdout is valid JSON reflecting the merged config that was written
- AND the on-disk `rai.config.json` matches that merged config.

---

## MODIFIED Requirements

### Requirement: Suggest-Only Calibration Command (Primary Guardrail)

The system MUST provide `rai calibrate [dir] [--json] [--apply] [--yes]`. The command MUST write
configuration ONLY when invoked with `--apply --yes`; in every other invocation (including `--apply`
without `--yes`) it MUST NOT create, modify, or delete any configuration file (including
`rai.config.json`). The command MUST NEVER write to `feedback_event` (T4), MUST NEVER write to
`weight` (T5), and MUST NEVER perform any other database write or memory mutation, regardless of
`--apply`/`--yes`. The default no-flag path remains strictly suggest-only: it reads T4 feedback and
the resolved config, computes suggestions, and prints them for human review. Project guardrail:
"threshold SUGGESTIONS from feedback; config changes ONLY through the deliberate `--apply --yes` opt-in,
never automatically."
(Previously: the command was strictly suggest-only and MUST NOT write `rai.config.json` under any
invocation; S3 introduces the guarded `--apply --yes` write path while preserving the no-flag
zero-write guarantee.)

#### Scenario: Calibrate never writes config

- GIVEN a project directory with feedback events recorded in T4
- AND no `rai.config.json` file present at the project root
- WHEN `rai calibrate` runs and emits one or more suggestions
- THEN no `rai.config.json` file is created or modified at the project root
- AND no other configuration file on disk is created or modified.

#### Scenario: Calibrate never mutates memory or findings

- GIVEN a project directory with existing T4 feedback events and T5 weights
- WHEN `rai calibrate` runs to completion
- THEN no row is inserted, updated, or deleted in `feedback_event` (T4)
- AND no row is inserted, updated, or deleted in `weight` (T5)
- AND no finding (T3) row is mutated
- AND the calibration data source is read-only.

#### Scenario: Existing config left untouched when present

- GIVEN a project directory with an existing valid `rai.config.json`
- WHEN `rai calibrate` runs and proposes raising a threshold
- THEN the on-disk `rai.config.json` content is byte-identical before and after the run
- AND the suggested patch is only printed, never applied.

#### Scenario: Default no-flag path remains zero-write under apply support

- GIVEN a project where `--apply` write support exists in the command
- WHEN `rai calibrate` runs WITHOUT `--apply`
- THEN no `rai.config.json` is created or modified
- AND no `feedback_event` (T4), `weight` (T5), or `finding` (T3) row is mutated.

#### Scenario: Memory and findings stay read-only even under `--apply --yes`

- GIVEN a project with T4 feedback that triggers suggestions
- WHEN `rai calibrate --apply --yes` runs and writes `rai.config.json`
- THEN no row is inserted, updated, or deleted in `feedback_event` (T4), `weight` (T5), or `finding` (T3)
- AND the only write performed is the config file write.

---

## Traceability

| Proposal acceptance signal | Requirement(s) |
|----------------------------|----------------|
| `--apply` alone previews merged config, writes nothing, exit 0 | Guarded Config-Write via `--apply` |
| `--apply --yes` atomically writes merged full config, exit 0 | Guarded Config-Write via `--apply`; Apply Write Is Atomic and Durable |
| Shallow-merge each group patch; preserve `excludeGlobs`/`boundaries`/`conventions`/`reconcile`; validate via `ConfigSchema.partial()` | Suggestion Merge Preserves Unrelated User Config |
| Malformed existing config → exit 2 (`ProjectConfigError`), no write | Apply Refuses on Malformed Existing Config |
| Zero suggestions → no write, inform user, exit 0 | Apply Is a No-Op When There Are No Suggestions |
| Idempotent: canonical(merged) == canonical(on-disk) → "already calibrated", skip write | Idempotent Apply Skips Redundant Write |
| Crash mid-write leaves original intact (temp-file + rename) | Apply Write Is Atomic and Durable |
| `--json` with `--apply [--yes]` reflects merged config | JSON Output Reflects the Merged Config Under `--apply` |
| Default no-flag path UNCHANGED — suggest-only, zero-write | Suggest-Only Calibration Command (Primary Guardrail) |
| Guardrail invariant shifts: write ONLY with `--apply --yes` | Suggest-Only Calibration Command (Primary Guardrail) |
| Memory/findings never mutated regardless of `--apply`/`--yes` | Suggest-Only Calibration Command (Primary Guardrail) |
