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
