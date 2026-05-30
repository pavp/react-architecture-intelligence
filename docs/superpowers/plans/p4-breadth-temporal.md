# P4 — Breadth + Temporal — Implementation Plan

**Status:** In progress — Slices 1/1b/2/2b/3/4/4b complete; Slice 5 backfill deferred
**Branch base:** `feat/rai-mvp-p0-p3`
**Created:** 2026-05-30
**Design source:** [`docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md`](../specs/2026-05-29-react-architecture-intelligence-mcp-design.md) §3.5, §5.2, §7.2
**Gaps source:** [`docs/gaps.md`](../../gaps.md) §2.1, §3.1, §3.6, §3.7

This plan formalizes the remaining P4 work into reviewable slices. Each slice is its
own PR (or a chained-PR group when it would exceed 400 changed lines), follows strict
TDD, and ends with explicit exit criteria.

---

## Scope summary

P4 delivers two capabilities the MVP cannot:

1. **Temporal reasoning** — `snapshot` population on every analysis run, then `get_drift`
   over the persisted index (set-algebra + evidence-delta). This is the highest-value
   P4 feature because the schema and fingerprint groundwork already exist.
2. **Breadth** — `query_architecture` for bounded graph questions, the lazy ts-morph
   Pass-2 for `typeOf()`, Band C graph escape hatches, and the remaining analyzer slices (`hook-topology`,
   `boundary-violation` / conventions).

Already complete (do **not** re-plan here): KI-1 component-detector fix,
`boundary_rule → architectural-conflict`, config severity-clamp, analyzer crash
containment, `lastReason`, `close_session`, and the first analyzer slice
(`react/render-coupling` + `react/over-abstraction`).

---

## Architecture guardrails (apply to every slice)

- Code is source of truth. Config tunes. Findings are immutable/append-only.
- `snapshot` is a **derived materialized view of T3** (design §3.5) — regenerable from
  finding history, never human-authored, never an independent source of truth.
- `get_drift` is **pure SQL over the persisted snapshot index**. Live recompute,
  ad-hoc traversal, or on-demand re-analysis during a drift query is **prohibited**
  (design §5.2, line 685).
- `@rai/core` stays framework-agnostic.
- New analyzers are pure synchronous functions over `AnalysisContext`.
- Analyzer failures use existing diagnostic isolation, not per-analyzer try/catch.
- Each slice: write the failing test first (strict TDD), then implement.

---

## Decisions resolved before implementation

### D1 — Drift cold-start (gaps §3.1) — RESOLVED

`get_drift` must distinguish **"no drift"** from **"not enough history"**. Returning
`{ added: [], removed: [] }` on an empty index is wrong: a caller reads it as *clean*
when the truth is *unknown*.

Two distinct cases, both explicit:

| Case | Cause | Response |
|------|-------|----------|
| **Unknown commit** | A requested `baseCommit`/`headCommit` was never analyzed | REFUSE per design §5.2 line 685: `{ status: "unknown_commit", commit, message: "run analyze_repo({commit}) to backfill" }`. Drift never silently triggers analysis. |
| **Insufficient history** | All requested commits known, but fewer than 2 snapshots exist to compare | `insufficient_history` status object (below) |

Insufficient-history contract:

```ts
{
  status: "insufficient_history",
  snapshotCount: 1,
  requiredSnapshots: 2,
  added: [],
  removed: [],
  message: "No historical snapshots available yet. Run analysis on at least two commits."
}
```

`snapshotCount` / `requiredSnapshots` make the gap self-documenting — the caller knows
*how much* history is missing, not merely *that* it is.

**Backfill is deferred.** A `rai backfill --from <tag> --to HEAD` command would solve
cold-start fully but carries large risk: dirty-tree guard, detached-HEAD handling,
checkout restore, partial per-commit failures, and per-commit analyze cost. It does not
block `get_drift`. Fix the correct contract on a stable base first; build backfill on
top later (Slice 5). Docs explain the cold-start window and recommend analyzing from
adoption onward.

