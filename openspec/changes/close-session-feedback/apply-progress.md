# Apply Progress: Close Session Feedback

## Mode

Strict TDD.

## Completed Tasks

- [x] 1.1 Prompt mode test for current `lastPresented` items and no feedback write.
- [x] 1.2 Summary-only prompt test with no T4 write.
- [x] 2.1 Local/exported close-session interfaces in `packages/core/src/mcp/tools.ts`.
- [x] 2.2 `Session.closeSession(input)` prompt path over `lastPresented` with known `discussed` filtering.
- [x] 2.3 Targeted prompt tests run; no schema/reducer/overlay/session storage touched.
- [x] 3.1 Explicit known decision test records feedback.
- [x] 3.2 Unknown fingerprint refusal test writes no feedback.
- [x] 3.3 Ambiguous summary/no-inference test writes no feedback.
- [x] 4.1 Decision validation against current `lastPresented` fingerprint + ruleId.
- [x] 4.2 Accepted decisions use `FeedbackStore.record()` with `source: "human"`, explicit verdict, optional reason, `asOf`.
- [x] 4.3 Per-decision results returned; unknown/mismatched findings refused without metadata invention.
- [x] 4.4 Targeted GREEN tests run after decision implementation.
- [x] 5.1 MCP registration test expects `close_session`.
- [x] 5.2 `close_session` Zod schema registered in `packages/core/src/mcp/server.ts`.
- [x] 5.3 Handler wires `session.closeSession({ ...args, asOf: now() })` and JSON serializes result.
- [x] 6.1 Lookup/result shaping kept local to `tools.ts`; no new files.
- [x] 6.2 `pnpm test` and `pnpm typecheck` passed; forbidden files unchanged.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-2.3 | `packages/core/src/mcp/tools.test.ts` | Unit | ✅ 8/8 targeted MCP tests passing before edits | ✅ `closeSession({})` and summary prompt tests failed with `s.closeSession is not a function` | ✅ 9/9 tools tests passed after prompt implementation | ✅ Current prompt items + summary/no-write paths | ✅ Extracted current finding filtering helper |
| 3.1-4.4 | `packages/core/src/mcp/tools.test.ts` | Unit | ✅ 9/9 tools tests passing before decision tests | ✅ Explicit write, unknown refusal, mismatched rule tests failed with empty `results` | ✅ 13/13 tools tests passed after decision implementation | ✅ Accepted known decision, unknown fingerprint, mismatched ruleId, ambiguous summary no-write | ✅ Extracted decision recording helper |
| 5.1-5.3 | `packages/core/src/mcp/server.test.ts` | Integration | ✅ 1/1 server test passing before edit | ✅ Tool-name test failed: expected tool list to include `close_session` | ✅ server+tools targeted tests passed: 14/14 | ✅ Registration plus existing tool list preserved | ➖ None needed |
| 6.1-6.2 | full suite | Unit/Integration | ✅ Targeted suite green before final verify | ➖ Verification/refactor phase; no new RED needed | ✅ `pnpm test`: 23 files, 120 tests passing; `pnpm typecheck`: core+cli clean | ✅ Full test + typecheck coverage | ✅ Forbidden-file diff checked |

## Test Summary

- **Total tests written**: 7
- **Total tests passing**: 120
- **Layers used**: Unit (6), Integration (1), E2E (0)
- **Approval tests**: None — no refactoring-only tasks
- **Pure functions created**: 0

## Verification

- `pnpm vitest run packages/core/src/mcp/tools.test.ts packages/core/src/mcp/server.test.ts` baseline: 2 files, 8 tests passing.
- RED prompt run: `pnpm vitest run packages/core/src/mcp/tools.test.ts` failed on missing `s.closeSession`.
- GREEN prompt run: `pnpm vitest run packages/core/src/mcp/tools.test.ts` passed 9 tests after implementation.
- RED decision run: `pnpm vitest run packages/core/src/mcp/tools.test.ts` failed expected `results` for decision cases.
- GREEN decision run: `pnpm vitest run packages/core/src/mcp/tools.test.ts` passed 13 tests.
- RED registration run: `pnpm vitest run packages/core/src/mcp/server.test.ts` failed because `close_session` absent.
- GREEN registration run: `pnpm vitest run packages/core/src/mcp/server.test.ts packages/core/src/mcp/tools.test.ts` passed 14 tests.
- Final `pnpm test`: 23 files, 120 tests passing.
- Final `pnpm typecheck`: packages/core and packages/cli clean.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/core/src/mcp/tools.ts` | Modified | Added close-session contracts and `Session.closeSession()` prompt/decision behavior. |
| `packages/core/src/mcp/server.ts` | Modified | Registered `close_session` schema and handler. |
| `packages/core/src/mcp/tools.test.ts` | Modified | Added prompt/no-write, summary/no-write, explicit write, unknown refusal, mismatch refusal, and ambiguous no-inference tests. |
| `packages/core/src/mcp/server.test.ts` | Modified | Added `close_session` to expected tool list. |
| `openspec/changes/close-session-feedback/tasks.md` | Modified | Marked all apply tasks complete. |
| `openspec/changes/close-session-feedback/apply-progress.md` | Created | Captured TDD cycle evidence and verification results. |

## Deviations

None — implementation matches design. `summary` is echoed as prompt context only and never used as feedback reason unless per-decision `reason` is explicit.

## Issues

None.

## Remaining Tasks

None for apply. Ready for verify.

## Workload / PR Boundary

- Mode: single PR
- Current work unit: Add `close_session` tests, helper, schema, handler
- Boundary: Four scoped code/test files plus SDD task/progress artifacts
- Estimated review budget impact: Low; no chained PR needed
