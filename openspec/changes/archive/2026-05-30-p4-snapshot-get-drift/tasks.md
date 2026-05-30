# Tasks: p4-snapshot-get-drift — Slice 1 (Snapshot Population Writer)

**Scope**: Writer-only. get_drift (Slice 1b) is OUT of scope.
**Schema**: `snapshot` table already exists — NO DDL/migration tasks.
**Test runner**: `pnpm test` (Vitest). STRICT TDD — failing test precedes every implementation task.

---

## Work Unit A — Extend AnalysisDiagnostic type for snapshot-skipped

Sequential. Prerequisite for all other units.

### A1 — Test: `snapshot-skipped` diagnostic satisfies the `AnalysisDiagnosticKind` union
- **File**: `packages/core/src/engine/pipeline.test.ts`
- **Spec**: Requirement "Commit SHA Resolution" — non-git fixture emits `kind: "snapshot-skipped"`
- **What**: Add a compile-time (TypeScript) test that asserts the diagnostic `{ kind: "snapshot-skipped", message: "..." }` is assignable to `AnalysisDiagnostic`. This will fail to compile because `AnalysisDiagnosticKind` does not include `"snapshot-skipped"` yet.
- **Verification**: `pnpm typecheck` fails; `pnpm test` may still pass (compile error).

### A2 — Impl: Add `"snapshot-skipped"` to `AnalysisDiagnosticKind`
- **File**: `packages/core/src/types.ts`
- **What**: Extend the union: `export type AnalysisDiagnosticKind = "analyzer-error" | "snapshot-skipped";`
- **Verification**: `pnpm typecheck` passes. Commit message: `feat(types): add snapshot-skipped diagnostic kind`

---

## Work Unit B — SnapshotStore: write and idempotent insert

Sequential within B; B can begin after A2 is done.

### B1 — Test: SnapshotStore inserts one row per finding; is idempotent on (commit_sha, fingerprint, rule_id)
- **File**: `packages/core/src/memory/snapshot-store.test.ts` (new file)
- **Spec**: Requirement "Snapshot Population After Persist" — idempotent re-analysis, deterministic replay, 2 findings → 2 rows, non-null evidence_digest
- **What**: Four focused unit tests against an in-memory DB:
  1. `insert()` writes one row; row fields match inputs (`commit_sha`, `fingerprint`, `rule_id`, `severity_raw`, `evidence_digest` non-null, `created_at == asOf`).
  2. Calling `insert()` twice with the same PK does NOT throw and does NOT add a second row.
  3. Two findings → exactly 2 rows.
  4. Same call twice → identical row bytes (determinism).
- **Verification**: `pnpm test` — all 4 tests fail (SnapshotStore does not exist).

### B2 — Impl: `SnapshotStore` class
- **File**: `packages/core/src/memory/snapshot-store.ts` (new file)
- **Spec**: Requirement "Snapshot Population After Persist" — idempotent insert, deterministic evidence_digest, created_at = asOf
- **What**:
  - Constructor: `(db: Db)`.
  - `insert(row: SnapshotRow): void` where `SnapshotRow = { commitSha, fingerprint, ruleId, severityRaw, evidenceDigest, createdAt }`.
  - SQL: `INSERT OR REPLACE INTO snapshot (commit_sha, fingerprint, rule_id, severity_raw, evidence_digest, created_at) VALUES (?,?,?,?,?,?)`.
  - Evidence digest helper (module-internal): deterministic SHA-256 (Node `crypto.createHash('sha256')`) over `JSON.stringify(evidence)` sorted-key (use `JSON.stringify(evidence, Object.keys(evidence).sort())` or a stable stringifier). Returns hex string. No `Math.random()`, no `Date.now()`.
- **Verification**: `pnpm test` — all B1 tests pass. Commit message: `feat(memory): add SnapshotStore with idempotent INSERT OR REPLACE`

---

## Work Unit C — Commit SHA resolver

Sequential within C; C can begin after A2 (no dependency on B).

### C1 — Test: SHA resolver returns SHA for a real git repo; returns null for a non-git path
- **File**: `packages/core/src/engine/git-sha.test.ts` (new file)
- **Spec**: Requirement "Commit SHA Resolution" — read-only, no checkout, returns null for non-git
- **What**:
  1. Called with `process.cwd()` (which is a git repo) → returns a 40-char hex string.
  2. Called with `os.tmpdir()` → returns `null`.
  3. Does NOT call `git checkout` or any mutating git command (assert via child_process spy or indirect proof via tmpdir test).
