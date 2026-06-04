# Delta for Explainability

## MODIFIED Requirements

### Requirement: Current Analyzer Finding Explanation Coverage

The system MUST provide deterministic, evidence-first, human-facing explanations for every current analyzer finding exposed through CLI `rai explain` and MCP `explain_finding`. Current analyzer coverage MUST include known core evidence for `react/shared-extraction`, `react/render-coupling`, `react/over-abstraction`, `react/hook-topology`, and `react/boundary-violation`, plus adapter-owned rules `react/compound-component-api-drift`, `react/container-presenter-role-drift`, `react/controlled-uncontrolled-prop-surface-drift`, `next/client-boundary-bloat`, and `next/route-coupling`. Human-facing summaries and inspect-first guidance MUST lead with observed code facts and MUST avoid generic or internal wording such as `RAI found <kind> evidence for <ruleId>` as the primary explanation.

#### Scenario: Known core evidence is explained in plain language

- GIVEN a finding grounded in a known core evidence kind for shared extraction, render coupling, over-abstraction, hook topology, or boundary violation
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the summary MUST describe the observed relationship or code shape in plain language
- AND inspect-first guidance MUST cite concrete evidence in user-facing terms
- AND the explanation MUST NOT lead with generic evidence-kind or rule-id wording.

#### Scenario: Adapter-owned analyzer findings avoid adapter-metric internals

- GIVEN a finding for `react/compound-component-api-drift`, `react/controlled-uncontrolled-prop-surface-drift`, `next/client-boundary-bloat`, or `next/route-coupling`
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the summary and inspect-first guidance MUST use adapter-owned wording for the observed compound parts, controlled/default prop pairs, route topology, client boundary topology, metrics, thresholds, files, or roles
- AND raw adapter-metric labels such as `adapter:`, `rule:`, `metric`, `threshold`, or `exceeded topology` MUST NOT be the primary human explanation
- AND any metrics or thresholds shown to users MUST be framed as observed counts, limits, or topology facts rather than internal formatter output.

#### Scenario: Container presenter explanation remains covered

- GIVEN a `react/container-presenter-role-drift` finding is emitted
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the explanation MUST remain plain-language and evidence-first
- AND the limits MUST NOT claim wrong architecture, bad separation of concerns, team intent, root cause, user impact, historical change, or required refactoring.

#### Scenario: Controlled/uncontrolled explanation is plain language and bounded

- GIVEN a `react/controlled-uncontrolled-prop-surface-drift` finding is emitted
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the explanation MUST mention the component, observed controlled/default prop pair or pairs, and file in plain language
- AND the limits MUST NOT claim runtime controlled behavior, runtime React warnings, a bug, team intent, root cause, user impact, or required remediation.
