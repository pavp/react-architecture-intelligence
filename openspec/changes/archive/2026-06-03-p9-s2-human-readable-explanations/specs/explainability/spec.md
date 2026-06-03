# Delta for Explainability

## ADDED Requirements

### Requirement: Human-Facing Output Quality

RAI human-facing output MUST lead with plain-language meaning, cite concrete observed evidence, provide inspect-first guidance, and state explicit limits. Machine-facing output, including raw findings, JSON evidence, fingerprints, MCP raw fields, persistence, and snapshots, MUST remain stable and structured. Human-facing presentation MUST NOT invent team intent, root cause, ownership, user impact, or required remediation.

#### Scenario: Human explanation is evidence-first and bounded

- GIVEN a finding has a human-facing explanation
- WHEN a user reads CLI `rai explain` or MCP `explain_finding` explanation text
- THEN the summary MUST describe what RAI observed in concrete terms
- AND the inspect-first guidance MUST point to observed subjects, files, roles, metrics, thresholds, or topology evidence
- AND the limits MUST say what RAI does not know.

#### Scenario: Machine-facing contracts remain structured

- GIVEN a human-facing explanation is improved
- WHEN raw finding JSON, evidence, fingerprints, memory overlay, persistence, or MCP raw fields are inspected
- THEN those machine-facing fields MUST remain available and structured
- AND the human explanation MUST be additive.

### Requirement: Analyzer-Owned Human Explanation Hook

The analyzer contract MAY expose an optional explanation hook that returns an additive `ExplanationEnvelope` for findings owned by that analyzer. The core explanation path MUST use the analyzer-owned explanation when available and MUST fall back to the generic explanation when absent. The hook MUST NOT mutate findings, evidence, memory, config, snapshots, or feedback.

#### Scenario: Analyzer-owned explanation is used

- GIVEN a registered analyzer provides an explanation hook for its rule id
- AND analysis has produced a finding from that analyzer
- WHEN the finding is explained
- THEN the returned explanation MUST come from the analyzer-owned hook
- AND raw evidence and memory fields MUST remain unchanged.

#### Scenario: Generic explanation fallback remains available

- GIVEN a registered analyzer does not provide an explanation hook
- WHEN the finding is explained
- THEN the system MUST return the generic bounded explanation envelope.

### Requirement: Container/Presenter Finding Has Human Explanation

The React adapter SHOULD provide a human-facing explanation for `react/container-presenter-role-drift`. The explanation MUST translate adapter evidence into bounded plain language: a container-like component renders a presenter-like component, and the presenter-like component has high-signal hook evidence. The explanation MUST NOT claim wrong architecture, bad separation of concerns, team intent, root cause, bug cause, historical change, or required refactoring.

#### Scenario: Container/presenter explanation is plain language

- GIVEN `react/container-presenter-role-drift` is emitted for `UserContainer -> UserView`
- AND `UserView` has high-signal hook evidence such as `useState`
- WHEN `rai explain` or `explain_finding` presents the finding
- THEN the summary SHOULD mention the render pair, the presenter-like side, and the hook evidence in plain language
- AND the limits MUST state that the finding does not prove wrong architecture or required remediation.