### D2 — Edge-type audit before analyzer slices (gaps §3.7) — RESOLVED FOR SLICE 4

`hook-topology` ships on `uses-hook` edges only. Slice 4 adds `HookNode` rows and builds
`Component -> Hook` plus `Hook -> Hook` `uses-hook` edges. `passes`, `imports`, and `calls`
remain deferred because Slice 4 does not ship prop-flow or import/call analyzers.

### D3 — Hook-convention config mechanism (gaps §3.6) — RESOLVED IN SLICE 4B

Slice 4 shipped metric-only `react/hook-topology`; Slice 4b adds team-defined `conventions[]`
for forbidden `renders` / `uses-hook` edges and the `react/boundary-violation` analyzer.

---

## Slices

Ordered by value and dependency. Snapshot + drift first (groundwork exists), then
breadth.

### Slice 1 — `snapshot` population ✅ DONE

**Goal:** every analysis run writes the current fingerprint set to `snapshot`, deterministically
and idempotently. This slice builds the temporal *substrate* only. It does NOT add `get_drift`
(moved to Slice 1b) — reading the index is a separate slice.

**Scope boundary (decided):** snapshot writer + internal tests only. No new public MCP/CLI
surface. Snapshot is a derived internal index; it is exposed when `get_drift` reads it in Slice 1b.
Readiness is proven by tests that query the `snapshot` table directly via SQL — NOT by shipping a
placeholder reader. (We do not ship drift placeholders; empty arrays would
read as "nothing changed" when the truth is "not implemented" — the same semantic bug rejected for
cold-start.)

