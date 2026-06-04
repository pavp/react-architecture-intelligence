# Explainability Specification

## Purpose

Explain existing RAI findings in deterministic human language without changing analyzer facts, evidence shapes, fingerprints, diagnostics, or memory semantics.

## Requirements

### Requirement: Presentation-only explanation envelope

The system MUST provide bounded explanation fields derived only from an existing finding, its rule metadata, evidence keys, glossary entries, diagnostics, and memory overlay state. Raw evidence MUST remain authoritative and available.

#### Scenario: Finding explanation preserves facts

- GIVEN an existing finding with raw evidence
- WHEN the finding is explained
- THEN the explanation includes what was found, why it matters, what to inspect first, and what not to assume
- AND raw evidence, fingerprint, rule, severity, span, and memory overlay values remain unchanged

#### Scenario: Unknown evidence is not invented

- GIVEN a finding with an unrecognized evidence key
- WHEN the finding is explained
- THEN the explanation reports the key as raw evidence
- AND MUST NOT infer intent, root cause, ownership, or remediation not present in evidence

### Requirement: Glossary for evidence terms

The system MUST expose concise glossary definitions for known evidence and output terms, including `cosine`, `propOverlap`, `hookOverlap`, `sharedSurface`, `groundingFields`, `span`, `diagnostic`, `fanIn`, `fanOut`, `directChildren`, `reachableDepth`, `roles`, `metrics`, `thresholds`, and `topology`.

#### Scenario: Known term explained

- GIVEN a user sees a supported evidence term
- WHEN glossary text is requested or rendered
- THEN the term has a concise definition grounded in RAI output semantics

#### Scenario: Missing term remains explicit

- GIVEN a term with no glossary definition
- WHEN glossary text is requested or rendered
- THEN the system labels it as unknown or raw
- AND MUST NOT fabricate a definition

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

### Requirement: MCP `explain_finding` explainability

The `explain_finding` tool MUST return existing raw finding data plus the presentation-only explanation envelope and grounding fields. Additions MUST be backward-compatible and MUST NOT remove current raw fields.

#### Scenario: MCP response includes bounded explanation

- GIVEN a stored finding fingerprint
- WHEN `explain_finding` is called
- THEN the response includes raw evidence and deterministic explanation fields
- AND the explanation identifies source evidence keys used for grounding

#### Scenario: Missing finding remains an error state

- GIVEN an unknown fingerprint
- WHEN `explain_finding` is called
- THEN the tool reports the existing not-found behavior
- AND MUST NOT synthesize an explanation

### Requirement: CLI file explanation UX

The CLI MUST provide `rai explain <file>` to inspect findings connected to a file through primary spans or nested evidence file references. Output SHOULD be human-readable by default and MAY support JSON when consistent with existing CLI conventions.

#### Scenario: File has findings

- GIVEN analysis finds one or more findings connected to a requested file
- WHEN `rai explain <file>` runs
- THEN the CLI renders relevant findings with summary, evidence terms, inspect-first guidance, and limits
- AND findings remain tied to original fingerprints and spans

#### Scenario: File has no findings

- GIVEN analysis finds no findings connected to a requested file
- WHEN `rai explain <file>` runs
- THEN the CLI reports no relevant findings for that file
- AND exits without writing feedback or changing memory

### Requirement: README onboarding

The root README MUST onboard new users with a quick path: what RAI does, install path, first commands, how to read findings, glossary terms, limitations, and next steps.

#### Scenario: New user follows quick path

- GIVEN a new user opens the README
- WHEN they follow the quick path
- THEN they can run doctor, analyze, explain a file, and understand output limitations