- **Verification**: `pnpm test` — tests fail (resolver does not exist).

### C2 — Impl: `resolveCommitSha(repoPath: string): string | null`
- **File**: `packages/core/src/engine/git-sha.ts` (new file)
- **Spec**: Requirement "Commit SHA Resolution" — read-only, skip on failure
- **What**:
  - Use `spawnSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' })`.
  - If `status !== 0` or stdout is empty → return `null`.
  - Return `stdout.trim()`.
  - No imports from the pipeline — pure utility.
- **Verification**: `pnpm test` — all C1 tests pass. Commit message: `feat(engine): add read-only git SHA resolver`

---

## Work Unit D — Pipeline integration: wire snapshot population

Sequential; depends on B2 + C2.

### D1 — Test: pipeline writes snapshot rows after findings persist (happy path)
- **File**: `packages/core/src/engine/pipeline.test.ts`
- **Spec**: Scenario "Snapshot is populated after findings persist" — 2 findings → 2 rows, non-null evidence_digest
- **What**: New test using in-memory DB + a fake commitSha (pass `commitSha: "abc123"`) + an injected `repoPath` (or mock SHA resolver). After `analyzeRepo` returns, query `SELECT COUNT(*) FROM snapshot WHERE commit_sha='abc123'` — expect `2`. Also assert `evidence_digest IS NOT NULL`.
- **Note**: The pipeline currently receives `commitSha` on `AnalyzeRepoInput`. SHA resolution for real-world use is a caller responsibility (MCP layer wires it). The pipeline test passes a deterministic SHA directly — no git subprocess in pipeline tests.
- **Verification**: `pnpm test` — new test fails; existing tests unaffected.

### D2 — Test: pipeline emits `snapshot-skipped` diagnostic when commitSha is absent/empty
- **File**: `packages/core/src/engine/pipeline.test.ts`
- **Spec**: Scenario "Non-git fixture — snapshot is skipped" — skip + one `snapshot-skipped` diagnostic + findings returned normally
- **What**: New test passing `commitSha: ""` (empty string = signal from caller that SHA is unavailable). Assert:
  1. `res.diagnostics` contains exactly one entry with `kind === "snapshot-skipped"`.
  2. `res.presented` is non-empty (findings still returned).
  3. `SELECT COUNT(*) FROM snapshot` → `0`.
- **Verification**: `pnpm test` — new test fails.

### D3 — Test: snapshot failure does NOT roll back persisted findings
- **File**: `packages/core/src/engine/pipeline.test.ts`
- **Spec**: Scenario "Snapshot does not affect finding integrity"
- **What**: New test where the snapshot insert is forced to throw (e.g., by passing a corrupted db handle or a SnapshotStore stub that throws). Assert:
  1. `analyzeRepo` returns normally (no throw propagates).
  2. Finding rows in `finding` table are intact.
  3. `res.diagnostics` contains one `snapshot-skipped`-family diagnostic.
- **Verification**: `pnpm test` — new test fails.

### D4 — Test: idempotent re-analysis (row count stable across two runs)
- **File**: `packages/core/src/engine/pipeline.test.ts`
- **Spec**: Scenario "Idempotent re-analysis"
- **What**: Run `analyzeRepo` twice with same `commitSha` and same files. Query `SELECT COUNT(*) FROM snapshot WHERE commit_sha=?` — expect same count both times (not doubled).
- **Verification**: `pnpm test` — new test fails.

### D5 — Test: deterministic replay (created_at equals asOf, rows byte-for-byte identical)
- **File**: `packages/core/src/engine/pipeline.test.ts`
- **Spec**: Scenario "Deterministic replay"
- **What**: Run `analyzeRepo` twice on separate in-memory DBs with the same inputs and `asOf: 42`. Compare all snapshot rows: same `created_at`, same `evidence_digest`, same `fingerprint`. Assert `created_at === 42` (not `Date.now()`).
- **Verification**: `pnpm test` — new test fails.

