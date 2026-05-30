## Exploration: close-session-feedback

### Current State
RAI currently has a short-lived `Session` in `packages/core/src/mcp/tools.ts` with `lastPresented: PresentedFinding[]` populated by `analyzeRepo()`. `findSharedOpportunities()` and `explainFinding()` read only this in-memory set, so there is no durable session lifecycle or per-finding discussion tracking yet.

MCP exposes `analyze_repo`, `find_shared_opportunities`, `explain_finding`, and `record_feedback` in `packages/core/src/mcp/server.ts`. `record_feedback` is the only memory write path. It appends T4 `feedback_event` rows via `FeedbackStore.record()` and enforces phantom-fingerprint refusal plus agent self-loop refusal.

T4/T5 already support the feedback model needed for this change: `packages/core/src/db/schema.sql` has append-only `feedback_event`; `packages/core/src/memory/reducer.ts` maps `accept|confirm` to amplify and `reject|wontfix|dismiss` to suppress with source credibility (`human=1.0`, `agent=0.3`) and explicit `asOf`; `packages/core/src/memory/overlay.ts` applies weights as read-time presentation only. C2 already made feedback `reason` visible through `explainFinding().memory.lastReason`.

Docs identify this as the critical gap: `docs/gaps.md` §6 says implicit conversational decisions are never captured, but automatic LLM verdict inference would break the integrity model. Recommended solution is a `close_session` MCP tool that prompts for explicit human verdicts at session end. `docs/superpowers/specs/...mcp-design.md` §3.6/§5.3 confirms feedback must append T4 only, never mutate findings. `docs/future-ideas.md` §9 highlights Engram-style narrative session context, but RAI must keep structured verdicts explicit and auditable.

### Affected Areas
- `packages/core/src/mcp/tools.ts` — add `Session.closeSession()` and track discussed/presented finding metadata from current `lastPresented`.
- `packages/core/src/mcp/server.ts` — register `close_session` MCP tool with schemas for discussed fingerprints, optional summary, and explicit confirmed decisions.
- `packages/core/src/memory/feedback-store.ts` — reuse `record()` for verdict writes; avoid adding another T4 writer.
- `packages/core/src/types.ts` — likely add close-session input/output types and decision metadata types.
- `packages/core/src/db/schema.sql` — no required T4 schema change for verdicts; optional session-summary storage would require a new append-only table if summaries must persist beyond tool response.
- `packages/core/src/mcp/tools.test.ts` — unit tests for prompt output, explicit-decision writes, skip behavior, unknown discussed fingerprints, and no inferred verdicts.
- `packages/core/src/mcp/server.test.ts` — tool registration must include `close_session`.
- `openspec/specs/mcp-tools.md` / future delta spec — define close-session contract and inference lock.
- Agent guidance (`AGENTS.md` or docs) — future phase can document when agents call `close_session`, but not needed in core tests.

### Approaches
1. **Stateless close-session prompt + explicit decisions** — `close_session({ discussed?, summary?, decisions? })` resolves discussed fingerprints against `lastPresented`, returns prompt items, and records only entries present in `decisions[]` with explicit `verdict`.
   - Pros: preserves `record_feedback` as sole T4 writer by delegating to `FeedbackStore.record()`; no DB migration; directly fits docs/gaps.md §6; small TDD surface; lets LLM summarize session text without authoring verdicts.
   - Cons: session summary is response-only unless added as `reason` on explicit decisions; discussed state is in-memory and lost across process restart.
   - Effort: Medium.

2. **Durable session log table + close-session reducer** — add append-only `session_event`/`session_summary` rows for presented/discussed/summary metadata; `close_session` reads that log and appends T4 only for explicit decisions.
   - Pros: durable lifecycle; supports future “show decisions from session” UX and richer audit trails.
   - Cons: new writer/store and schema migration risk; bigger design surface; easy to blur boundary between narrative summary and feedback verdicts; overbuilt for current MCP-only gap.
   - Effort: High.

3. **LLM-assisted implicit verdict extraction** — accept conversation summary and let the agent/tool infer `accept|reject|wontfix|dismiss`.
   - Pros: lowest user friction.
   - Cons: explicitly violates docs/gaps.md §6 and integrity model; creates non-auditable T4 events; LLM may convert “not now” into wrong verdict.
   - Effort: Low technically, unacceptable architecturally.

### Recommendation
Choose Approach 1 for C7: implement `close_session` as a stateless MCP closure helper that may summarize discussed findings but records T4 only from explicit `decisions[]` verdicts. Keep `FeedbackStore.record()` as the only low-level append path and call it internally rather than inserting into `feedback_event` elsewhere.

Contract shape should separate prompt generation from confirmation in one idempotent API: without `decisions`, return `items[]` and `question`; with `decisions`, record only those exact verdicts and return per-item `{accepted, refusedReason?}`. `summary` may be accepted as text for prompt context or copied into `reason` only when attached to an explicit decision; it must never be parsed into a verdict.

Strict TDD path for future apply:
1. RED `tools.test.ts`: `closeSession` returns prompt items for current `lastPresented` and includes no feedback writes.
2. RED: explicit `decisions[{fingerprint, ruleId, verdict, reason}]` records human feedback and suppresses on re-analysis.
3. RED: summary-only input creates no T4 event.
4. RED: ambiguous/no-verdict text cannot create feedback.
5. RED: unknown discussed fingerprint is skipped/refused, not invented.
6. RED `server.test.ts`: MCP tool list includes `close_session`.
7. GREEN with minimal Session/server code, then typecheck/test.

### Risks
- Duplicate feedback on repeated `close_session` confirmations. Mitigate by returning event results clearly; do not auto-dedupe unless a future idempotency key is specified.
- Tool name suggests durable session lifecycle, but current `Session` is process memory only. Document C7 as closure helper, not full session persistence.
- If `summary` is stored in `reason` without explicit verdict, T4 becomes narrative memory instead of feedback. Prohibit summary-only writes.
- `source: "human"` can be spoofed by MCP caller. This is already true for `record_feedback`; C7 should not weaken it further.

### Ready for Proposal
Yes — propose C7 as a focused MCP/memory-loop change: add `close_session` prompt/confirmation flow, keep T4 append-only through existing feedback store, forbid LLM-inferred verdicts, and defer durable session-summary storage to a later change unless proposal explicitly scopes a new append-only session table.
