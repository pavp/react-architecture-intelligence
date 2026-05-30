# Capability Spec: MCP Tools

**Status**: Active (RFC 2119)  
**Origin**: changes `wire-deferred-mvp-gaps`, `close-session-feedback`, `analyzer-fault-containment`, `p4-snapshot-get-drift`, `p4-query-architecture`, `p5-propose-refactor` (2026-05-30)
**Scope**: MCP tool contracts for analyze diagnostics, feedback closure, temporal drift, bounded graph questions, and proposal-only refactor suggestions.

## Purpose

Define durable MCP tool contracts. These surfaces MUST preserve existing feedback write paths, MUST NOT infer verdicts from narrative text, and MUST answer graph or drift questions only from available deterministic data.

## `lastReason` Contract

`Session.explainFinding()` MUST include `memory.lastReason` in its returned memory object.

`lastReason` MUST equal the `reason` string from the most recent feedback event, in `feedback.eventsFor()` order, where `reason !== null`.

If no feedback events exist, or all feedback events have `reason === null`, `lastReason` MUST be `null`.

## Data Source Rules

`lastReason` MUST be sourced from `feedback.eventsFor()` return data only. This capability MUST NOT require:

- an extra database query
- an LLM call
- a new MCP server output schema
- finding mutation

## Integrity Invariants

- Feedback metadata is read-only during explain.
- `lastReason` is a presentation field, not a finding field.
- `lastReason` MUST NOT alter feedback verdicts or finding data.
- JSON serialization may include the field through the existing response object.

## `analyze_repo` Diagnostic Metadata Contract

### Requirement: analyze_repo Diagnostic Summary

`analyze_repo` MUST expose analyzer diagnostics from repository analysis as non-finding metadata. The response MUST include diagnostic counts and details sufficient to identify failed analyzer rules without leaking finding bodies.

#### Scenario: Partial failure is reported without findings leakage

- GIVEN repository analysis contains one analyzer diagnostic
- WHEN `analyze_repo` returns
- THEN the response MUST include diagnostic count and detail entries
- AND diagnostic details MUST NOT include finding bodies or evidence payloads

#### Scenario: Diagnostics are not feedback targets

- GIVEN `analyze_repo` returns diagnostics
- WHEN a client reviews returned items
- THEN diagnostics MUST NOT be represented as findings
- AND diagnostics MUST NOT become valid feedback targets for `close_session` or other feedback tools

### Requirement: analyze_repo Diagnostic Integrity Boundary

`analyze_repo` MUST preserve the existing integrity model: diagnostics are runtime metadata, not CODE-derived findings. Diagnostics MUST NOT create T3 findings, memory reducer inputs, overlay entries, or feedback records.

#### Scenario: Diagnostics do not affect persistence or memory semantics

- GIVEN one analyzer fails and another analyzer returns findings
- WHEN `analyze_repo` completes
- THEN successful findings MUST remain available through existing result semantics
- AND diagnostics MUST remain separate from findings, memory, overlay, and feedback semantics

## Scenarios Covered

| Scenario | Expected result |
|----------|-----------------|
| latest non-null feedback reason exists | `memory.lastReason` equals that reason |
| older reason exists but later null event exists | `memory.lastReason` remains the older non-null reason |
| no feedback exists | `memory.lastReason` is `null` |
| all feedback reasons are null | `memory.lastReason` is `null` |

## `close_session` Contract

### Requirement: close_session Tool Registration

MCP tool registration MUST expose `close_session` as an available tool. The tool MUST be a stateless closure helper for the current in-memory MCP session and MUST NOT create durable lifecycle logs, session-summary tables, or session-event records.

#### Scenario: Tool is listed

- GIVEN an MCP server starts normally
- WHEN the client requests the available tools
- THEN `close_session` MUST be present in the tool list

#### Scenario: No durable session lifecycle

- GIVEN `close_session` is called with any valid input
- WHEN the call completes
- THEN no session lifecycle or summary storage MUST be created
- AND no schema/table change MUST be required

### Requirement: close_session Prompt Mode

When `close_session` is called without `decisions`, the system MUST return closure prompt data for currently presented or explicitly discussed findings. It MUST NOT write feedback, infer verdicts, or change memory reducer/overlay semantics.

#### Scenario: Prompt current findings

