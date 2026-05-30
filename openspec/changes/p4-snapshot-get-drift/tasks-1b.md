# Tasks: p4-snapshot-get-drift — Slice 1b (get_drift MCP Tool + resolveCommitSha Wiring)

**Scope**: `get_drift` MCP tool (read-only set-algebra over `snapshot` table) + fix `analyze_repo` handler to pass real commit SHA.
**Schema**: `snapshot` table already exists — NO DDL/migration tasks.
**Test runner**: `pnpm test` (Vitest). STRICT TDD — failing test precedes every implementation task.

---

## Review Workload Forecast

| Item | Estimate |
|---|---|
| `packages/core/src/mcp/server.ts` — resolveCommitSha wiring + get_drift handler | ~20 LOC |
| `packages/core/src/mcp/server.test.ts` — resolveCommitSha wiring test + tool-listed test | ~25 LOC |
| `packages/core/src/mcp/tools.ts` — `getDrift()` method + interfaces | ~80 LOC |
| `packages/core/src/mcp/tools.test.ts` — 11 spec scenarios | ~120 LOC |
| **Total estimated** | **~245 LOC** |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 0 | Wire `resolveCommitSha` in `server.ts` analyze_repo handler | PR 1 (same) | Blocker; fixes `commit_sha = "head"` bug |
| 1 | `Session.getDrift()` method with all spec scenarios | PR 1 (same) | Pure SQL; test-first |
| 2 | `get_drift` tool registration + server wiring | PR 1 (same) | Delegates to getDrift |

All three units fit in one PR (~245 LOC). Single PR delivery.

---

## Work Unit 0 — Fix resolveCommitSha wiring in analyze_repo handler

Sequential. BLOCKER — must land before `get_drift` is useful (otherwise all snapshots have `commit_sha = "head"`).

### WU0-T1 — Test: analyze_repo handler passes resolved SHA to session.analyzeRepo
- **File**: `packages/core/src/mcp/server.test.ts`
- **Spec**: Blocker described in task prompt — literal `"head"` written to snapshot makes set-algebra impossible
- **What**: Add test that spies on `session.analyzeRepo`; when `buildMcpServer` calls `analyze_repo`, the spy receives `commitSha` matching a 40-char hex string (or `""` when git unavailable). Assert it is NOT the literal string `"head"`.
- **Verification**: `pnpm test` — new test fails (current code passes `commitSha: undefined` → fallback to `"head"`).

### WU0-I1 — Impl: import and call `resolveCommitSha` in `analyze_repo` handler
- **File**: `packages/core/src/mcp/server.ts`
- **What**: Import `resolveCommitSha` from `../engine/git-sha.js`. In `analyze_repo` handler, call `resolveCommitSha(opts.rootDir)`. Pass result: `commitSha: sha ?? ""` to `session.analyzeRepo`. Empty string triggers Slice 1's `snapshot-skipped` path; never pass `undefined` or `"head"`.
- **Verification**: `pnpm test` — WU0-T1 passes. `pnpm typecheck` passes. Commit: `fix(mcp): wire resolveCommitSha into analyze_repo handler`

---

## Work Unit 1 — Session.getDrift() method

Sequential within WU1; begins after WU0-I1 (independent of WU2 registration).

### WU1-T1 — Test: get_drift does not trigger analysis (zero writes)
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Requirement "get_drift Is Read-Only" / Scenario "get_drift does not trigger analysis"
- **What**: Call `session.getDrift({ baseCommit: "abc", headCommit: "def" })` with both SHAs absent. Assert `SELECT COUNT(*) FROM snapshot` = 0, `SELECT COUNT(*) FROM finding` = 0, `SELECT COUNT(*) FROM feedback` = 0. No `analyzeRepo` call.
- **Verification**: `pnpm test` — fails (method does not exist).

### WU1-T2 — Test: added finding detected
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "Added finding detected"
- **What**: Seed snapshot table with base={A,B}, head={A,B,C}. Call `getDrift`. Assert `result.added` contains fingerprint C; `result.removed` is empty.

