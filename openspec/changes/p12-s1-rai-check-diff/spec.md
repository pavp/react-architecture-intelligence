# Delta for ci-check-diff

This change introduces a NEW capability `ci-check-diff`. All requirements below are ADDED. The archive phase will promote this into the canonical `openspec/specs/ci-check-diff/spec.md`.

## ADDED Requirements

### Requirement: Changed-File Scoped Reporting

`rai check [dir] --base <ref> [--json]` MUST run a full repository analysis and then report ONLY findings whose file references intersect the set of source files changed between `<ref>` and `HEAD`. Findings referencing only unchanged files MUST be excluded from output.

#### Scenario: Finding in changed file is reported, unchanged-file finding excluded

- GIVEN a repo with a finding referencing changed file `A` and a finding referencing unchanged file `B`
- WHEN `rai check --base <ref>` runs
- THEN the reported findings MUST include the finding referencing `A`
- AND MUST NOT include the finding referencing `B`.

#### Scenario: No changed files yields empty report

- GIVEN `<ref>` and `HEAD` differ in no source files
- WHEN `rai check --base <ref>` runs
- THEN the reported findings MUST be empty.

### Requirement: Full-Analysis Correctness Preserved

The command MUST execute the existing full `analyzeRepo` flow over ALL repository files so cross-file analyzers stay correct; only the presented output is filtered. A cross-file finding MUST be reported when ANY of its file references is a changed file, even if other evidence references unchanged files.

#### Scenario: Cross-file finding reported when one evidence ref is changed

- GIVEN a cross-file finding whose evidence references changed file `A` and unchanged file `B`
- WHEN `rai check --base <ref>` runs
- THEN the finding MUST be reported because evidence references changed file `A`.

#### Scenario: Analysis runs over the full file set

- GIVEN a repo where a finding for changed file `A` depends on graph context from unchanged file `B`
- WHEN `rai check --base <ref>` runs
- THEN analysis MUST process the full repository file set (not only changed files)
- AND the dependent finding for `A` MUST still be produced.

### Requirement: CI Exit Code Gate

The command MUST set the process exit code: `0` when no `warn`/`error` finding references a changed file; `1` when at least one `warn`/`error` finding references a changed file. `info`-severity findings MUST NOT cause exit `1`.

#### Scenario: Clean or info-only changed files exit 0

- GIVEN changed files have no findings, or only `info`-severity findings
- WHEN `rai check --base <ref>` runs
- THEN the exit code MUST be `0`.

#### Scenario: Warn or error finding in changed file exits 1

- GIVEN at least one `warn` or `error` finding references a changed file
- WHEN `rai check --base <ref>` runs
- THEN the exit code MUST be `1`.

### Requirement: Git and Usage Error Handling

A missing or invalid `--base`, an unavailable `git`, or a git command failure MUST produce exit code `2` with a clear, actionable error message — never an unhandled exception, stack trace, exit `0`, or exit `1`. `--base` MUST be required with no default.

#### Scenario: Missing --base exits 2 with clear message

- GIVEN `rai check` is invoked without `--base`
- WHEN the command runs
- THEN the exit code MUST be `2`
- AND a clear usage error MUST be emitted (not a stack trace).

#### Scenario: Git failure or unknown base ref exits 2 with clear message

- GIVEN `git` is unavailable or `<ref>` cannot be resolved against `HEAD`
- WHEN `rai check --base <ref>` runs
- THEN the exit code MUST be `2`
- AND a clear, actionable error MUST be emitted (not a crash or stack trace).

### Requirement: Output Format and JSON Shape

The default output MUST be human-readable: a summary count plus per-finding `ruleId`, `severity`, and file path. With `--json`, the command MUST emit a machine-readable object `{ changedFiles: string[], findings: PresentedFinding[] }` where `findings` are the filtered presented findings. Output ordering MUST be deterministic. The exit code rule MUST still apply under `--json`.

#### Scenario: Human output lists scoped findings

- GIVEN changed files contain reportable findings
- WHEN `rai check --base <ref>` runs without `--json`
- THEN output MUST include a summary count and, per finding, its `ruleId`, `severity`, and file path.

#### Scenario: JSON output shape and ordering

- GIVEN `rai check --base <ref> --json` runs
- THEN stdout MUST be an object with `changedFiles: string[]` and `findings: PresentedFinding[]`
- AND `findings` MUST contain only the filtered findings in deterministic order
- AND the exit code MUST follow the CI Exit Code Gate rule.

### Requirement: Source-Extension Changed-File Filtering

The changed-file set MUST include only source files with extensions `.ts`, `.tsx`, `.js`, or `.jsx`, expressed as repo-relative paths. Non-source changed files MUST be excluded from the set.

#### Scenario: Source file is included

- GIVEN `<ref>..HEAD` changes a `.tsx` file
- WHEN the changed-file set is computed
- THEN that `.tsx` file MUST be in the set as a repo-relative path.

#### Scenario: Non-source file is excluded

- GIVEN `<ref>..HEAD` changes only `.md` and `.json` files
- WHEN the changed-file set is computed
- THEN those files MUST NOT be in the set
- AND the set MUST be empty.

### Requirement: Read-Only Findings Behavior

`rai check` MUST be read-only with respect to stored findings: it MUST NOT create, mutate, or persist findings beyond what the existing `rai analyze` flow already does. Filtering is a presentation concern only.

#### Scenario: No finding mutation or extra persistence

- GIVEN `rai check --base <ref>` runs
- WHEN analysis completes and findings are filtered for output
- THEN no finding MUST be created, mutated, or persisted beyond the existing `analyze` flow's side-effects.

### Requirement: Deterministic Results

Given the same repository state and the same `<ref>`, repeated runs MUST produce an identical changed-file list, identical reported findings, and an identical exit code.

#### Scenario: Repeated runs are identical

- GIVEN unchanged repository state and a fixed `<ref>`
- WHEN `rai check --base <ref>` runs twice
- THEN both runs MUST yield the same `changedFiles`, the same `findings`, and the same exit code.

## Out of Scope (explicitly NOT specified here)

- Net-new finding comparison via `Session.getDrift` (S2)
- GitHub PR comments (S3)
- SARIF output
- `--min-severity` / severity threshold configuration
- `GITHUB_BASE_REF` auto-detect (S2)
- Snapshot store dependency
