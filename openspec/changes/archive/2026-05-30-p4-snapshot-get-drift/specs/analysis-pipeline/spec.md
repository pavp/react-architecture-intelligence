# Delta for Analysis Pipeline

**Change**: `p4-snapshot-get-drift`
**Status**: Active (RFC 2119)
**Base spec**: `openspec/specs/analysis-pipeline.md`

---

## ADDED Requirements

### Requirement: Commit SHA Resolution

The pipeline MUST attempt to resolve the current commit SHA for the analyzed repository before snapshot population. Resolution MUST be read-only (no checkout). If the repository is not a git repo, or the SHA cannot be resolved, the pipeline MUST skip snapshot population and emit a single diagnostic (`kind: "snapshot-skipped"`, `message: "no git SHA available"`). Skipping MUST NOT fail `analyzeRepo` or prevent findings from being returned.

#### Scenario: SHA resolved — snapshot is written

- GIVEN a repository is a git repo with a resolvable HEAD SHA
- WHEN `analyzeRepo` completes and findings are persisted
- THEN the pipeline MUST write one snapshot row per current finding
- AND each row MUST use the resolved SHA as `commit_sha`

#### Scenario: Non-git fixture — snapshot is skipped

- GIVEN the analyzed path is not a git repository
- WHEN `analyzeRepo` completes
- THEN snapshot population MUST be skipped
- AND a diagnostic with `kind: "snapshot-skipped"` MUST be emitted
- AND `analyzeRepo` MUST return findings normally

---

### Requirement: Snapshot Population After Persist

After the finding-persist step, the pipeline MUST append one snapshot row per currently persisted finding to the `snapshot` table. The row shape is `(commit_sha, fingerprint, rule_id, severity_raw, evidence_digest, created_at)`.

`created_at` MUST be sourced from the pipeline's `asOf` timestamp. The pipeline MUST NOT use `Date.now()`, `Math.random()`, or any non-deterministic source when computing `created_at` or `evidence_digest`.

Population MUST be idempotent on the PRIMARY KEY `(commit_sha, fingerprint, rule_id)`. Re-analyzing the same commit MUST NOT produce duplicate rows or a constraint error (`INSERT OR REPLACE` or `ON CONFLICT DO UPDATE` semantics).

`evidence_digest` MUST be a stable, deterministic hash of the finding evidence. It is not required to embed raw metric values; those remain in the `finding` rows.

#### Scenario: Idempotent re-analysis

- GIVEN a commit has already been analyzed and snapshot rows exist for it
- WHEN `analyzeRepo` runs again for the same commit
- THEN the `snapshot` table row count for that commit MUST NOT increase
- AND no database constraint error MUST be thrown

#### Scenario: Deterministic replay

- GIVEN `analyzeRepo` is run twice on the same commit with the same findings
- WHEN both runs complete
- THEN the snapshot rows produced by each run MUST be byte-for-byte identical
- AND `created_at` MUST equal the `asOf` value passed to the pipeline

#### Scenario: Snapshot is populated after findings persist

- GIVEN `analyzeRepo` runs and one analyzer returns two findings
- WHEN persist completes
- THEN `snapshot` MUST contain exactly two rows for that `commit_sha` (one per finding)
- AND each row MUST have a non-null `evidence_digest`

---

### Requirement: Snapshot Is a Derived View

The `snapshot` table MUST be treated as a derived materialized view of T3 (finding history). It MUST NOT be human-authored or used as an independent source of truth. It is regenerable from findings and MUST NOT replace or supersede the `finding` table.

#### Scenario: Snapshot does not affect finding integrity

- GIVEN snapshot population runs after findings persist
- WHEN snapshot rows are written
- THEN finding rows MUST remain unchanged
- AND snapshot failures MUST NOT roll back persisted findings

---

## References

- Implementation: `packages/core/src/engine/pipeline.ts`
- Schema: `packages/core/src/db/schema.sql` — `snapshot` table
- Tests: `packages/core/src/engine/pipeline.test.ts`
- Source change: `p4-snapshot-get-drift`