- GIVEN findings were presented in the current session
- WHEN `close_session` is called without `decisions`
- THEN the response MUST include prompt items for current presented or discussed findings
- AND no T4 feedback event MUST be created

#### Scenario: Summary-only prompt input

- GIVEN `summary` text describes the session but `decisions` is absent
- WHEN `close_session` is called
- THEN the response MAY use the text as prompt context
- AND feedback MUST NOT be recorded from that text

### Requirement: close_session Explicit Decision Recording

When `close_session` includes `decisions[]`, the system MUST record feedback only for exact entries that include an explicit verdict for a known current finding. Accepted decisions MUST use the existing feedback record path. Summary text MAY become a reason only when attached to an explicit decision.

#### Scenario: Explicit verdict records feedback

- GIVEN a decision references a known current finding with an explicit verdict
- WHEN `close_session` is called with that `decisions[]` entry
- THEN one feedback result MUST be returned for that entry
- AND feedback MUST be recorded through the existing feedback record path

#### Scenario: Ambiguous text is ignored

- GIVEN `summary` or decision text lacks an explicit verdict
- WHEN `close_session` is called
- THEN no T4 feedback event MUST be created for that text
- AND no LLM-inferred verdict MUST be used

#### Scenario: Unknown fingerprint is refused

- GIVEN a decision references an unknown fingerprint
- WHEN `close_session` is called with that decision
- THEN that decision MUST be refused or skipped with a per-item result
- AND the system MUST NOT invent a finding or write feedback for it

### Requirement: close_session Integrity Boundaries

`close_session` MUST NOT add schema/table changes, MUST NOT change memory reducer semantics, and MUST NOT change overlay semantics. It MUST preserve the existing integrity direction: code findings plus explicit feedback feed memory; narrative summaries never become verdicts.

#### Scenario: Existing memory semantics remain unchanged

- GIVEN feedback was recorded through `close_session`
- WHEN memory reduction and overlay presentation run
- THEN they MUST apply existing feedback semantics unchanged
- AND `close_session` MUST NOT introduce new reducer or overlay rules

## Requirement: get_drift Tool Registration

The MCP server MUST expose `get_drift` as a registered tool. The tool MUST accept `{ baseCommit: string; headCommit?: string; ruleId?: string; fingerprint?: string }`. `headCommit` defaults to the most recent analyzed commit when omitted.

### Scenario: Tool is listed

- GIVEN an MCP server starts normally
- WHEN the client requests the available tools
- THEN `get_drift` MUST be present in the tool list

## Requirement: get_drift Is Read-Only

`get_drift` MUST be a pure read over the persisted `snapshot` index. It MUST NOT trigger `analyzeRepo`, live graph traversal, or any write operation. This is an absolute prohibition — no exception path may cause analysis as a side effect.

### Scenario: get_drift does not trigger analysis

- GIVEN a valid `baseCommit` is known in the snapshot table
- WHEN `get_drift` is called
- THEN no analysis MUST run
- AND no findings, snapshot rows, or feedback records MUST be written

## Requirement: get_drift Set-Algebra Results

For two known commits, `get_drift` MUST return a diff of their snapshot sets using the following rules:

- `added`: fingerprints present in `headCommit` snapshot and absent in `baseCommit` snapshot.
- `removed`: fingerprints present in `baseCommit` snapshot and absent in `headCommit` snapshot.
- `persisted`: fingerprints present in both snapshots; each entry MUST carry a stability signal:
  - `"changed"` when `evidence_digest` differs between the two commits.
  - `"stable"` when `evidence_digest` is identical.

Optional filters `ruleId` and `fingerprint` MUST narrow the result set without changing the algebra semantics.

The `changed` signal is the required contract. Surfacing before/after metric values (e.g. fanIn 3→9) is an implementation sub-decision and is NOT required by this spec.

### Scenario: Added finding detected

- GIVEN `baseCommit` snapshot has fingerprints `{A, B}` and `headCommit` snapshot has `{A, B, C}`
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `added` MUST contain fingerprint `C`
- AND `removed` MUST be empty

### Scenario: Removed finding detected

- GIVEN `baseCommit` snapshot has `{A, B}` and `headCommit` snapshot has `{A}`
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `removed` MUST contain fingerprint `B`
- AND `added` MUST be empty

### Scenario: Evidence digest change surfaces as changed

- GIVEN fingerprint `A` exists in both snapshots with differing `evidence_digest` values
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `persisted` MUST contain fingerprint `A` with stability `"changed"`

