# Delta for Single Binary Distribution

## ADDED Requirements

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

### Requirement: Explicit Non-goals

P8 MUST NOT rewrite the analyzer engine, storage layer, MCP server, or TypeScript behavior source of truth in Go. It MUST NOT perform real publishing that depends on absent repositories, taps, buckets, tokens, or secrets.

#### Scenario: Scope guard

- GIVEN implementation planning proposes Go engine/storage rewrite or real publish setup
- WHEN work is evaluated against P8
- THEN the work is rejected or deferred outside this change
