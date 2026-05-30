# Capability Spec: MCP Tools

**Status**: Active (RFC 2119)  
**Origin**: change `wire-deferred-mvp-gaps` (2026-05-30)  
**Scope**: feedback reason surface in `explainFinding` and explicit `close_session` feedback closure.

## Purpose

Define the durable contract for exposing the latest human feedback reason through MCP explain output and closing MCP analysis sessions with explicit feedback decisions. These surfaces MUST preserve existing feedback write paths and MUST NOT infer verdicts from narrative text.

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

## References

- Implementation: `packages/core/src/mcp/tools.ts`
- Tests: `packages/core/src/mcp/tools.test.ts`
- Source changes: `wire-deferred-mvp-gaps`, `close-session-feedback`
