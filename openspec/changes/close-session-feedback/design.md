# Design: Close Session Feedback

## Technical Approach

Add `close_session` as a stateless MCP helper over existing `Session.lastPresented`. Prompt mode resolves current findings and writes nothing. Decision mode records only explicit `decisions[]` entries by calling `FeedbackStore.record()` through `Session.recordFeedback`-equivalent logic. No schema, reducer, overlay, or durable session lifecycle changes.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Session model | Keep closure stateless; use current `lastPresented` only. | Add session table/log. | Spec forbids durable lifecycle storage; current MCP tools already operate on in-memory presented findings. |
| Write path | Call `this.feedback.record({ source: "human", ... })` for accepted explicit decisions. | Insert T4 rows directly; create new writer. | `FeedbackStore.record()` already enforces phantom/self-loop guards and is documented as sole T4 write path. |
| Summary handling | Accept `summary` as response context only; never write it. `decision.reason` is only per-decision reason. | Copy global summary into feedback reason; infer verdicts from text. | Prevents narrative memory from becoming feedback and preserves explicit human verdict invariant. |
| Unknown fingerprints | Return per-item refusal with `accepted: false` and reason. | Invent finding metadata; silently drop. | Caller needs auditability; integrity model requires observed findings only. |
| Types | Keep close-session types local/exported from `mcp/tools.ts`; do not edit `types.ts`. | Add domain types to `types.ts`. | Existing MCP method inputs are local inline contracts; `types.ts` holds core parser/finding/memory domain types. |

## Data Flow

Prompt mode:

    MCP close_session ──→ Session.closeSession
                         └── lastPresented filter ──→ prompt items + question

Decision mode:

    MCP close_session(decisions[]) ──→ Session.closeSession
                                    ├── verify fingerprint in lastPresented
                                    └── FeedbackStore.record() ──→ T4 feedback_event

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/mcp/tools.ts` | Modify | Add local close-session interfaces and `Session.closeSession(input)`. |
| `packages/core/src/mcp/server.ts` | Modify | Register `close_session` Zod schema and handler. |
| `packages/core/src/mcp/tools.test.ts` | Modify | Add RED tests for prompt/no-write, explicit write, summary no-write, ambiguous no-write, unknown refusal. |
| `packages/core/src/mcp/server.test.ts` | Modify | Add `close_session` to expected tool names. |
| `packages/core/src/types.ts` | No change | Keep domain types clean; local MCP contract stays with tools. |
| `packages/core/src/db/schema.sql` | No change | No durable session table or feedback schema change. |

## Interfaces / Contracts

```ts
type CloseSessionDecision = {
  fingerprint: string;
  ruleId: string;
  verdict: Verdict;
  reason?: string | undefined;
};

type CloseSessionInput = {
  discussed?: string[] | undefined;
  summary?: string | undefined;
  decisions?: CloseSessionDecision[] | undefined;
  asOf?: number | undefined;
};

type CloseSessionResult = {
  items: { fingerprint: string; ruleId: string; type: FindingType; severity: Severity; status: PresentedStatus }[];
  question: string;
  results: { fingerprint: string; ruleId: string; accepted: boolean; refusedReason?: string }[];
};
```

`Session.closeSession(input: CloseSessionInput): CloseSessionResult` returns items from `discussed` fingerprints when provided, otherwise all `lastPresented`. Unknown `discussed` fingerprints appear as refused results only if submitted in `decisions`; prompt mode filters to known current findings. Decisions missing `verdict` are impossible through TypeScript/Zod; malformed MCP input is rejected by Zod before `Session`.

MCP schema:

```ts
{
  discussed: z.array(z.string()).optional(),
  summary: z.string().optional(),
  decisions: z.array(z.object({
    fingerprint: z.string(),
    ruleId: z.string(),
    verdict: z.enum(["accept", "reject", "wontfix", "confirm", "dismiss"]),
    reason: z.string().optional(),
  })).optional(),
}
```

Handler passes `asOf: now()` and JSON serializes result like existing MCP tools.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Prompt mode returns current finding items and no feedback writes. | RED: analyze, close without decisions, then `explainFinding(fp).memory.eventCount === 0`. |
| Unit | Explicit decision records feedback. | RED: close with known `{fingerprint, ruleId, verdict:"reject"}`, assert result accepted and later re-analysis suppresses or `eventCount === 1`. |
| Unit | Summary-only / ambiguous text writes nothing. | RED: call with `summary` and no decisions, assert `eventCount === 0`; no API field accepts freeform verdict text. |
| Unit | Unknown fingerprint refused. | RED: close with decision for `phantom`, assert per-item `accepted:false` and `refusedReason`; known finding `eventCount` remains unchanged. |
| Integration | MCP tool registration. | RED: `server.test.ts` expects `toolNames` contains `close_session`. |

Strict TDD sequence: add one failing test at a time in order above, implement minimum code after each RED, then run `pnpm test` and `pnpm typecheck` before verify.

## Migration / Rollout

No migration required. Rollback removes `close_session` registration, `Session.closeSession`, and tests; existing T4 data remains valid.

## Open Questions

None.
