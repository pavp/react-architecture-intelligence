# Pattern Fact Extraction Specification

## Purpose

Define framework-neutral source syntax facts that future pattern analyzers can consume without moving framework intent into `@rai/core`.

## Requirements

### Requirement: Framework-neutral fact coverage

Core MUST extract deterministic syntax facts for imports, exports, call expressions, JSX parent/child structure, hook-like names, static/member assignments, and file-role seeds. Facts MUST describe observed source syntax only and MUST NOT include React-specific pattern names, intent, catalog rules, findings, remediation, or framework roles.

#### Scenario: Generic facts are extracted

- GIVEN a source file with imports, exports, calls, JSX children, hook-like calls, and member assignments
- WHEN analysis builds the core graph
- THEN graph facts include those source-observed facts with file identity and evidence spans
- AND facts do not claim architectural pattern intent

#### Scenario: Core remains framework-agnostic

- GIVEN core fact types, parser tests, and graph output are inspected
- WHEN P10 fact extraction is implemented
- THEN they MUST NOT contain React catalog names, React rule IDs, or React pattern labels

### Requirement: Deterministic graph persistence

Pattern facts carried by `RepoGraph` MUST be sorted, deduped, JSON-safe, and frozen with the graph. Repeated analysis of identical input MUST produce equivalent fact order, values, and spans.

#### Scenario: Facts are stable and immutable

- GIVEN identical project input is analyzed twice
- WHEN callers compare graph fact collections
- THEN fact values and order are equivalent
- AND mutation attempts cannot change frozen graph facts

#### Scenario: Ambiguous syntax stays raw

- GIVEN an alias, namespace import, re-export, or static member assignment has unclear semantic meaning
- WHEN facts are extracted
- THEN the fact records observed syntax and names only
- AND MUST NOT infer symbol resolution or component pattern membership
