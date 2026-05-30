# Capability Spec: Analysis Pipeline

**Status**: Active (RFC 2119)  
**Origin**: change `analyzer-fault-containment` (2026-05-30)  
**Scope**: analyzer execution ordering, partial-failure diagnostics, and persistence boundaries for repository analysis.

## Purpose

Define analyzer execution ordering, partial-failure diagnostics, and persistence boundaries for repository analysis.

## Requirement: Analyzer Crash Isolation

The system MUST execute analyzers in registry order. A thrown analyzer MUST NOT throw from `analyzeRepo` and MUST NOT prevent later analyzers from running.

### Scenario: Throwing analyzer is contained

- GIVEN analyzers A, B, and C are registered in order
- AND analyzer B throws during analysis
- WHEN `analyzeRepo` runs
- THEN analyzer C MUST still run
- AND `analyzeRepo` MUST return normally

## Requirement: Deterministic Analyzer Registration

The system MUST register and execute `react/render-coupling` and `react/over-abstraction` through the existing analyzer registry in deterministic order. The analyzer contract MUST NOT change. Existing C3 diagnostic isolation MUST continue to contain failures so one failed analyzer does not block later analyzers or successful findings.

### Scenario: New analyzers execute in registry order

- GIVEN `react/render-coupling` and `react/over-abstraction` are registered with existing analyzers
- WHEN `analyzeRepo` runs
- THEN both analyzers MUST execute in registry order
- AND successful findings MUST be returned through the existing findings path

### Scenario: Diagnostic isolation still protects execution

- GIVEN one registered analyzer throws before either new analyzer completes
- WHEN `analyzeRepo` runs
- THEN later registered analyzers MUST still execute
- AND the thrown analyzer MUST contribute only a C3 diagnostic and zero findings

## Requirement: Successful Findings Persistence Boundary

The system MUST persist and present findings returned by successful analyzers normally. A failed analyzer MUST contribute zero findings and MUST NOT write a T3 finding.

### Scenario: Successful findings survive partial failure

- GIVEN one analyzer throws and a later analyzer returns a valid finding
- WHEN `analyzeRepo` completes
- THEN the valid finding MUST be persisted and presented normally
- AND no finding MUST exist for the failed analyzer

## Requirement: Deterministic Diagnostic Channel

Analyzer failures MUST be reported through a diagnostics channel separate from findings, memory, and overlay data. Each diagnostic MUST use only stable fields: `ruleId`, `kind`, `errorName`, and `message`. Diagnostics MUST NOT include stack traces, volatile paths, or finding bodies.

### Scenario: Failure diagnostic is stable

- GIVEN an analyzer with `ruleId` `shared-extraction` throws `TypeError("boom")`
- WHEN `analyzeRepo` completes
- THEN diagnostics MUST include `ruleId`, `kind: "analyzer-error"`, `errorName`, and `message`
- AND findings, memory, and overlay inputs MUST NOT include that diagnostic

## Requirement: Timeout Scope Boundary

This capability version MUST NOT claim hard timeout or worker-level interruptibility for CPU-hung synchronous analyzers. It MUST NOT use `Promise.race` semantics that pretend to preempt synchronous infinite loops.

### Scenario: Timeout is not part of this contract

- GIVEN a synchronous analyzer does not yield control
- WHEN this capability is evaluated
- THEN hard interruption MUST be considered out of scope
- AND fake Promise-based timeout semantics MUST NOT be specified as containment

## References

- Implementation: `packages/core/src/engine/pipeline.ts`, `packages/core/src/types.ts`
- Tests: `packages/core/src/engine/pipeline.test.ts`
- Source changes: `analyzer-fault-containment`, `more-analyzers-render-overabstraction`
