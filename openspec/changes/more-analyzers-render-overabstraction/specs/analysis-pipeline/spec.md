# Delta for Analysis Pipeline

## ADDED Requirements

### Requirement: Deterministic Analyzer Registration

The system MUST register and execute `react/render-coupling` and `react/over-abstraction` through the existing analyzer registry in deterministic order. The analyzer contract MUST NOT change. Existing C3 diagnostic isolation MUST continue to contain failures so one failed analyzer does not block later analyzers or successful findings.

#### Scenario: New analyzers execute in registry order

- GIVEN `react/render-coupling` and `react/over-abstraction` are registered with existing analyzers
- WHEN `analyzeRepo` runs
- THEN both analyzers MUST execute in registry order
- AND successful findings MUST be returned through the existing findings path

#### Scenario: Diagnostic isolation still protects execution

- GIVEN one registered analyzer throws before either new analyzer completes
- WHEN `analyzeRepo` runs
- THEN later registered analyzers MUST still execute
- AND the thrown analyzer MUST contribute only a C3 diagnostic and zero findings
