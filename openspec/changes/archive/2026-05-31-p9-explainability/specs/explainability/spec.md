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