### D6 — Impl: wire SnapshotStore into `analyzeRepo`
- **File**: `packages/core/src/engine/pipeline.ts`
- **Spec**: All snapshot population requirements
- **What**:
  1. After the finding-persist loop (step 7-8), check if `input.commitSha` is a non-empty string.
  2. If empty/falsy: push `{ kind: "snapshot-skipped", message: "no git SHA available" }` to `diagnostics`. Skip.
  3. If non-empty: instantiate `SnapshotStore` from the db handle (`(input.findings as any).db`). For each `persisted` finding: call `store.insert({ commitSha: input.commitSha, fingerprint: f.fingerprint.structural, ruleId: f.ruleId, severityRaw: f.severityRaw, evidenceDigest: digestFn(f.evidence), createdAt: input.asOf })`.
  4. Wrap the entire snapshot block in try/catch. On error: push `{ kind: "snapshot-skipped", message: err.message }` to `diagnostics`. Do NOT rethrow. Do NOT affect `presented` or finding rows.
  5. Import `SnapshotStore` from `../memory/snapshot-store.js`. Import `digestFn` (the evidence hash helper) — either re-export it from `snapshot-store.ts` or inline a minimal call.
- **Note**: `AnalysisDiagnosticKind` already includes `"snapshot-skipped"` from A2; TypeScript is satisfied.
- **Verification**: `pnpm test` — all D1–D5 tests pass, all prior tests still pass. `pnpm typecheck` passes. Commit message: `feat(engine): wire snapshot population after finding persist`

---

## Work Unit E — Regression and full suite verification

Sequential; depends on D6.

### E1 — Verify: full test suite passes with no regressions
- **What**: Run `pnpm test && pnpm typecheck && pnpm build`.
- **Expected**: All tests green (existing 142 + new snapshot tests). No TypeScript errors. Build succeeds.
- **Verification**: Captured output confirms pass. Commit message (if any fixes needed): `fix(engine): resolve snapshot regression`

---

## Execution Order (dependency graph)

```
A1 → A2 ─┬─→ B1 → B2 ─┐
          │              ├─→ D1 → D2 → D3 → D4 → D5 → D6 → E1
          └─→ C1 → C2 ──┘
```

- A is a strict prerequisite (type union must exist before pipeline impl).
- B and C can be worked in PARALLEL once A2 is done.
- D1–D6 require both B2 and C2 to be complete.
- E1 is the final gate.

---

## Parallel opportunities

| Can run in parallel | Units |
|---|---|
| After A2 | B (SnapshotStore) ‖ C (SHA resolver) |
| After B2 + C2 | D sequential |

---

## Review Workload Forecast

| Item | Estimate |
|---|---|
| `packages/core/src/types.ts` | ~1 line changed |
| `packages/core/src/memory/snapshot-store.ts` (new) | ~50 LOC |
| `packages/core/src/memory/snapshot-store.test.ts` (new) | ~60 LOC |
| `packages/core/src/engine/git-sha.ts` (new) | ~20 LOC |
| `packages/core/src/engine/git-sha.test.ts` (new) | ~25 LOC |
| `packages/core/src/engine/pipeline.ts` | ~20 LOC changed |
| `packages/core/src/engine/pipeline.test.ts` | ~70 LOC added |
| **Total estimated** | **~246 LOC** |

**Chained PRs recommended**: No
**400-line budget risk**: Low (~246 LOC estimated, well under 400)
**Decision needed before apply**: No

---

## Spec requirements coverage

| Spec requirement / scenario | Covered by |
|---|---|
| SHA resolved → snapshot written (one row per finding) | D1, D6 |
| Non-git fixture → skipped + `snapshot-skipped` diagnostic | D2, D6 |
| Idempotent re-analysis (row count stable) | B1 (unit), D4 (integration) |
| Deterministic replay (created_at == asOf, byte-for-byte) | B1 (unit), D5 (integration) |
| 2 findings → 2 rows, non-null evidence_digest | B1 (unit), D1 (integration) |
| Snapshot failure does NOT roll back findings | D3, D6 (try/catch) |
| Snapshot is a derived view, does not affect finding integrity | D3, E1 |
| `evidence_digest` is stable, deterministic hash | B2 (SHA-256 impl), D5 |
| No `Date.now()` / `Math.random()` in created_at or evidence_digest | B1 assert, D5 assert |
| `INSERT OR REPLACE` idempotency | B2 (SQL), B1 (test), D4 |
