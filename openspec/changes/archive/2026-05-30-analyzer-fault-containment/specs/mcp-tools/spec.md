# Delta for MCP Tools

## ADDED Requirements

### Requirement: analyze_repo Diagnostic Summary

`analyze_repo` MUST expose analyzer diagnostics from repository analysis as non-finding metadata. The response MUST include diagnostic counts and details sufficient to identify failed analyzer rules without leaking finding bodies.

#### Scenario: Partial failure is reported without findings leakage

- GIVEN repository analysis contains one analyzer diagnostic
- WHEN `analyze_repo` returns
- THEN the response MUST include diagnostic count and detail entries
- AND diagnostic details MUST NOT include finding bodies or evidence payloads

#### Scenario: Diagnostics are not feedback targets

- GIVEN `analyze_repo` returns diagnostics
- WHEN a client reviews returned items
- THEN diagnostics MUST NOT be represented as findings
- AND diagnostics MUST NOT become valid feedback targets for `close_session` or other feedback tools

### Requirement: analyze_repo Diagnostic Integrity Boundary

`analyze_repo` MUST preserve the existing integrity model: diagnostics are runtime metadata, not CODE-derived findings. Diagnostics MUST NOT create T3 findings, memory reducer inputs, overlay entries, or feedback records.

#### Scenario: Diagnostics do not affect persistence or memory semantics

- GIVEN one analyzer fails and another analyzer returns findings
- WHEN `analyze_repo` completes
- THEN successful findings MUST remain available through existing result semantics
- AND diagnostics MUST remain separate from findings, memory, overlay, and feedback semantics
