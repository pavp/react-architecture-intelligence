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

### Requirement: Portable Launcher Contract

The system MUST expose one user-facing `rai` entrypoint for portable archives while MAY include internal runtime, engine, and native assets. The launcher MUST delegate `install`, `doctor`, `analyze`, and `mcp` to the canonical TypeScript engine without changing arguments, findings, exits, or MCP JSON.

#### Scenario: Command parity target

- GIVEN a portable build with engine assets
- WHEN `rai install`, `rai doctor`, `rai analyze`, or `rai mcp` runs
- THEN the launcher invokes the TypeScript engine with equivalent arguments
- AND user-visible results match the TypeScript CLI contract

#### Scenario: Portable layout is not true one-file

- GIVEN a release archive contains `rai` plus internal assets
- WHEN a user extracts it onto PATH
- THEN `rai` is the only required user-facing command
- AND internal assets remain an implementation detail

### Requirement: Engine Output Integrity

The TypeScript engine SHALL remain source of truth for analysis, storage, install, doctor, and MCP behavior. The launcher MUST NOT parse, rewrite, filter, or enrich analyzer output or MCP JSON.

#### Scenario: Analyzer output unchanged

- GIVEN identical project input and config
- WHEN analysis runs through the launcher and the TypeScript CLI
- THEN findings, diagnostics, and process outcome are equivalent

#### Scenario: MCP stdio safety

- GIVEN `rai mcp` is serving JSON-RPC over stdio
- WHEN the launcher emits diagnostics, logs, or startup errors
- THEN stdout remains reserved for MCP protocol data
- AND launcher diagnostics go to stderr

### Requirement: Local Prototype Verification

The MVP SHOULD support local prototype build and smoke path before release publishing. Smoke checks MUST prove startup, delegation, MCP stdout cleanliness, and failure propagation.

#### Scenario: Prototype smoke succeeds

- GIVEN a locally built launcher and engine assets
- WHEN the smoke flow runs target commands
- THEN each supported command starts successfully or returns the engine result
- AND `rai mcp` stdout contains only MCP protocol output

#### Scenario: Engine exit propagates

- GIVEN the delegated engine exits non-zero
- WHEN the launcher completes
- THEN the launcher exits with the engine exit code
- AND reports launcher-only context on stderr when useful

### Requirement: Version and Asset Coherence

The distribution MUST expose version metadata through `rai version` or equivalent metadata command. It MUST detect mismatched launcher, engine, runtime, or asset metadata and fail with actionable diagnostics.

#### Scenario: Coherent metadata

- GIVEN launcher and bundled assets share compatible metadata
- WHEN version metadata is requested
- THEN launcher, engine, runtime, and asset versions are reported

#### Scenario: Missing or mismatched assets

- GIVEN engine assets are missing or incompatible
- WHEN any delegated command runs
- THEN the launcher fails before partial execution
- AND explains the missing or mismatched component on stderr

### Requirement: Platform and Release Channel Contract

The eventual release target SHALL cover darwin, linux, and windows on amd64 and arm64. The MVP MAY ship only a local prototype if design scopes release publishing later. Future releases MUST provide GitHub Release archives and checksums, Homebrew, Scoop, and install-script fallback.

#### Scenario: Unsupported target

- GIVEN an unsupported OS or architecture
- WHEN the launcher starts or archive selection runs
- THEN the system fails with supported target guidance

#### Scenario: Future channel artifacts

- GIVEN release publishing is enabled in a later slice
- WHEN artifacts are produced
- THEN platform archives, checksums, and channel metadata exist for supported targets

### Requirement: Gated Real Release Publishing

The release system MUST publish GitHub Release assets, Homebrew formula updates, and Scoop manifest updates only from a validated `vX.Y.Z` or `vX.Y.Z-rc.N` tag that is reachable from protected `main`. It MUST NOT create tags or releases during implementation/apply; tag creation is a later explicit maintainer action.

#### Scenario: Real publish from authorized tag

- GIVEN required secrets `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN` exist
- AND a `vX.Y.Z` or `vX.Y.Z-rc.N` tag points to a commit reachable from `origin/main`
- WHEN the release workflow runs in publish mode after checks pass
- THEN GoReleaser publishes GitHub Release assets, Homebrew tap output, and Scoop bucket output

#### Scenario: Publish is blocked without safe ref

- GIVEN the workflow is not running for a valid `vX.Y.Z` or `vX.Y.Z-rc.N` tag
- WHEN publish mode is requested
- THEN the workflow fails before GoReleaser publish
- AND no release, formula, manifest, or tag is created

#### Scenario: Manual preflight remains read-only

- GIVEN a maintainer starts `workflow_dispatch` without publish confirmation
- WHEN preflight executes for a candidate release tag
- THEN it validates secrets, tag format, main ancestry, release checks, tests, build, and GoReleaser snapshot
- AND it skips publish

#### Scenario: Protection gates are documented and verified

- GIVEN release activation is reviewed
- WHEN maintainers inspect docs and release validation output
- THEN branch protection, tag ruleset for `refs/tags/v*`, required checks, review gate, and rollback through new tags are documented
- AND missing gates are reported as blockers

### Requirement: Exact Release Secret Contract

The release workflow and GoReleaser configuration MUST use repo secret/env names `RAI_RELEASE_GITHUB_TOKEN`, `RAI_HOMEBREW_TAP_TOKEN`, and `RAI_SCOOP_BUCKET_TOKEN`. Publishing MUST fail closed when any required value is absent.

#### Scenario: Required secret missing

- GIVEN any required release secret is unavailable
- WHEN release preflight or publish mode starts
- THEN the workflow exits non-zero before GoReleaser publish
- AND reports the missing secret name

#### Scenario: Tokens flow to channel publishers

- GIVEN all required release secrets exist
- WHEN GoReleaser is invoked in publish mode
- THEN GitHub Release, Homebrew tap, and Scoop bucket publishing receive their corresponding token values through the documented environment contract

### Requirement: Explicit Non-goals

P8 MUST NOT rewrite the analyzer engine, storage layer, MCP server, or TypeScript behavior source of truth in Go. It MUST NOT perform real publishing that depends on absent repositories, taps, buckets, tokens, or secrets.

#### Scenario: Scope guard

- GIVEN implementation planning proposes Go engine/storage rewrite or real publish setup
- WHEN work is evaluated against P8
- THEN the work is rejected or deferred outside this change
