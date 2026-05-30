# Proposal: Close Session Feedback

## Intent

Close MCP analysis sessions by prompting for explicit feedback decisions on discussed findings, without letting summaries or conversation text become inferred verdicts.

## Scope

### In Scope
- Add stateless `close_session` MCP tool for session closure prompts and explicit decision submission.
- Record T4 feedback only from `decisions[]` entries with explicit verdicts.
- Reuse `FeedbackStore.record()` as the only low-level append path.
- Update MCP tool tests and tool registration tests in future TDD phases.

### Out of Scope
- Durable session-summary or session-event tables.
- LLM-inferred verdict extraction from summaries or chat text.
- New memory reducer, overlay, or feedback schema semantics.
- Agent workflow docs unless required by later phases.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `mcp-tools`: add `close_session` tool contract for closure prompts, explicit feedback decisions, refusal behavior, and no-inference invariant.

## Approach

Use Approach 1 from exploration. Add `Session.closeSession()` and MCP registration for `close_session({ discussed?, summary?, decisions? })`. Without `decisions`, return prompt items from current presented/discussed findings. With `decisions`, record only exact explicit verdicts through `FeedbackStore.record()` and return per-item results. `summary` may provide prompt context or decision reason only when attached to explicit decision data; it never creates verdicts.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/mcp/tools.ts` | Modified | Add stateless close-session helper and presented/discussed resolution. |
| `packages/core/src/mcp/server.ts` | Modified | Register `close_session` schemas and handler. |
| `packages/core/src/memory/feedback-store.ts` | Modified | Reuse existing `record()` path only. |
| `packages/core/src/types.ts` | Modified | Add close-session input/output types if needed. |
| `packages/core/src/mcp/tools.test.ts` | Modified | Cover prompts, explicit writes, skipped unknowns, and no inferred verdicts. |
| `packages/core/src/mcp/server.test.ts` | Modified | Assert tool registration. |
| `openspec/specs/mcp-tools.md` | Modified | Add close-session requirements in delta spec. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplicate feedback from repeated confirmations | Med | Return clear per-decision results; defer idempotency key. |
| Tool name implies durable lifecycle | Med | Specify stateless closure helper, not session persistence. |
| Summary-only text becomes memory | Low | Require explicit verdict before any T4 write. |

## Rollback Plan

Remove `close_session` registration, helper/types, and tests. No database rollback is required because no schema change is in scope.

## Dependencies

- Existing `record_feedback` semantics and `FeedbackStore.record()` behavior.
- Existing in-memory `Session.lastPresented` state.

## Success Criteria

- [ ] `close_session` returns prompt items without feedback writes when `decisions` is absent.
- [ ] Explicit `decisions[]` records feedback through `FeedbackStore.record()` only.
- [ ] Summary-only or ambiguous text creates no T4 event.
- [ ] Unknown fingerprints are refused or skipped, never invented.
- [ ] MCP tool list includes `close_session`.