Snapshot schema already exists (`packages/core/src/db/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS snapshot (
  commit_sha TEXT NOT NULL, fingerprint TEXT NOT NULL, rule_id TEXT NOT NULL,
  severity_raw TEXT NOT NULL, evidence_digest TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (commit_sha, fingerprint, rule_id)
);
```

**Tasks:**

- [x] **1.1 Resolve current commit SHA** for the analyzed repo (read-only git, or accept
      `commit` via input). No checkout. If the SHA is unavailable (not a git repo): skip the
      snapshot write + emit a diagnostic, so non-git fixtures still analyze. (Default: skip +
      diagnostic, no sentinel.)
- [x] **1.2 Snapshot writer** in the pipeline (`packages/core/src/engine/pipeline.ts`):
      after persist, append one row per current finding — `(commit_sha, fingerprint,
      rule_id, severity_raw, evidence_digest, created_at)`. `evidence_digest` is a stable
      hash of the finding evidence (deterministic — no `Date.now`/`Math.random`;
      `created_at` comes from `asOf`). Idempotent on `PRIMARY KEY` (re-analyzing the same
      commit must not duplicate or error — `INSERT OR REPLACE` / `ON CONFLICT`).
- [x] **1.3 Internal readiness tests** — query the `snapshot` table directly via SQL:
      row-count per commit, deterministic replay (byte-identical rows across two runs),
      idempotency on re-analysis. No public surface added.
- [x] **1.4 Spec update:** add ONLY the snapshot-population requirement to
      `openspec/specs/analysis-pipeline.md`. (The `get_drift` contract belongs to Slice 1b.)

**Design note — why no metrics here:** `snapshot` stores `evidence_digest`, not raw metrics.
A fanIn 3→9 change surfaces (in Slice 1b) as a digest difference; the literal numbers live in
the `finding` rows. This slice intentionally stops at the digest.

**Strict TDD anchors (write first):**
- snapshot writer is idempotent on re-analysis of the same commit (row count does not grow)
- deterministic replay: two runs on the same commit produce byte-identical snapshot rows; `created_at == asOf`
- non-git fixture: snapshot write is skipped and a diagnostic is emitted (analysis still completes)
- one row per persisted finding is written with the resolved SHA as `commit_sha`

**Exit criteria:**
- [x] Analysis run populates `snapshot` deterministically (replay → identical rows)
- [x] Writer is idempotent on re-analysis (no duplicates, no constraint error)
- [x] Non-git input skips snapshot with a diagnostic; analysis still completes
- [x] No new public MCP/CLI surface added in this slice
- [x] `pnpm build` / `pnpm test` / `pnpm typecheck` clean
- [x] `openspec/specs/analysis-pipeline.md` updated (snapshot population only)

**Size estimate:** ~120–200 lines. Single PR, comfortably under 400.

---

### Slice 1b — `get_drift` MCP tool (includes cold-start) ✅ DONE

**Goal:** read the snapshot index and answer temporal deltas with the active `openspec` contract.
This is the slice that consumes Slice 1's substrate and carries the D1 cold-start decision.

**Implemented contract note:** active spec and code expose `added`, `removed`, and `persisted`
with `stable` / `changed` digest status. Raw `worsened` / `improved` metric deltas remain out of
this slice because `snapshot` stores an evidence digest, not metric columns.

**Tasks:**

- [x] **1b.1 `get_drift` query module** (pure SQL over snapshot index, design §3.5/§5.2):
      - `added` = fingerprints in `headCommit` snapshot, absent in `baseCommit`.
      - `removed` = fingerprints in `baseCommit` snapshot, absent in `headCommit`.
      - `persisted` = fingerprints present in both, with `stable` / `changed` based on
        `evidence_digest` equality.
      - Optional `ruleId` / `fingerprint` filters narrow results without changing the algebra.
- [x] **1b.2 Cold-start handling (D1), two distinct cases:**
      - Unknown commit (never analyzed) → REFUSE per design §5.2 line 685:
        `{ status: "unknown_commit", commit, message: "run analyze_repo({commit}) to backfill" }`.
        Never silently triggers analysis.
      - Known commits but < 2 snapshots → `{ status: "insufficient_history", snapshotCount,
        requiredSnapshots: 2, message: "..." }`. MUST NOT return empty `added/removed/...`
        that could be read as "clean".
- [x] **1b.3 `headCommit` default** — when omitted, resolve to the latest analyzed commit in
      `snapshot` (ordering semantics defined; tie-break documented).
- [x] **1b.4 `get_drift` MCP tool** in `packages/core/src/mcp/tools.ts` + server registration.
      Pure read — **never** triggers analysis.
- [x] **1b.5 Spec update:** add the `get_drift` contract + cold-start statuses to
      `openspec/specs/mcp-tools.md`.

**Strict TDD anchors (write first):**
- two commits, one new + one gone fingerprint → correct `added`/`removed` sets
- a fingerprint whose digest changed → appears in `persisted` with `stability: "changed"`
- a fingerprint whose digest is identical → appears in `persisted` with `stability: "stable"`
- unknown commit → `unknown_commit` REFUSE, no analysis triggered
- one snapshot only → `insufficient_history` with `snapshotCount: 1`, never empty-clean

**Exit criteria:**
- [x] `get_drift` shows added/removed fingerprints across two analyzed commits
- [x] `get_drift` shows persisted findings with `stable` / `changed` evidence-digest status
- [x] cold-start returns explicit `insufficient_history` / `unknown_commit`, never empty-clean
- [x] field names match active `openspec/specs/mcp-tools.md`
- [x] `pnpm build` / `pnpm test` / `pnpm typecheck` clean
- [x] `openspec/specs/mcp-tools.md` updated

**Size estimate:** ~250–350 lines. Single PR; if the metric-join pushes it over, split the
query module from the MCP tool into a chained PR.

---

### Slice 2 — `query_architecture` MCP tool ✅ DONE

**Goal:** bounded, enumerated graph questions answered from existing graph facts. No
free-form traversal.

Design §5.2 signature:
`query_architecture({ question: 'renders' | 'rendered-by' | 'hook-consumers' | 'fan-in' | ... })`
— structured answers, **bounded depth**, index-backed.

**Tasks:**
- [x] **2.1 Enumerate the supported questions** for the MVP set against the edges that
      actually exist post-Slice-4 edge audit. Start with `renders` / `rendered-by` /
      `fan-in` (built today). Gate `hook-consumers` on `uses-hook` edges existing.
- [x] **2.2 Bounded query implementations** — depth-limited CTEs / graph walks over the
      frozen `RepoGraph`. Every query has a hard depth/breadth bound (design §6: "snapshot
      queries index-backed + bounded").
- [x] **2.3 `query_architecture` MCP tool** + server registration. Reject unknown
      `question` values with a structured error listing valid ones.
- [x] **2.4 Spec update** in `openspec/specs/mcp-tools.md`.

**Implemented scope:** `renders`, `rendered-by`, `fan-in`, `fan-out`, and `reachability` over the latest in-memory `RepoGraph`. `hook-consumers`, `import-path`, and other questions stay gated until their edge types exist.

**Strict TDD anchors:**
- `renders` on a known fixture → exact child set
- `fan-in` returns the correct count for a shared component
- unknown `question` → structured refusal with the valid enum
- a deep render chain respects the depth bound (no unbounded walk)

**Exit criteria:**
- [x] At least `renders` / `rendered-by` / `fan-in` answered correctly on fixtures
- [x] All queries bounded; no unbounded traversal path exists
- [x] Unknown question refused with the valid set
- [x] build/test/typecheck clean; spec updated

**Size estimate:** ~200–300 lines. Single PR.

---

### Slice 2b — Band C graph escape hatches ✅ DONE

**Goal:** expose non-primary, bounded graph debugging tools from design §5.4 without turning
`query_architecture` into free-form traversal.

**Implemented scope:** `get_node` and allowlisted `raw_graph_query` over the latest in-memory
`RepoGraph`. Both tools require a prior analysis and never trigger analysis as a side effect.

**Tasks:**
- [x] **2b.1 `get_node` session method** — lookup by current finding fingerprint, file+byteRange,
      or file. Returns node detail, span, astPath, and optional lazy Pass-2 `typeInfo`.
- [x] **2b.2 `raw_graph_query` session method** — supports only allowlisted `nodes` / `edges`
      row requests, normalizes/caps `limit`, and returns `truncated` when bounded.
- [x] **2b.3 MCP registration** — expose `get_node` and `raw_graph_query`.
- [x] **2b.4 Spec/status/gaps update**.

**Exit criteria:**
- [x] `get_node` refuses before analysis and resolves a known file/range node.
- [x] `raw_graph_query` refuses before analysis, rejects unsupported patterns, and truncates rows.
- [x] build/test/typecheck clean; spec updated.

---

### Slice 3 — Lazy ts-morph Pass-2 for `typeOf()` (gaps §1.2) ✅ DONE

**Goal:** wire the deferred Pass-2 so `ctx.typeOf(span)` returns real type info instead of
`null`. Tracked as change `wire-ts-morph-pass2`.

Current stub (`packages/core/src/engine/pipeline.ts`):
```ts
types: { typeOf: () => null }, // lazy Pass-2 wired in P4
```

**Why a separate slice:** adds a ~5 MB ts-morph dependency and ~130–190 LOC for zero
observable behavior change in current scope. It must not be bundled with a slice that has
its own risk. It unlocks type-aware analyzers and the future learned-embedding work.

**Tasks:**
- [x] **3.1 Lazy ts-morph project init** — construct the ts-morph `Project` only on first
      `typeOf()` call (lazy; many runs never need types). Per-analyzer memoization per the
      design's isolation rule (`typeOf` writes only to a per-analyzer memo).
- [x] **3.2 Span → type resolution** — map a stored `Span` (with `content_hash`) to a
      ts-morph node and return its type. Honor the stale-Span rule (design §2.1, line 130):
      a Span whose file hash drifted is stale → recompute, do not trust.
- [x] **3.3 Contract test** against the design §2.1 `typeOf` contract.
- [x] **3.4 Spec update** if the analyzer contract surface changes.

**Implemented scope:** `ctx.types.typeOf(span)` returns stable `TypeInfo` (`text`, optional `symbolName`) for component spans. The resolver is lazy, memoized by span + current file content hash, and returns `null` when a stale span no longer resolves.

**Strict TDD anchors:**
- `typeOf` on a known typed span → expected type string
- lazy init: a run with no `typeOf` call never constructs the ts-morph Project
- stale span (drifted content hash) is recomputed, not served from stale cache

**Exit criteria:**
- [x] `typeOf()` returns non-null for a typed span on a fixture
- [x] Lazy: no ts-morph cost when no analyzer calls `typeOf`
- [x] Determinism preserved (no clock/random introduced)
- [x] build/test/typecheck clean

**Size estimate:** ~150–250 lines + dependency. Single PR.

---

### Slice 4 — Remaining analyzers: edge audit + `hook-topology` (+ `boundary-violation` scope) ✅ DONE

**Goal:** reach the P4 "≥4 analyzers green" exit bar (design §7.2). Today: 3
(`shared-extraction`, `render-coupling`, `over-abstraction`). This slice adds at least one
more and resolves the edge-construction gap.

**Tasks:**
- [x] **4.1 Edge-type audit (D2)** — for each candidate analyzer, list required `EdgeKind`.
      Add `buildGraph` construction for `uses-hook` (needed by `hook-topology`). Decide
      `passes` edge: add to `EdgeKind` + build it, or remove from spec scope. Document the
      decision in the spec.
- [x] **4.2 `react/hook-topology` analyzer** — metric-only first (D3): hook fan-in,
      fan-out, transitive depth over `uses-hook` edges. Config thresholds mirroring
      `render-coupling` (`maxHookFanIn`, `maxHookDepth`, …). Pure sync function,
      metric-only evidence.
- [x] **4.3 Register** in `packages/core/src/analyzers/registry.ts` default order.
- [x] **4.4 `boundary-violation` / convention analyzer — SCOPE DECISION ONLY.** Decide
      whether it ships this slice or becomes Slice 4b. If the `conventions[]` config schema
      (hook + component edge patterns, gaps §3.6) lands here, it likely exceeds 400 lines →
      split to 4b. Default: **scope decision documented, implementation in 4b** to protect
      review focus.
- [x] **4.5 Spec update** in `openspec/specs/architecture-analysis.md`.

**Implemented scope:** `HookNode`, `uses-hook` construction, metric-only `react/hook-topology`, and config thresholds. `passes`, import/call edge analyzers, hook conventions, and `boundary-violation` implementation stay deferred.

**Strict TDD anchors:**
- `buildGraph` constructs `uses-hook` edges for a fixture with hook composition
- `hook-topology` fires on a hook exceeding `maxHookDepth`, silent below threshold
- new analyzer respects crash containment (a throw becomes a diagnostic, later analyzers run)

**Exit criteria:**
- [x] ≥4 analyzers green (design §7.2 bar)
- [x] `uses-hook` edges constructed; edge audit documented
- [x] `hook-topology` emits metric-only evidence with config thresholds
- [x] `boundary-violation` scope decision recorded
- [x] build/test/typecheck clean; spec updated

**Size estimate:** ~300–400 lines for the audit + `hook-topology`. `boundary-violation`
→ Slice 4b if it lands. Chain if combined exceeds budget.

---

### Slice 4b — `boundary-violation` / convention analyzer ✅ DONE

**Goal:** make existing graph edges useful for team-specific architectural rules without adding
new edge types.

**Implemented scope:** config-driven `conventions[]` for forbidden `renders` and `uses-hook`
edges, plus `react/boundary-violation` findings with `architectural-conflict` type. Unsupported
edge kinds (`imports`, `calls`, `passes`) are rejected until those edges are constructed.

**Tasks:**
- [x] **4b.1 Convention config schema** — `id`, `edgeKind`, `from`, `to`, `policy`, `severity`, `reason`.
- [x] **4b.2 Selector matching** — node `kind`, `name`, `file`, and `exportKind`; `name`/`file` use minimal glob semantics.
- [x] **4b.3 `react/boundary-violation` analyzer** — emits `architectural-conflict` findings over current graph edges only.
- [x] **4b.4 Register/export analyzer** in default registry and public package exports.
- [x] **4b.5 Spec/status/gaps update**.

**Exit criteria:**
- [x] Forbidden `renders` edge emits conflict.
- [x] Forbidden `uses-hook` edge emits conflict.
- [x] Component-to-hook `uses-hook` conventions can match.
- [x] Unsupported edge kinds are rejected, not silently ignored.
- [x] build/test/typecheck clean; spec updated.

---

### Slice 5 — `rai backfill` CLI ✅ DONE

**Goal:** retroactively populate `snapshot` for historical commits, solving cold-start
fully.

**Risk (why deferred):** detached-HEAD handling, dirty-tree guard, checkout restore on
failure, partial per-commit failures, per-commit analyze cost. This is git-state
orchestration, categorically riskier than the read-only slices above.

**Implemented scope:** `rai backfill [dir] --from <sha> --to <sha> --db <path>` runs over an
inclusive commit range, writes snapshots through the normal analyzer pipeline, stores the DB under
`.git/rai.sqlite` by default, skips commits that already have snapshot rows, and always restores the
starting branch/HEAD.

**Tasks:**
- [x] **5.1 Dirty-tree guard** — refuse to run with uncommitted changes.
- [x] **5.2 Commit-range resolution** — `--from <tag/sha> --to HEAD`.
- [x] **5.3 Per-commit checkout → analyze → snapshot → restore.** Restore the original
      HEAD on any failure (try/finally around the checkout loop).
- [x] **5.4 Partial-failure reporting** — one commit failing must not abort the rest;
      report per-commit status.
- [x] **5.5 Idempotency** — re-running backfill over already-snapshotted commits is a
      no-op for those commits.

**Exit criteria:**
- [x] Backfill populates snapshot for a multi-commit fixture range
- [x] Original HEAD always restored, even on mid-range failure
- [x] Dirty tree refused
- [x] build/test/typecheck clean

**Size estimate:** ~250–350 lines. Single PR. Own approved issue.

---

## Sequencing

```
Slice 1 (snapshot + get_drift)   ← FIRST, groundwork exists, highest value
        │
        ├── Slice 2 (query_architecture)   independent of 1, can run parallel
        ├── Slice 2b (Band C graph tools)  escape hatches over latest graph
        ├── Slice 3 (ts-morph Pass-2)      independent, unlocks type-aware work
        └── Slice 4 (edge audit + hook-topology)
                    └── Slice 4b (boundary-violation / conventions)
Slice 5 (backfill CLI)   completes cold-start snapshot population
```

## P4 overall exit criteria (design §7.2)

- [x] ≥4 analyzers green
- [ ] `get_drift` shows a fan-in delta (e.g. 3→9) across commits
- [x] `snapshot` populated deterministically per analysis run
- [x] `query_architecture` answers bounded graph questions
- [x] Band C `get_node` / `raw_graph_query` are bounded and read-only
- [x] cold-start returns explicit `insufficient_history`, never silent-clean
- [ ] All slices: build/test/typecheck clean, specs synced, each PR ≤400 lines or chained

## Per-slice GitHub workflow

1. Create or reuse an approved issue with exactly one `type:*` label.
2. Branch from `feat/rai-mvp-p0-p3`.
3. Strict TDD: failing test → implement → green.
4. Run `pnpm build`, `pnpm test`, `pnpm typecheck`.
5. Push, open PR via template, link the issue.
6. Wait for CI; squash merge when approved.
7. If a slice would exceed 400 changed lines, split into a chained PR group.
