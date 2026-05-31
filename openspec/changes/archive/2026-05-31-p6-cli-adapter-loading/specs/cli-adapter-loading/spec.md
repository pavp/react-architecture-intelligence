# CLI Adapter Loading Specification

## Purpose

Define framework-adapter composition for CLI/package entrypoints while keeping `@rai/core` framework-free and preserving existing analysis/MCP result contracts.

## Requirements

### Requirement: Framework-Free CLI Composition Root

The CLI package MUST compose supported adapters outside `@rai/core`. `@rai/core` MUST NOT import framework adapter packages or contain framework-specific package names, rule IDs, roles, variants, or strings.

#### Scenario: Core remains framework-free

- GIVEN `rai analyze` runs with adapter loading enabled
- WHEN core analyzers and sessions are constructed
- THEN adapter composition MUST occur outside `@rai/core`
- AND core framework-free guard MUST pass.

### Requirement: Installed Next Adapter Loading

`rai analyze` MUST register Next adapter analyzers when the supported Next adapter package is available in the workspace/install and MUST continue without Next analyzers when unavailable.

#### Scenario: Next adapter available

- GIVEN a workspace/install exposes the supported Next adapter package
- WHEN `rai analyze` runs on a Next fixture
- THEN Next adapter analyzers MUST be registered
- AND Next findings and diagnostics MUST flow through normal analysis output.

#### Scenario: Next adapter unavailable

- GIVEN the supported Next adapter package cannot be loaded
- WHEN `rai analyze` runs
- THEN analysis MUST complete deterministically with baseline analyzers only
- AND the optional-load diagnostic, if reported, MUST be separate from findings.

### Requirement: Adapter Results Preserve Analysis Contracts

Adapter findings and diagnostics MUST flow through the existing `analyze_repo`/analysis result shape. Adapter diagnostics MUST NOT become findings, feedback targets, memory overlay inputs, or adapter-owned persistence writes.

#### Scenario: Adapter findings affect counts

- GIVEN a Next fixture produces adapter findings
- WHEN analysis completes
- THEN returned counts MUST include those findings
- AND diagnostics MUST remain in the diagnostics channel.

#### Scenario: Analyzer diagnostic return is normalized

- GIVEN a successful adapter analyzer returns findings plus diagnostics
- WHEN analysis normalizes analyzer output
- THEN findings MUST persist through existing T3 semantics
- AND diagnostics MUST remain separate runtime metadata.

### Requirement: Next Fixture Behavior

Next fixture analysis MUST return relevant Next analyzer findings, counts, and variant diagnostics according to existing Next analyzer contracts.

#### Scenario: Next fixture emits adapter signal

- GIVEN a fixture that detection classifies as supported Next
- WHEN `rai analyze` runs
- THEN output MUST include expected Next analyzer finding counts
- AND unsupported-variant diagnostics MUST appear only when adapter contracts define them.

### Requirement: Plain React Baseline

Plain React/non-Next analysis MUST remain valid and MUST NOT emit Next findings.

#### Scenario: Non-Next project stays baseline-only

- GIVEN a plain React fixture without Next signals
- WHEN `rai analyze` runs
- THEN analysis MUST succeed
- AND no `next/*` findings MUST be returned.

### Requirement: Command Parity

`rai backfill` and `rai mcp` SHOULD reuse the same adapter composition as `rai analyze` so snapshot history and MCP counts match CLI analysis. Any deferral MUST be documented with rationale before implementation.

#### Scenario: Backfill parity

- GIVEN adapter loading is available for normal analysis
- WHEN `rai backfill` analyzes commits
- THEN snapshots SHOULD include the same adapter-derived findings as `rai analyze`.

#### Scenario: MCP parity

- GIVEN adapter loading is available for normal analysis
- WHEN `rai mcp` serves `analyze_repo`
- THEN MCP counts and diagnostics SHOULD reflect the same adapter composition as `rai analyze`.

### Requirement: Deterministic Error Handling

Adapter load failures and adapter analyzer errors MUST be deterministic. Optional adapter load failure MUST NOT fail baseline analysis, while analyzer execution failures MUST use the existing diagnostic isolation contract.

#### Scenario: Adapter analyzer throws

- GIVEN a registered adapter analyzer throws
- WHEN analysis runs
- THEN later analyzers MUST still run
- AND a stable analyzer diagnostic MUST be returned without adapter findings for the failed analyzer.
