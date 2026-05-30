# Delta for MCP Tools

**Change**: `p4-snapshot-get-drift` (Slice 1b)
**Status**: Active (RFC 2119)
**Base spec**: `openspec/specs/mcp-tools.md`

---

## ADDED Requirements

### Requirement: get_drift Tool Registration

The MCP server MUST expose `get_drift` as a registered tool. The tool MUST accept `{ baseCommit: string; headCommit?: string; ruleId?: string; fingerprint?: string }`. `headCommit` defaults to the most recent analyzed commit when omitted.

#### Scenario: Tool is listed

- GIVEN an MCP server starts normally
- WHEN the client requests the available tools
- THEN `get_drift` MUST be present in the tool list

---

### Requirement: get_drift Is Read-Only

`get_drift` MUST be a pure read over the persisted `snapshot` index. It MUST NOT trigger `analyzeRepo`, live graph traversal, or any write operation. This is an absolute prohibition — no exception path may cause analysis as a side effect.

#### Scenario: get_drift does not trigger analysis

- GIVEN a valid `baseCommit` is known in the snapshot table
- WHEN `get_drift` is called
- THEN no analysis MUST run
- AND no findings, snapshot rows, or feedback records MUST be written

---

### Requirement: get_drift Set-Algebra Results

For two known commits, `get_drift` MUST return a diff of their snapshot sets using the following rules:

- `added`: fingerprints present in `headCommit` snapshot and absent in `baseCommit` snapshot.
- `removed`: fingerprints present in `baseCommit` snapshot and absent in `headCommit` snapshot.
- `persisted`: fingerprints present in both snapshots; each entry MUST carry a stability signal:
  - `"changed"` when `evidence_digest` differs between the two commits.
  - `"stable"` when `evidence_digest` is identical.

Optional filters `ruleId` and `fingerprint` MUST narrow the result set without changing the algebra semantics.

The `changed` signal is the required contract. Surfacing before/after metric values (e.g. fanIn 3→9) is an implementation sub-decision and is NOT required by this spec.

#### Scenario: Added finding detected

- GIVEN `baseCommit` snapshot has fingerprints `{A, B}` and `headCommit` snapshot has `{A, B, C}`
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `added` MUST contain fingerprint `C`
- AND `removed` MUST be empty

#### Scenario: Removed finding detected

- GIVEN `baseCommit` snapshot has `{A, B}` and `headCommit` snapshot has `{A}`
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `removed` MUST contain fingerprint `B`
- AND `added` MUST be empty

#### Scenario: Evidence digest change surfaces as changed

- GIVEN fingerprint `A` exists in both snapshots with differing `evidence_digest` values
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `persisted` MUST contain fingerprint `A` with stability `"changed"`

#### Scenario: Identical evidence digest surfaces as stable

- GIVEN fingerprint `A` exists in both snapshots with identical `evidence_digest`
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `persisted` MUST contain fingerprint `A` with stability `"stable"`

#### Scenario: ruleId filter narrows results

- GIVEN both snapshots contain fingerprints for rule `react/render-coupling` and `react/over-abstraction`
- WHEN `get_drift({ baseCommit, headCommit, ruleId: "react/render-coupling" })` is called
- THEN only findings with `rule_id = "react/render-coupling"` MUST appear in any result set

---

### Requirement: get_drift Cold-Start — Unknown Commit

If either `baseCommit` or `headCommit` is not present in the `snapshot` table (never analyzed), `get_drift` MUST refuse the request and return a structured refusal object. It MUST NOT fall back to analysis, return empty deltas, or throw an unhandled error.

Refusal shape:
```
{ status: "unknown_commit", commit: "<the unknown sha>", message: "run analyze_repo({commit}) to backfill" }
```

#### Scenario: Unknown base commit is refused

- GIVEN `baseCommit` was never analyzed and has no snapshot rows
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN the response MUST have `status: "unknown_commit"`
- AND `commit` MUST identify the unknown SHA
- AND no analysis MUST be triggered

#### Scenario: Unknown head commit is refused

- GIVEN `headCommit` was never analyzed and has no snapshot rows
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN the response MUST have `status: "unknown_commit"`
- AND `commit` MUST identify the head SHA as the unknown commit

---

### Requirement: get_drift Cold-Start — Insufficient History

If both requested commits are present in the snapshot table but fewer than 2 distinct snapshots exist to compare (e.g. only one commit has ever been analyzed), `get_drift` MUST return an explicit insufficient-history response. It MUST NOT return empty deltas that could be mistaken for a clean state.

Response shape:
```
{
  status: "insufficient_history",
  snapshotCount: <number of distinct analyzed commits>,
  requiredSnapshots: 2,
  added: [],
  removed: [],
  message: "No historical snapshots available yet. Run analysis on at least two commits."
}
```

#### Scenario: Only one commit analyzed

- GIVEN exactly one commit has ever been analyzed and has snapshot rows
- WHEN `get_drift` is called referencing that commit as `baseCommit`
- THEN the response MUST have `status: "insufficient_history"`
- AND `snapshotCount` MUST be `1`
- AND `requiredSnapshots` MUST be `2`
- AND `added` and `removed` MUST both be empty arrays

---

### Requirement: get_drift Does Not Expose Internal Errors as Empty Deltas

`get_drift` MUST NOT return `{ added: [], removed: [] }` (or equivalent) in any case where the real answer is unknown. Every no-data response MUST carry an explicit status (`unknown_commit` or `insufficient_history`) that distinguishes "no findings changed" from "cannot determine".

#### Scenario: Unknown state is never silent-clean

- GIVEN fewer than 2 snapshots exist
- WHEN `get_drift` is called
- THEN the response MUST NOT have `status: "ok"` or equivalent with empty arrays only
- AND a named status MUST distinguish the case from a genuine clean drift

---

## References

- Implementation: `packages/core/src/mcp/tools.ts`
- Schema: `packages/core/src/db/schema.sql` — `snapshot` table
- Design: `docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md` §3.5, §5.2 (line 685)
- Cold-start decision: Engram `sdd/p4-breadth-temporal/drift-coldstart-decision`
- Tests: `packages/core/src/mcp/tools.test.ts`
- Source change: `p4-snapshot-get-drift`
