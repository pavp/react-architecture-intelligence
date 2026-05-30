# Capability Spec: Analysis Pipeline

**Status**: Active (RFC 2119)  
**Origin**: changes `analyzer-fault-containment`, `more-analyzers-render-overabstraction`, `p4-snapshot-get-drift`, `wire-ts-morph-pass2` (2026-05-30)
**Scope**: analyzer execution ordering, partial-failure diagnostics, persistence boundaries, snapshot population, and lazy type resolution for repository analysis.

## Purpose

Define analyzer execution ordering, partial-failure diagnostics, persistence boundaries, snapshot population, and lazy type resolution for repository analysis.

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

## Requirement: Commit SHA Resolution

The pipeline MUST attempt to resolve the current commit SHA for the analyzed repository before snapshot population. Resolution MUST be read-only (no checkout). If the repository is not a git repo, or the SHA cannot be resolved, the pipeline MUST skip snapshot population and emit a single diagnostic (`kind: "snapshot-skipped"`, `message: "no git SHA available"`). Skipping MUST NOT fail `analyzeRepo` or prevent findings from being returned.

### Scenario: SHA resolved — snapshot is written

- GIVEN a repository is a git repo with a resolvable HEAD SHA
- WHEN `analyzeRepo` completes and findings are persisted
- THEN the pipeline MUST write one snapshot row per current finding
- AND each row MUST use the resolved SHA as `commit_sha`

### Scenario: Non-git fixture — snapshot is skipped

- GIVEN the analyzed path is not a git repository
- WHEN `analyzeRepo` completes
- THEN snapshot population MUST be skipped
- AND a diagnostic with `kind: "snapshot-skipped"` MUST be emitted
- AND `analyzeRepo` MUST return findings normally

## Requirement: Snapshot Population After Persist

After the finding-persist step, the pipeline MUST append one snapshot row per currently persisted finding to the `snapshot` table. The row shape is `(commit_sha, fingerprint, rule_id, severity_raw, evidence_digest, created_at)`.

`created_at` MUST be sourced from the pipeline's `asOf` timestamp. The pipeline MUST NOT use `Date.now()`, `Math.random()`, or any non-deterministic source when computing `created_at` or `evidence_digest`.

Population MUST be idempotent on the PRIMARY KEY `(commit_sha, fingerprint, rule_id)`. Re-analyzing the same commit MUST NOT produce duplicate rows or a constraint error (`INSERT OR REPLACE` or `ON CONFLICT DO UPDATE` semantics).

`evidence_digest` MUST be a stable, deterministic hash of the finding evidence. It is not required to embed raw metric values; those remain in the `finding` rows.

### Scenario: Idempotent re-analysis

- GIVEN a commit has already been analyzed and snapshot rows exist for it
- WHEN `analyzeRepo` runs again for the same commit
- THEN the `snapshot` table row count for that commit MUST NOT increase
- AND no database constraint error MUST be thrown

### Scenario: Deterministic replay

- GIVEN `analyzeRepo` is run twice on the same commit with the same findings
- WHEN both runs complete
- THEN the snapshot rows produced by each run MUST be byte-for-byte identical
- AND `created_at` MUST equal the `asOf` value passed to the pipeline

### Scenario: Snapshot is populated after findings persist

- GIVEN `analyzeRepo` runs and one analyzer returns two findings
- WHEN persist completes
- THEN `snapshot` MUST contain exactly two rows for that `commit_sha` (one per finding)
- AND each row MUST have a non-null `evidence_digest`

## Requirement: Snapshot Is a Derived View

The `snapshot` table MUST be treated as a derived materialized view of T3 (finding history). It MUST NOT be human-authored or used as an independent source of truth. It is regenerable from findings and MUST NOT replace or supersede the `finding` table.

### Scenario: Snapshot does not affect finding integrity

- GIVEN snapshot population runs after findings persist
- WHEN snapshot rows are written
- THEN finding rows MUST remain unchanged
- AND snapshot failures MUST NOT roll back persisted findings

## Requirement: Lazy Pass-2 Type Resolution

`AnalysisContext.types.typeOf(span)` MUST provide a lazy Pass-2 type lookup backed by `ts-morph`. The resolver MUST NOT construct the semantic project until an analyzer calls `typeOf`. Analysis runs whose analyzers never call `typeOf` MUST pay no Pass-2 project construction cost.

### Scenario: No type lookup keeps Pass-2 cold

- GIVEN analyzers execute without calling `ctx.types.typeOf`
- WHEN `analyzeRepo` runs
- THEN the Pass-2 project MUST NOT be constructed

### Scenario: Type lookup returns stable type info

- GIVEN a component span from Pass-1 with typed props
- WHEN an analyzer calls `ctx.types.typeOf(span)`
- THEN the resolver MUST return stable `TypeInfo` with a deterministic `text` value
- AND the resolver MUST NOT expose raw `ts-morph` nodes or TypeScript compiler objects

## Requirement: Type Resolver Cache and Stale Span Boundary

`typeOf(span)` MUST memoize lookups by span coordinates plus the current module content hash. If the file content changes, the changed hash MUST force a fresh lookup rather than serving a stale cached result. A span that no longer resolves in the current file MUST return `null`.

### Scenario: Same span and same hash are memoized

- GIVEN `typeOf` is called twice with the same span and same file content hash
- WHEN the second lookup runs
- THEN the cached `TypeInfo` result MAY be returned

### Scenario: Changed file hash recomputes

- GIVEN a span from a prior file version
- WHEN a resolver is built for a changed file with a different content hash
- THEN lookup MUST use the changed file content
- AND MUST NOT serve cached type info from the previous hash

## References

- Implementation: `packages/core/src/engine/pipeline.ts`, `packages/core/src/types.ts`, `packages/core/src/parse/type-resolver.ts`
- Tests: `packages/core/src/engine/pipeline.test.ts`, `packages/core/src/parse/type-resolver.test.ts`
- Source changes: `analyzer-fault-containment`, `more-analyzers-render-overabstraction`, `p4-snapshot-get-drift`, `wire-ts-morph-pass2`
