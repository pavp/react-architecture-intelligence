# Delta for Distribution Install

## ADDED Requirements

### Requirement: Install Platform Selection

The system MUST provide `rai install` for supported platforms `opencode`, `claude-code`, `codex`, and `copilot`. By default it MUST auto-detect installed/supported platform config targets. `--platform` MUST accept comma-separated values and repeated options.

#### Scenario: Auto-detect supported platforms

- GIVEN one or more supported platform config targets are detectable
- WHEN `rai install` runs without `--platform`
- THEN the install plan includes each detected supported platform
- AND unsupported platforms are ignored

#### Scenario: Explicit platform override

- GIVEN no supported platform is auto-detected
- WHEN `rai install --platform opencode,codex --platform copilot` runs
- THEN the install plan targets `opencode`, `codex`, and `copilot`

#### Scenario: Selection failure

- GIVEN no platform is detected or an unknown platform is requested
- WHEN `rai install` builds a plan
- THEN it fails before any filesystem writes
- AND reports the supported platform ids

### Requirement: Install Execution Modes

The installer MUST support `--dry-run`, `--yes`, and `--no-instructions`. Writes MUST require explicit consent unless `--dry-run` is used.

#### Scenario: Dry run is read-only

- GIVEN a valid install plan
- WHEN `rai install --dry-run` runs
- THEN planned file operations are reported
- AND no files are created or changed

#### Scenario: Confirmed write

- GIVEN a valid install plan
- WHEN `rai install --yes` runs
- THEN planned MCP config writes are applied safely

#### Scenario: Instructions skipped

- GIVEN a valid install plan
- WHEN `rai install --yes --no-instructions` runs
- THEN MCP config writes are applied
- AND no agent instruction file is created or changed

### Requirement: Safe Platform Writes

The installer MUST NOT destructively overwrite user files. JSON MCP configs MUST be merged while preserving unknown keys. Instruction files MUST update only RAI marker-owned blocks.

#### Scenario: JSON merge preserves user config

- GIVEN an existing valid MCP JSON config with unrelated entries
- WHEN install writes the RAI server entry
- THEN unrelated entries and formatting-valid JSON content remain valid

#### Scenario: Marker-owned instruction update

- GIVEN an instruction file with user content and an existing RAI marker block
- WHEN install writes instructions
- THEN only the RAI marker block is replaced
- AND user content outside markers is unchanged

#### Scenario: Unsafe write failure

- GIVEN broken JSON or write permission denial
- WHEN install applies writes
- THEN it fails with an actionable error
- AND does not perform unrelated or partial destructive overwrites

### Requirement: Generated MCP Command Contract

Generated MCP config MUST point to the RAI CLI command that starts the MCP server and MUST pass the project root as the analysis target. It MUST NOT point at `src` as the project root.

#### Scenario: Project root target

- GIVEN install runs from a project root
- WHEN MCP config is generated
- THEN the server command launches RAI MCP for that project root
- AND no generated target path ends at `/src`

### Requirement: Bounded Agent Routing Instructions

Generated instructions MUST be concise and bounded. They MUST route RAI use to React architecture findings, drift, evidence, explanations, and refactor insight. They MUST NOT route general file reads, generic dependency graph work, or non-React questions to RAI.

#### Scenario: Routing guidance is bounded

- GIVEN instructions are enabled
- WHEN install writes a RAI marker block
- THEN the block states when to use RAI
- AND states when not to use RAI

### Requirement: Doctor Health Checks

The system MUST provide `rai doctor` checks for environment, native dependencies, SQLite/vector readiness, MCP config presence and validity, CLI build/runtime smoke, MCP server construction, and filesystem permissions.

#### Scenario: Healthy environment

- GIVEN Node, CLI build, native SQLite/vector dependencies, and MCP config are valid
- WHEN `rai doctor` runs
- THEN it reports passing checks for runtime, storage, MCP, and platform config

#### Scenario: Degraded environment

- GIVEN native dependencies fail to load or MCP config is missing/invalid
- WHEN `rai doctor` runs
- THEN it reports failing checks with actionable remediation
- AND exits non-zero for blocking failures

### Requirement: Distribution Strategy Record

The P7 distribution decision MUST keep the near-term CLI as TypeScript in `@rai/cli`, plan prebuilt native bindings for native dependency reliability, defer a Go CLI wrapper to longer-term distribution work, and defer WASM SQLite/vector work until vector support is viable.

#### Scenario: Strategy is visible to implementers

- GIVEN design or task planning begins for P7
- WHEN distribution strategy is referenced
- THEN it uses TypeScript CLI near term, prebuilt native bindings planned, Go wrapper later, and WASM deferred
