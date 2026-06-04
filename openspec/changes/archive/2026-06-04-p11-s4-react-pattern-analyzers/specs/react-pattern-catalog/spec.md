# Delta for React Pattern Catalog

## MODIFIED Requirements

### Requirement: Adapter-owned React catalog scaffolding

React pattern catalog data MUST live outside `packages/core` and consume only core generic facts plus adapter-owned metadata. Catalog scaffolding MAY define named React pattern signatures for future analyzers, but P10/P11-S4 catalog scaffolding MUST NOT emit findings, feedback writes, or remediation. If the catalog exposes a comprehensive list of supported generic fact kinds, it SHOULD include newly available generic facts such as `call-binding`, `call-argument`, and `jsx-attribute` without adding React interpretation to core.

#### Scenario: Catalog consumes expanded facts without findings

- GIVEN analysis produces generic facts for a React fixture
- WHEN React catalog scaffolding is loaded
- THEN catalog code can reference fact kinds needed by future analyzers
- AND no findings, memory writes, config writes, feedback writes, or remediation are emitted by catalog scaffolding.

#### Scenario: Core has no React catalog dependency

- GIVEN package dependencies and imports are inspected
- WHEN catalog scaffolding references expanded generic facts
- THEN `packages/core` MUST NOT import React catalog modules
- AND React-specific names remain outside core contracts.