### WU1-T3 — Test: removed finding detected
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "Removed finding detected"
- **What**: Seed base={A,B}, head={A}. Assert `result.removed` contains B; `result.added` is empty.

### WU1-T4 — Test: evidence digest change → persisted `"changed"`
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "Evidence digest change surfaces as changed"
- **What**: Seed fingerprint A in both commits with differing `evidence_digest`. Assert `result.persisted[0].stability === "changed"`.

### WU1-T5 — Test: identical digest → persisted `"stable"`
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "Identical evidence digest surfaces as stable"
- **What**: Seed fingerprint A in both commits with identical `evidence_digest`. Assert `result.persisted[0].stability === "stable"`.

### WU1-T6 — Test: ruleId filter narrows results
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "ruleId filter narrows results"
- **What**: Seed two rules in both snapshots. Call with `ruleId: "react/render-coupling"`. Assert no `react/over-abstraction` entries appear in any result set.

### WU1-T7 — Test: unknown base commit → status unknown_commit
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Requirement "get_drift Cold-Start — Unknown Commit" / Scenario "Unknown base commit is refused"
- **What**: Pass `baseCommit: "unknown-sha"`, known `headCommit`. Assert `result.status === "unknown_commit"` and `result.commit === "unknown-sha"`. Assert no rows written.

### WU1-T8 — Test: unknown head commit → status unknown_commit with head SHA
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "Unknown head commit is refused"
- **What**: Known `baseCommit`, unknown `headCommit: "unknown-head"`. Assert `result.status === "unknown_commit"` and `result.commit === "unknown-head"`.

### WU1-T9 — Test: only one commit analyzed → insufficient_history
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Scenario "Only one commit analyzed" + Requirement "get_drift Cold-Start — Insufficient History"
- **What**: Seed exactly one distinct `commit_sha`. Call `getDrift({ baseCommit: thatSha, headCommit: thatSha })`. Assert `result.status === "insufficient_history"`, `result.snapshotCount === 1`, `result.requiredSnapshots === 2`, `result.added` and `result.removed` are both `[]`.

### WU1-T10 — Test: unknown state is never silent-clean
- **File**: `packages/core/src/mcp/tools.test.ts`
- **Spec**: Requirement "get_drift Does Not Expose Internal Errors as Empty Deltas" / Scenario "Unknown state is never silent-clean"
- **What**: With fewer than 2 distinct snapshots, assert the response NEVER has `status === "ok"` alongside empty arrays. Confirm `status` is always `"unknown_commit"` or `"insufficient_history"`.
- **Verification**: `pnpm test` — all WU1-T1 through WU1-T10 fail (method does not exist).

### WU1-I1 — Impl: `Session.getDrift()` method in tools.ts
- **File**: `packages/core/src/mcp/tools.ts`
- **What**:
  1. Add interfaces: `GetDriftInput { baseCommit: string; headCommit?: string; ruleId?: string; fingerprint?: string }`, `DriftResult` (status union: `"ok"` | `"unknown_commit"` | `"insufficient_history"` + payload fields).
  2. `getDrift(input: GetDriftInput)` is a synchronous method on `Session` (no `analyzeRepo` call, no writes).
  3. Resolve `headCommit`: when omitted, query `SELECT commit_sha FROM snapshot ORDER BY created_at DESC LIMIT 1` to find most recent commit.
  4. Count distinct commits in snapshot table: `SELECT COUNT(DISTINCT commit_sha) AS cnt FROM snapshot`. If < 2 → return `insufficient_history`.
  5. Verify `baseCommit` present: `SELECT 1 FROM snapshot WHERE commit_sha=? LIMIT 1`. If absent → return `{ status: "unknown_commit", commit: baseCommit, message: "..." }`.
  6. Verify `headCommit` present: same check. If absent → return `{ status: "unknown_commit", commit: headCommit, message: "..." }`.
  7. Build optional WHERE clause fragment from `ruleId` and `fingerprint` filters.
  8. Load base set: `SELECT fingerprint, rule_id, evidence_digest FROM snapshot WHERE commit_sha=? [+ filters]`.
  9. Load head set: same for `headCommit`.
  10. Compute `added` (in head, not base), `removed` (in base, not head), `persisted` (in both, carry `stability: "changed" | "stable"` based on `evidence_digest` equality).
  11. Return `{ status: "ok", added, removed, persisted }`.
