# Delta for Explainability

## ADDED Requirements

### Requirement: Current Analyzer Finding Explanation Coverage

The system MUST provide deterministic, evidence-first, human-facing explanations for every current analyzer finding exposed through CLI `rai explain` and MCP `explain_finding`. Current analyzer coverage MUST include known core evidence for `react/shared-extraction`, `react/render-coupling`, `react/over-abstraction`, `react/hook-topology`, and `react/boundary-violation`, plus adapter-owned rules `react/compound-component-api-drift`, `react/container-presenter-role-drift`, `next/client-boundary-bloat`, and `next/route-coupling`. Human-facing summaries and inspect-first guidance MUST lead with observed code facts and MUST avoid generic or internal wording such as `RAI found <kind> evidence for <ruleId>` as the primary explanation.

#### Scenario: Known core evidence is explained in plain language

- GIVEN a finding grounded in a known core evidence kind for shared extraction, render coupling, over-abstraction, hook topology, or boundary violation
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the summary MUST describe the observed relationship or code shape in plain language
- AND inspect-first guidance MUST cite concrete evidence in user-facing terms
- AND the explanation MUST NOT lead with generic evidence-kind or rule-id wording.

#### Scenario: Adapter-owned analyzer findings avoid adapter-metric internals

- GIVEN a finding for `react/compound-component-api-drift`, `next/client-boundary-bloat`, or `next/route-coupling`
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the summary and inspect-first guidance MUST use adapter-owned wording for the observed compound parts, route topology, client boundary topology, metrics, thresholds, files, or roles
- AND raw adapter-metric labels such as `adapter:`, `rule:`, `metric`, `threshold`, or `exceeded topology` MUST NOT be the primary human explanation
- AND any metrics or thresholds shown to users MUST be framed as observed counts, limits, or topology facts rather than internal formatter output.

#### Scenario: Container presenter explanation remains covered

- GIVEN a `react/container-presenter-role-drift` finding is emitted
- WHEN CLI `rai explain` or MCP `explain_finding` presents the finding
- THEN the explanation MUST remain plain-language and evidence-first
- AND the limits MUST NOT claim wrong architecture, bad separation of concerns, team intent, root cause, user impact, historical change, or required refactoring.

### Requirement: Adapter-Specific Explanation Ownership

Adapter-specific human wording MUST be owned by the adapter that owns the analyzer rule. `@rai/core` MUST NOT hardcode React-specific or Next-specific semantics for adapter-owned rules. The core explanation path MAY provide framework-neutral explanations for known core evidence shapes and MUST provide bounded fallback behavior when no analyzer-owned explanation is available. When an adapter-owned explanation hook is available through analyzer composition, CLI and MCP explanation paths MUST use it without mutating raw facts.

#### Scenario: Adapter hook survives composition

- GIVEN an adapter analyzer provides an explanation hook for a finding it emits
- AND the analyzer is loaded through CLI or MCP adapter composition
- WHEN the finding is explained
- THEN the explanation MUST come from the adapter-owned hook
- AND raw finding, evidence, fingerprint, severity, spans, diagnostics, grounding fields, and memory overlay values MUST remain unchanged.

#### Scenario: Core does not invent adapter semantics

- GIVEN an adapter-owned finding has no analyzer-owned explanation hook
- WHEN the core fallback explains the finding
- THEN `@rai/core` MUST NOT fabricate React-specific or Next-specific meaning for the adapter rule
- AND the fallback MUST stay bounded to raw evidence, rule metadata, glossary entries, diagnostics, and memory overlay state.

### Requirement: Machine-Facing Contracts Remain Stable During Explanation Coverage Upgrade

Improving human explanation text MUST NOT change machine-facing contracts. Raw findings, evidence keys and values, fingerprints, rule ids, severity/status values, spans, diagnostics, grounding fields, memory overlay state, snapshots, persistence records, feedback behavior, MCP raw fields, and raw JSON schemas for `rai analyze` and `rai explain --json` MUST remain stable and structured. Human explanation text MUST remain additive over source-code-derived findings in the CODE -> FINDINGS -> CONFIG/MEMORY overlay -> LLM integrity model.

#### Scenario: JSON and MCP raw fields stay unchanged

- GIVEN a current analyzer finding can be returned through CLI JSON or MCP `explain_finding`
- WHEN the human explanation text is improved
- THEN raw finding fields, raw evidence fields, fingerprint, rule id, severity/status, spans, grounding fields, and memory overlay values MUST remain available in their existing structured locations
- AND the improved explanation MUST be additive rather than a replacement for raw facts.

#### Scenario: Explanation does not write feedback or persistence

- GIVEN a finding is explained through CLI `rai explain` or MCP `explain_finding`
- WHEN the explanation envelope is produced
- THEN the explanation path MUST NOT mutate findings, evidence, config, memory overlay, snapshots, feedback, persistence records, or diagnostics
- AND no new analyzer finding MUST be created by the explanation text.

### Requirement: Unknown Evidence Fallback Remains Bounded

The system MUST retain an explicit fallback for unknown evidence keys, unknown rules, and adapter outputs without an analyzer-owned explanation hook. The fallback MAY expose raw evidence keys and values, but it MUST identify them as raw or unrecognized evidence and MUST NOT infer team intent, root cause, ownership, user impact, architectural correctness, historical change, or required remediation.

#### Scenario: Unknown evidence reports raw facts only

- GIVEN a finding contains an unrecognized evidence kind or evidence key
- WHEN CLI `rai explain` or MCP `explain_finding` explains the finding
- THEN the explanation MUST report the unknown key or value as raw evidence
- AND the explanation MUST NOT invent semantic meaning, cause, impact, ownership, or remediation.

#### Scenario: Adapter fallback remains explicit when hook is absent

- GIVEN an adapter-owned finding lacks an analyzer-owned explanation hook
- WHEN the generic fallback explains the finding
- THEN the explanation MUST stay explicit that it is reporting raw evidence
- AND adapter-specific plain-language meaning MUST NOT be synthesized by `@rai/core`.