### Scenario: Identical evidence digest surfaces as stable

- GIVEN fingerprint `A` exists in both snapshots with identical `evidence_digest`
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN `persisted` MUST contain fingerprint `A` with stability `"stable"`

### Scenario: ruleId filter narrows results

- GIVEN both snapshots contain fingerprints for rule `react/render-coupling` and `react/over-abstraction`
- WHEN `get_drift({ baseCommit, headCommit, ruleId: "react/render-coupling" })` is called
- THEN only findings with `rule_id = "react/render-coupling"` MUST appear in any result set

## Requirement: get_drift Cold-Start — Unknown Commit

If either `baseCommit` or `headCommit` is not present in the `snapshot` table (never analyzed), `get_drift` MUST refuse the request and return a structured refusal object. It MUST NOT fall back to analysis, return empty deltas, or throw an unhandled error.

Refusal shape:
```
{ status: "unknown_commit", commit: "<the unknown sha>", message: "run analyze_repo({commit}) to backfill" }
```

### Scenario: Unknown base commit is refused

- GIVEN `baseCommit` was never analyzed and has no snapshot rows
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN the response MUST have `status: "unknown_commit"`
- AND `commit` MUST identify the unknown SHA
- AND no analysis MUST be triggered

### Scenario: Unknown head commit is refused

- GIVEN `headCommit` was never analyzed and has no snapshot rows
- WHEN `get_drift({ baseCommit, headCommit })` is called
- THEN the response MUST have `status: "unknown_commit"`
- AND `commit` MUST identify the head SHA as the unknown commit

## Requirement: get_drift Cold-Start — Insufficient History

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

### Scenario: Only one commit analyzed

- GIVEN exactly one commit has ever been analyzed and has snapshot rows
- WHEN `get_drift` is called referencing that commit as `baseCommit`
- THEN the response MUST have `status: "insufficient_history"`
- AND `snapshotCount` MUST be `1`
- AND `requiredSnapshots` MUST be `2`
- AND `added` and `removed` MUST both be empty arrays

## Requirement: get_drift Does Not Expose Internal Errors as Empty Deltas

`get_drift` MUST NOT return `{ added: [], removed: [] }` (or equivalent) in any case where the real answer is unknown. Every no-data response MUST carry an explicit status (`unknown_commit` or `insufficient_history`) that distinguishes "no findings changed" from "cannot determine".

### Scenario: Unknown state is never silent-clean

- GIVEN fewer than 2 snapshots exist
- WHEN `get_drift` is called
- THEN the response MUST NOT have `status: "ok"` or equivalent with empty arrays only
- AND a named status MUST distinguish the case from a genuine clean drift

## Requirement: query_architecture Tool Registration

The MCP server MUST expose `query_architecture` as a registered tool. The tool MUST accept `{ question: string; target: string; depth?: number }` and return structured graph answers with `answer`, `nodes`, and `edges` fields when successful.

### Scenario: Tool is listed

- GIVEN an MCP server starts normally
- WHEN the client requests the available tools
- THEN `query_architecture` MUST be present in the tool list

## Requirement: query_architecture Supported Questions

`query_architecture` MUST answer only enumerated questions backed by currently constructed graph facts. This capability version supports `renders`, `rendered-by`, `fan-in`, `fan-out`, and `reachability` over `renders` edges from the latest analyzed `RepoGraph`.

Unsupported questions MUST return `{ status: "unknown_question", question, validQuestions }` and MUST NOT fall back to free-form traversal, import inference, hook inference, or analysis execution.

### Scenario: Unknown question is refused

- GIVEN a client asks `query_architecture` with an unsupported question
- WHEN the tool runs
- THEN the response MUST have `status: "unknown_question"`
- AND `validQuestions` MUST list the supported question enum

## Requirement: query_architecture Requires Current Graph Context

`query_architecture` MUST answer from the most recent in-memory graph produced by `analyze_repo`. If no analysis has run in the current session, it MUST return `{ status: "no_analysis", message }`. It MUST NOT trigger analysis as a side effect.

If `target` does not match a component id or component name in the latest graph, the tool MUST return `{ status: "unknown_target", target }`.

### Scenario: No prior analysis is explicit

- GIVEN no `analyze_repo` call has populated the current session graph
- WHEN `query_architecture` is called
- THEN the response MUST have `status: "no_analysis"`
- AND no analysis MUST be triggered