- **Verification**: `pnpm test` — all WU1-T1 through WU1-T10 pass. `pnpm typecheck` passes. Commit: `feat(mcp): add Session.getDrift() read-only set-algebra over snapshot table`

---

## Work Unit 2 — get_drift tool registration and server wiring

Sequential; depends on WU1-I1 for the method to exist.

### WU2-T1 — Test: get_drift is listed in toolNames
- **File**: `packages/core/src/mcp/server.test.ts`
- **Spec**: Requirement "get_drift Tool Registration" / Scenario "Tool is listed"
- **What**: Assert `toolNames.includes("get_drift")` after `buildMcpServer(opts)`. This test is idiomatic with existing `toolNames` pattern in server.test.ts.
- **Verification**: `pnpm test` — fails (tool not registered yet).

### WU2-I1 — Impl: register `get_drift` tool in buildMcpServer
- **File**: `packages/core/src/mcp/server.ts`
- **What**:
  - Add `server.tool("get_drift", "Return snapshot diff between two analyzed commits (read-only).", { baseCommit: z.string(), headCommit: z.string().optional(), ruleId: z.string().optional(), fingerprint: z.string().optional() }, async (args) => { const r = session.getDrift(args); return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] }; })`.
  - Add `toolNames.push("get_drift")`.
- **Verification**: `pnpm test` — WU2-T1 passes. All prior tests still pass. `pnpm typecheck` passes. Commit: `feat(mcp): register get_drift tool`

---

## Work Unit 3 — Regression and full suite verification

Sequential; depends on WU2-I1.

### WU3-V1 — Verify: full test suite passes with no regressions
- **What**: Run `pnpm test && pnpm typecheck && pnpm build`.
- **Expected**: All tests green (prior 142+ Slice 1 additions + ~11 new Slice 1b tests). No TypeScript errors. Build succeeds.
- **Verification**: Captured output confirms pass. Commit (if fixes needed): `fix(mcp): resolve get_drift regression`

---

## Execution Order (dependency graph)

```
WU0-T1 → WU0-I1 ─→ WU1-T1..T10 → WU1-I1 ─→ WU2-T1 → WU2-I1 → WU3-V1
```

All units are strictly sequential. WU0 is a hard prerequisite (without real SHAs, set-algebra tests would use `"head"` rows which undermines scenario fidelity). WU1 tests can be seeded manually so they don't depend on WU0 at the snapshot-table level, but WU0 must land first per work-unit-commit rules (tell a story, build on real behavior).

---

## Parallel opportunities

None within this slice — units are sequential by dependency. However WU1 tests (WU1-T1 through WU1-T10) are independent of each other and may be written in one batch before WU1-I1.

---

## Spec requirements coverage

| Spec requirement / scenario | Covered by |
|---|---|
| get_drift tool listed | WU2-T1, WU2-I1 |
| get_drift does not trigger analysis (zero writes) | WU1-T1 |
| Added finding detected | WU1-T2 |
| Removed finding detected | WU1-T3 |
| Evidence digest change → `"changed"` | WU1-T4 |
| Identical digest → `"stable"` | WU1-T5 |
| ruleId filter narrows results | WU1-T6 |
| Unknown base commit → `unknown_commit` | WU1-T7 |
| Unknown head commit → `unknown_commit` with head SHA | WU1-T8 |
| Only one commit analyzed → `insufficient_history` | WU1-T9 |
| Unknown state never silent-clean | WU1-T10 |
| resolveCommitSha wired in analyze_repo handler | WU0-T1, WU0-I1 |
