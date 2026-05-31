# Delta for CLI Adapter Loading

## ADDED Requirements

### Requirement: Installed React Adapter Loading

`rai analyze` MUST register React adapter analyzers when the supported React adapter package is available in the workspace or installation. Analysis MUST continue without React analyzers when the optional React adapter is unavailable. React adapter loading MUST preserve existing Next adapter loading behavior and MUST NOT introduce adapter imports from `packages/core`.

#### Scenario: React adapter available

- GIVEN a workspace or installation exposes the supported React adapter package
- WHEN `rai analyze` runs on a React fixture with grounded compound API divergence
- THEN React adapter analyzers MUST be registered outside `@rai/core`
- AND React findings and diagnostics MUST flow through normal analysis output.

#### Scenario: React adapter unavailable

- GIVEN the supported React adapter package cannot be loaded
- WHEN `rai analyze` runs
- THEN analysis MUST complete deterministically with baseline analyzers and any other available adapters
- AND the optional-load diagnostic, if reported, MUST remain separate from findings.

#### Scenario: Next adapter behavior is preserved

- GIVEN the supported Next and React adapter packages are both available
- WHEN `rai analyze` runs on a Next fixture
- THEN existing Next adapter analyzers MUST still be registered according to their current contracts
- AND React adapter composition MUST NOT suppress or rewrite Next findings, diagnostics, or unsupported-variant behavior.

### Requirement: React Adapter MCP and Snapshot Parity

MCP analysis sessions MUST include React adapter analyzers when the supported React adapter is available through the same composition path used by CLI analysis. Snapshot-producing analysis SHOULD include the same React adapter findings so existing historical drift can compare stable pattern findings over time.

#### Scenario: MCP analysis includes React adapter findings

- GIVEN the React adapter is available and analysis input contains grounded compound API divergence
- WHEN `rai mcp` serves `analyze_repo`
- THEN MCP counts and findings MUST reflect the same React adapter composition as `rai analyze`
- AND diagnostics MUST remain in the diagnostics channel.

#### Scenario: Snapshot-producing analysis can compare React findings

- GIVEN React adapter findings are stable and adapter loading is available for snapshot-producing analysis
- WHEN snapshots are written from analysis runs
- THEN React adapter findings SHOULD be included through the normal snapshot path
- AND historical comparison SHOULD use existing finding fingerprints, rule IDs, and evidence digests.
