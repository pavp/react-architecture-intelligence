# Analysis Pipeline Specification

## Purpose

Define analyzer execution ordering, partial-failure diagnostics, and persistence boundaries for repository analysis.

## Requirements

### Requirement: Analyzer Crash Isolation

The system MUST execute analyzers in registry order. A thrown analyzer MUST NOT throw from `analyzeRepo` and MUST NOT prevent later analyzers from running.

#### Scenario: Throwing analyzer is contained

- GIVEN analyzers A, B, and C are registered in order
- AND analyzer B throws during analysis
- WHEN `analyzeRepo` runs
- THEN analyzer C MUST still run
- AND `analyzeRepo` MUST return normally

### Requirement: Successful Findings Persistence Boundary

The system MUST persist and present findings returned by successful analyzers normally. A failed analyzer MUST contribute zero findings and MUST NOT write a T3 finding.

#### Scenario: Successful findings survive partial failure

- GIVEN one analyzer throws and a later analyzer returns a valid finding
- WHEN `analyzeRepo` completes
- THEN the valid finding MUST be persisted and presented normally
- AND no finding MUST exist for the failed analyzer

### Requirement: Deterministic Diagnostic Channel

Analyzer failures MUST be reported through a diagnostics channel separate from findings, memory, and overlay data. Each diagnostic MUST use only stable fields: `ruleId`, `kind`, `errorName`, and `message`. Diagnostics MUST NOT include stack traces, volatile paths, or finding bodies.

#### Scenario: Failure diagnostic is stable

- GIVEN an analyzer with `ruleId` `shared-extraction` throws `TypeError("boom")`
- WHEN `analyzeRepo` completes
- THEN diagnostics MUST include `ruleId`, `kind: "analyzer-error"`, `errorName`, and `message`
- AND findings, memory, and overlay inputs MUST NOT include that diagnostic

### Requirement: Timeout Scope Boundary

This capability version MUST NOT claim hard timeout or worker-level interruptibility for CPU-hung synchronous analyzers. It MUST NOT use `Promise.race` semantics that pretend to preempt synchronous infinite loops.

#### Scenario: Timeout is not part of this contract

- GIVEN a synchronous analyzer does not yield control
- WHEN this capability is evaluated
- THEN hard interruption MUST be considered out of scope
- AND fake Promise-based timeout semantics MUST NOT be specified as containment
