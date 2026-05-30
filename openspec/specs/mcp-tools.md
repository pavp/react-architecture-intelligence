# Capability Spec: MCP Tools

**Status**: Active (RFC 2119)  
**Origin**: change `wire-deferred-mvp-gaps` (2026-05-30)  
**Scope**: feedback reason surface in `explainFinding`.

## Purpose

Define the durable contract for exposing the latest human feedback reason through MCP explain output. This surface is metadata-only and MUST NOT create a new write path.

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

## References

- Implementation: `packages/core/src/mcp/tools.ts`
- Tests: `packages/core/src/mcp/tools.test.ts`
- Source change: `wire-deferred-mvp-gaps`
