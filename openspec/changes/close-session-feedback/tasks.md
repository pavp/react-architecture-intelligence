# Tasks: Close Session Feedback

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-280 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add `close_session` tests, helper, schema, handler | PR 1 | Keep within four scoped files; no chained PR needed. |

## Phase 1: RED — Session Prompt Contract

- [ ] 1.1 Add failing `packages/core/src/mcp/tools.test.ts` case: `closeSession({})` returns current `lastPresented` prompt items and `eventCount === 0`.
- [ ] 1.2 Add failing `packages/core/src/mcp/tools.test.ts` case: `closeSession({ summary })` may return prompt context but writes no T4 feedback.

## Phase 2: GREEN — Prompt Implementation

- [ ] 2.1 Add exported local `CloseSessionDecision`, `CloseSessionInput`, and `CloseSessionResult` interfaces in `packages/core/src/mcp/tools.ts`; do not edit `types.ts`.
- [ ] 2.2 Add minimal `Session.closeSession(input)` prompt path using `lastPresented`, optional known `discussed` filtering, stable question text, and empty results.
- [ ] 2.3 Run targeted tests for prompt cases; keep schema, reducer, overlay, and durable session storage untouched.

## Phase 3: RED — Explicit Decision Boundaries

- [ ] 3.1 Add failing explicit-write test in `packages/core/src/mcp/tools.test.ts`: known `{ fingerprint, ruleId, verdict }` returns `accepted: true` and records through existing feedback path.
- [ ] 3.2 Add failing unknown-refusal test: phantom fingerprint returns `accepted: false` with `refusedReason` and writes no feedback.
- [ ] 3.3 Add failing ambiguous/no-inference test: summary or freeform text without explicit `decisions[]` creates no T4 event.

## Phase 4: GREEN — Decision Implementation

- [ ] 4.1 Extend `Session.closeSession(input)` to validate each decision against current `lastPresented` by fingerprint and ruleId.
- [ ] 4.2 For accepted decisions, call existing `FeedbackStore.record()` path with `source: "human"`, explicit verdict, optional per-decision reason, and `asOf`.
- [ ] 4.3 Return per-decision results; refuse unknown or mismatched findings without inventing metadata or writing feedback.
- [ ] 4.4 Run targeted tests after each GREEN step to preserve strict TDD.

## Phase 5: RED/GREEN — MCP Registration

- [ ] 5.1 Add failing `packages/core/src/mcp/server.test.ts` assertion that tool list includes `close_session`.
- [ ] 5.2 Register `close_session` in `packages/core/src/mcp/server.ts` with Zod schema for `discussed`, `summary`, and explicit verdict `decisions[]`.
- [ ] 5.3 Wire handler to `session.closeSession({ ...input, asOf: now() })` and JSON-serialize result like existing MCP tools.

## Phase 6: REFACTOR / Verify

- [ ] 6.1 Refactor only duplicated close-session lookup/result shaping in `packages/core/src/mcp/tools.ts`; avoid new files.
- [ ] 6.2 Run `pnpm test` and `pnpm typecheck`; ensure no `schema.sql`, `types.ts`, reducer, or overlay diff exists.