### Scenario: Unknown target is explicit

- GIVEN a latest analyzed graph exists
- WHEN `query_architecture` references a target absent from the graph
- THEN the response MUST have `status: "unknown_target"`

## Requirement: query_architecture Bounded Graph Answers

All `query_architecture` traversal MUST be bounded. `renders`, `rendered-by`, `fan-in`, and `fan-out` MUST inspect only direct `renders` edges for the target component. `reachability` MUST walk only outgoing `renders` edges up to a bounded depth, cap requested depth at an implementation maximum, and avoid revisiting nodes.

### Scenario: Direct render children are returned

- GIVEN the latest graph has `Page -> Card` and `Page -> Sidebar` `renders` edges
- WHEN `query_architecture({ question: "renders", target: "Page" })` runs
- THEN `answer.children` MUST include `Card` and `Sidebar`
- AND returned `edges` MUST include only matching `renders` edges

### Scenario: Fan-in counts incoming render edges

- GIVEN the latest graph has two parents rendering `Leaf`
- WHEN `query_architecture({ question: "fan-in", target: "Leaf" })` runs
- THEN `answer.count` MUST be `2`

### Scenario: Reachability respects depth bound

- GIVEN a render chain extends beyond depth 1
- WHEN `query_architecture({ question: "reachability", target, depth: 1 })` runs
- THEN results MUST include only nodes reachable within one render hop

## Requirement: propose_refactor Tool Registration

The MCP server MUST expose `propose_refactor` as a registered tool. The tool MUST accept `{ fingerprint: string }` and return a deterministic proposal or structured refusal.

### Scenario: Tool is listed

- GIVEN an MCP server starts normally
- WHEN the client requests the available tools
- THEN `propose_refactor` MUST be present in the tool list

## Requirement: propose_refactor Is Proposal-Only

`propose_refactor` MUST NOT write files, stage files, commit, record feedback, create codemod proof rows, or mutate analysis history. It MAY only read the current in-memory presented finding set and return proposal data.

### Scenario: Proposal creates no writes

- GIVEN a current `react/shared-extraction` opportunity finding exists
- WHEN `propose_refactor({ fingerprint })` runs
- THEN the response MUST have `status: "ok"`
- AND the response MUST include `writeMode: "proposal-only"`
- AND no feedback, finding, snapshot, or file write MUST occur

## Requirement: propose_refactor Current Finding Refusals

`propose_refactor` MUST only act on findings currently present in the session's last analysis result. Unknown current fingerprints MUST return `{ status: "refused", reason: "unknown-current-finding" }`. Suppressed findings MUST return `{ status: "refused", reason: "suppressed-finding" }`.

Unsupported rules MUST return `{ status: "refused", reason: "unsupported-rule" }`. Architectural conflicts MUST return `{ status: "refused", reason: "conflict-not-executable" }`.

### Scenario: Unknown fingerprint is refused

- GIVEN the current session has no presented finding for a fingerprint
- WHEN `propose_refactor({ fingerprint })` runs
- THEN the response MUST have `status: "refused"`
- AND `reason` MUST be `"unknown-current-finding"`

### Scenario: Suppressed finding is refused

- GIVEN a current finding is suppressed by memory overlay
- WHEN `propose_refactor({ fingerprint })` runs
- THEN the response MUST have `status: "refused"`
- AND `reason` MUST be `"suppressed-finding"`

## Requirement: propose_refactor Shared-Extraction Proposal Shape

For supported `react/shared-extraction` opportunities, `propose_refactor` MUST return structured data sufficient for review without executing a codemod. The response MUST include the originating fingerprint, rule id, source instances, component name candidate, variance parameters, shared props, risk classification, and `writeMode: "proposal-only"`.

Risk classification MUST surface export and source-shape risks available from evidence: default exports, named exports, invalid spans, unsafe variance parameter names, and duplicate source files.

## References

- Implementation: `packages/core/src/mcp/tools.ts`, `packages/core/src/mcp/server.ts`
- Tests: `packages/core/src/mcp/tools.test.ts`, `packages/core/src/mcp/server.test.ts`
- Source changes: `wire-deferred-mvp-gaps`, `close-session-feedback`, `analyzer-fault-containment`, `p4-snapshot-get-drift`, `p4-query-architecture`, `p5-propose-refactor`
