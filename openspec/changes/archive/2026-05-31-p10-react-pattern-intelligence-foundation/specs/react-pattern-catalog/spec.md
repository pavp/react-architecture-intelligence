# React Pattern Catalog Specification

## Purpose

Define React catalog scaffolding and fixtures outside `packages/core` so later analyzers can interpret generic facts without changing core truth.

## Requirements

### Requirement: Adapter-owned React catalog scaffolding

React pattern catalog data MUST live outside `packages/core` and consume only core generic facts plus adapter-owned metadata. Catalog scaffolding MAY define named React pattern signatures for future analyzers, but P10 MUST NOT emit findings, feedback writes, or remediation.

#### Scenario: Catalog consumes facts without findings

- GIVEN analysis produces generic facts for a React fixture
- WHEN React catalog scaffolding is loaded
- THEN catalog code can reference fact kinds needed by future analyzers
- AND no findings or memory writes are emitted by P10 catalog scaffolding

#### Scenario: Core has no React catalog dependency

- GIVEN package dependencies and imports are inspected
- WHEN catalog scaffolding exists
- THEN `packages/core` MUST NOT import React catalog modules
- AND React-specific names remain outside core contracts

### Requirement: Compound primitive fixtures

P10 MUST provide deterministic Modal and Popover fixture examples outside core tests. Fixtures SHOULD cover namespace usage, static member assignment, dot-member JSX, trigger/content children, and re-export or alias forms where useful.

#### Scenario: Modal and Popover fixture evidence exists

- GIVEN fixture analysis runs
- WHEN generic facts are inspected
- THEN facts include Modal and Popover imports, static members, JSX child/member usage, and calls where present
- AND fixture expectations remain syntax-based, not finding-based

#### Scenario: Fixture scope remains foundation-only

- GIVEN later analyzer ideas are reviewed during P10
- WHEN a broad compound-component, provider, form, or data-fetching finding is proposed
- THEN that work MUST be deferred beyond P10
- AND catalog fixtures remain evidence scaffolding only
