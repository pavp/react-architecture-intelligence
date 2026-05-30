# RAI — Known Gaps & Missing Documentation

> Compiled from architectural review on 2026-05-30. Gaps are organized by layer: code-level stubs, missing plans, and unresolved conceptual issues.

---

## 1. MVP gaps — marked in code, no formal plan

These are deferred features inside the already-completed P0–P3 scope. They are documented as inline comments in the source but have no corresponding plan file or executable task list.

### 1.1 `boundary_rule` → `architectural-conflict` ✅ FIXED in wire-deferred-mvp-gaps

**Location:** [packages/core/src/analyzers/shared-extraction.ts](../packages/core/src/analyzers/shared-extraction.ts)

**Fix applied:** Wired `ctx.boundaryRules` (loaded from `config.boundaries[]`) into `shared-extraction`. Clusters crossing a declared `from`/`to` glob boundary now emit `type: "architectural-conflict"` with `evidence.conflict = { rule, why }`. Clusters that don't cross any boundary continue to emit `"opportunity"`. The DB `boundary_rule` table remains read-only — rules are version-controlled in config.

**Change:** `wire-deferred-mvp-gaps` — branch `feat/rai-mvp-p0-p3`.

---

### 1.2 `typeOf()` always returns null (Pass-2 not wired) ✅ FIXED in `wire-ts-morph-pass2`

**Fix applied:** `ctx.types.typeOf(span)` now uses a lazy `ts-morph` resolver. It constructs the project only on first lookup, returns stable `TypeInfo`, memoizes by span + current file content hash, and returns `null` for stale spans that no longer resolve.

**Location:** [packages/core/src/engine/pipeline.ts](../packages/core/src/engine/pipeline.ts), [packages/core/src/parse/type-resolver.ts](../packages/core/src/parse/type-resolver.ts)
```ts
types: createTypeResolver({ files: input.files, graph, hooks: input.typeResolverHooks })
```
**Impact resolved:** Type-level analyzer work is now unblocked for component spans.

**Change:** `wire-ts-morph-pass2` — branch `feat/rai-mvp-p0-p3`.

---

### 1.3 Config severity-clamp is identity in overlay ✅ FIXED in wire-deferred-mvp-gaps

**Location:** [packages/core/src/memory/overlay.ts](../packages/core/src/memory/overlay.ts)

**Fix applied:** Added optional `severityMap: Partial<Record<Severity, Severity>>` to `OverlayConfig` and `config.memory` schema. The overlay now applies `cfg.severityMap?.[f.severityRaw] ?? f.severityRaw` — a pure read-time clamp that never mutates the stored finding. Config validation rejects any upward mapping (e.g. `info→error`) via a Zod `superRefine` down-only rank guard.

**Change:** `wire-deferred-mvp-gaps` — branch `feat/rai-mvp-p0-p3`.

---

### 1.4 KI-1 — Non-component capitalized functions → false positives ✅ FIXED in fix-ki1-component-detector

**Location:** [packages/core/src/parse/pass1.ts](../packages/core/src/parse/pass1.ts) line ~10 (`COMPONENT_NAME = /^[A-Z]/`)

**Impact (resolved):** Next.js route handlers (`GET`, `POST`, `PUT`, `DELETE`) were capitalized functions that are not React components. Pass-1 was treating them as components, they all got the same empty structural fingerprint, and `shared-extraction` fired a false positive at cosine 1.0.

**Reproduced in field:** `scaffold-nextjs-app/src` (477 files) → 1 true positive + 1 false positive (route handlers).

**Fix applied (Option B):** Added `returnsJsx: boolean` flag to `RenderFacts` during AST walk in `pass1.ts`. Added guard `if (!facts.returnsJsx) return;` inside `walkComponent` — capitalized functions that produce no JSX are not admitted as components. Route handlers never enter the graph.

**Change:** `fix-ki1-component-detector` — branch `feat/rai-mvp-p0-p3`.

**Documented in:** [docs/superpowers/STATUS.md](superpowers/STATUS.md) under "Known issues → KI-1".

---

## 2. P4–P6 gaps — roadmap state

The [docs/superpowers/STATUS.md](superpowers/STATUS.md) lists these under "Next steps". P4 and P5 now have executable plans; P6 still needs a phase plan.

### 2.1 P4 — Breadth + temporal

Plan file exists: [docs/superpowers/plans/p4-breadth-temporal.md](superpowers/plans/p4-breadth-temporal.md)

Tasks that need to be formalized:
- Fix KI-1 (1.4 above) — ✅ done
- Wire `typeOf()` Pass-2 (1.2 above) — ✅ done
- Wire `boundary_rule` → `architectural-conflict` (1.1 above) — ✅ done
- Wire config severity-clamp in overlay (1.3 above) — ✅ done
- Populate `snapshot` table on each analysis run — ✅ done
- Implement `get_drift` MCP tool (pure SQL set-algebra over snapshots — spec §3.5/§5.2) — ✅ done
- Implement `query_architecture` MCP tool (enumerated graph questions, bounded traversal — spec §5.2) — ✅ done for current `renders` graph facts
- Add more analyzers: `coupling`, `hook-topology`, `over-abstraction`, `boundary-violation` — ✅ `react/render-coupling`, `react/over-abstraction`, `react/hook-topology`, and `react/boundary-violation` done
- Analyzer fault containment: crash isolation ✅ done; hard sync-CPU timeout still deferred until worker isolation exists
- Band C MCP tools: `get_node`, `raw_graph_query` (spec §5.4)

Exit criteria (to be defined in the plan): same format as P0–P3 plan checkboxes.

### 2.2 P5 — Codemod apply

Plan file exists: [docs/superpowers/plans/p5-codemod-apply.md](superpowers/plans/p5-codemod-apply.md)

Tasks that need to be formalized:
- `propose_refactor` (proposal-only, no file writes) — ✅ done
- `apply_refactor` with the §4.6 capability-token gate — planned, not implemented
- Pipeline: DRY-RUN → TYPECHECK → TESTS → GIT-clean → commit + reversal patch — planned, not implemented
- Append-only codemod proof artifacts (patch + verification output + rollback patch + originating fingerprint) — planned, not implemented
- Type-safety of generated code when Pass-2 returns non-null types — planned, not implemented

### 2.3 P6 — First framework adapter (Next.js)

Missing plan file: `docs/superpowers/plans/p6-adapter-next.md`

Tasks that need to be formalized:
- `@rai/adapter-next` package scaffold
- `detect()` — Next.js project detection (deps, config, conventions)
- `enrich()` — RSC/client/route tags on frozen RepoGraph (additive, immutable input)
- Variant guard: app-router vs pages-router (see §3.4 below)
- 2–3 Next-specific analyzers: `client-boundary-bloat`, `server-action-in-loop`, `route-coupling`
- CI lint: `grep framework-name packages/core == 0`
- Adapter storage rule enforcement: adapters may not introduce independent persistence

---

## 3. Conceptual gaps — not documented anywhere

These are issues identified in the spec or through architectural review that have no documentation, no plan, and no code stub. They need to be resolved before or during the relevant phase.

### 3.1 `get_drift` requires pre-existing snapshot history

**Problem:** `get_drift` computes comparisons exclusively from the `snapshot` table (spec §5.2 strict source rule). If a repo was never analyzed in prior commits, there is no historical data — the tool cannot backfill history retroactively.

**Impact:** A team adopting RAI mid-project gets no temporal data until they run `analyze_repo` on multiple commits over time. The first months of use produce no drift signal.

**Options to evaluate:**
- Accept the limitation and document it clearly (simplest)
- Add a `rai backfill --from <tag> --to HEAD` command that re-analyzes past commits and populates `snapshot` (expensive but solves cold-start)
- Show "no historical data yet" gracefully in `get_drift` response rather than an error

### 3.2 No threshold calibration mechanism per repo

**Problem:** All repos start with the same defaults (`minCosine=0.75`, `minPropOverlap=0.40`, etc.), calibrated against the MVP fixture suite. A repo with a different component density or naming convention may produce too many or too few findings without the team knowing why.

**Impact:** New adopters have no guidance on whether their threshold configuration is correct. Related to future-ideas §2 (config auto-tuning).

**Options to evaluate:**
- `rai calibrate src/` — analyzes the similarity distribution in the repo and suggests threshold adjustments
- Surface distribution stats in `analyze_repo` output (e.g. "median cosine between all component pairs: 0.43") so teams can self-diagnose
- Document a calibration guide in the README

### 3.3 Analyzer fault containment ✅ crash isolation implemented

**Problem (resolved for thrown analyzers):** The spec states "one analyzer panic ≠ run failure" (STATUS.md P4 list). `analyzer-fault-containment` now catches thrown analyzer errors, emits stable diagnostics, and allows later analyzers to run.

**Remaining limitation:** Hard timeout / worker-level interruptibility is still out of scope. `Promise.race` cannot preempt sync CPU hangs.

**Follow-up:** Add worker isolation only if/when real CPU-hung analyzer interruption becomes required.

### 3.4 Next.js variant guard design not detailed

**Problem:** The spec (§6.5) states that app-router vs pages-router should be treated as different variants, and that a variant mismatch must fail loudly with a diagnostic event — never silently fall back. The adapter contract mentions `supportedVariants` on the `Analyzer` interface, but there is no spec for:
- How `detect()` distinguishes app-router from pages-router
- What the `variant-mismatch` diagnostic event looks like
- Whether a repo can have both (monorepo with mixed Next versions)

**Fix:** Resolve before writing the P6 plan. Decisions here affect the adapter contract and the `detect()` return type.

### 3.5 `reason` field in T4 is inert ✅ FIXED in wire-deferred-mvp-gaps

**Location:** [packages/core/src/mcp/tools.ts](../packages/core/src/mcp/tools.ts)

**Fix applied:** Added `lastReason` to the `memory` object returned by `explainFinding`. It is the `reason` string from the most recent `FeedbackEvent` where `reason !== null` (ordered by `createdAt ASC`, last non-null wins). Returns `null` when no feedback with a reason exists. No MCP server change needed — `server.ts` serializes via `JSON.stringify`.

**Change:** `wire-deferred-mvp-gaps` — branch `feat/rai-mvp-p0-p3`.

### 3.6 Hook coupling conventions ✅ FIXED in `wire-boundary-violation-conventions`

**Fix applied:** Added `conventions[]` config plus `react/boundary-violation`. Teams can now forbid `renders` and `uses-hook` edges with selectors over node kind, name, file, and export kind.

The edges now exist in the graph, metric topology is visible, and team-specific forbidden edges can produce `architectural-conflict` findings.

**Remaining limitation:** Only `renders` and `uses-hook` conventions are supported. `imports`, `calls`, and `passes` convention rules are rejected until those edges are constructed.

**Change:** `wire-boundary-violation-conventions` — branch `feat/rai-mvp-p0-p3`.

---

### 3.7 `passes` edge absent from `EdgeKind` — spec/code divergence

**Location:** [packages/core/src/types.ts](../packages/core/src/types.ts) `EdgeKind` + [packages/core/src/parse/graph-build.ts](../packages/core/src/parse/graph-build.ts)

**Problem:** Spec §2.2 describes a `passes Component → Prop → Component` edge type (prop flow, shallow/syntactic) as part of the RepoGraph. It is not in `EdgeKind`:

```ts
export type EdgeKind = "renders" | "imports" | "calls" | "uses-hook";
// "passes" is absent — spec §2.2 says it should exist
```

`buildGraph` now creates `renders` and `uses-hook` edges. `imports` and `calls` are defined in `EdgeKind` but still not constructed. The `pass1` result includes `imports` but `buildGraph` ignores them.

**Impact:** Prop drilling (same prop passed through N levels without being consumed) is detectable from `passes` edges but can never be analyzed because the edge type doesn't exist. Import/call topology also remains unavailable until those edges are built.

**Fix:** Slice 4 audit decided `uses-hook` was required now and `passes` / import / call edges are deferred until a concrete analyzer needs them. Add `passes` to `EdgeKind` only when prop-flow analysis is scheduled.

---

### 3.8 `renders` graph topology partly analyzed ✅ first slice implemented

**Problem (partly resolved):** `buildGraph` creates `renders` edges (Component A → renders → Component B). `more-analyzers-render-overabstraction` added `react/render-coupling`, which now analyzes fan-in, fan-out, direct children, and reachable render depth from current `renders` edges.

Detectable patterns that are currently invisible:
- **God components by composition** — a component that directly renders 12+ child components (distinct from god components by props, which `over-abstraction` in P4 could detect)
- **Orphan components** — components that are never rendered by anything (candidates for deletion, not extraction)
- **Composition depth** — a render chain of depth 8+ is an architectural signal that the intermediate layers may be candidates for flattening

**Remaining gap:** Orphan component detection and richer topology questions still belong in `query_architecture` or future analyzer slices.

**Fix applied:** `react/render-coupling` uses config thresholds (`maxFanIn`, `maxFanOut`, `maxDirectChildren`, `maxReachableDepth`) and emits metric-only evidence.

---

### 3.9 `exportKind` captured but never used — matters for P5 codemod

**Location:** [packages/core/src/types.ts](../packages/core/src/types.ts) `ComponentNode.exportKind`

**Problem:** `exportKind: "default" | "named" | "none"` is extracted by pass1 and stored in every `ComponentNode`. No analyzer, finding, MCP tool, or codemod plan uses it.

**Impact on P5 (codemod apply):** The complexity of extracting a shared component is fundamentally different depending on `exportKind`:

| exportKind | Extraction cost |
|---|---|
| `none` | Trivial — no existing import sites to update |
| `named` | Must update all `import { Button }` sites |
| `default` | Must update all `import Button` sites, rename conflicts possible |

P5's codemod pipeline doesn't account for this. A codemod generated for a `named`-exported component that's imported in 23 files is categorically harder (and riskier) than one for an unexported component. Without using `exportKind`, the codemod plan treats all cases identically.

**Fix:** Surface `exportKind` in `SharedExtractionEvidence` (it's already available in the `instances` array — just not forwarded). Use it in P5 to estimate codemod complexity and flag high-risk extractions before proposing them.

---

## 4. Missing plan files summary

| Phase | Plan file | Status |
|---|---|---|
| P0–P3 | [docs/superpowers/plans/2026-05-29-rai-mvp-p0-p3.md](superpowers/plans/2026-05-29-rai-mvp-p0-p3.md) | ✅ Exists, all 24 tasks complete |
| P4 | [docs/superpowers/plans/p4-breadth-temporal.md](superpowers/plans/p4-breadth-temporal.md) | ✅ Exists; temporal + `query_architecture` slices complete |
| P5 | [docs/superpowers/plans/p5-codemod-apply.md](superpowers/plans/p5-codemod-apply.md) | ✅ Exists; Slices 1–2 complete |
| P6 | `docs/superpowers/plans/p6-adapter-next.md` | ❌ Missing |

---

## 5. Recommended resolution order

1. ~~**Write the P4 plan**~~ — ✅ complete.
2. ~~**Resolve §3.1 (drift cold-start)**~~ — ✅ complete via explicit `unknown_commit` / `insufficient_history` statuses.
3. ~~**Implement snapshot population + `get_drift`**~~ — ✅ complete.
4. ~~**Implement `query_architecture`**~~ — ✅ complete for current render graph facts.
5. ~~**Wire lazy ts-morph Pass-2** (§1.2)~~ — ✅ complete.
6. ~~**Implement `boundary-violation` / conventions**~~ — ✅ complete for `renders` / `uses-hook`.
7. ~~**Write the P5 codemod-apply plan**~~ — ✅ complete.
8. ~~**Implement P5 Slice 1**~~ — ✅ complete: proposal contract + shared-extraction evidence readiness.
9. ~~**Implement P5 Slice 2**~~ — ✅ complete: `propose_refactor` MCP tool over the pure proposal builder.
10. **Implement P5 Slice 3** — capability-token gate for apply, without applying code yet.
11. **Resolve §3.4 (Next.js variant guard design)** before P6 adapter planning.

---

## 6. Feedback friction — explicit session closure capture ✅ implemented

**Severity (resolved): Critical.** This was the single highest-impact gap in RAI. `close-session-feedback` added explicit closure capture without allowing inferred feedback writes.

### The problem

`record_feedback` is the only write path into T4 — by design. But it requires an explicit, intentional call. In practice, most architectural decisions happen implicitly in conversation:

- Dev says *"not now"* when the agent presents a finding → decision exists in conversation, RAI never learns it
- Next session: RAI re-surfaces the same finding → agent has to explain it again → friction accumulates
- Over time: T4 stays empty → T5 weights are all zero → the suppress/amplify overlay provides no value → team stops trusting RAI

This problem exists regardless of what external memory system is in use (Engram, Claude Projects, Cursor rules, etc.). It is a gap in RAI itself.

T4 is the source of truth for architectural memory. If it stays empty because recording decisions is too hard, the entire memory layer — T5 weights, suppress/amplify overlay, drift suppression, `get_drift` temporal reasoning — provides zero value. Feedback friction is not a convenience issue; it is the difference between a memory system that works and one that is theoretically correct but practically unused.

### Why the obvious fix breaks the integrity model

The intuitive solution — let the agent infer verdicts from conversation and write them to T4 automatically — violates RAI's core invariant:

> *"LLM writes nothing to findings; only to T4 feedback via explicit tools"*

An implicit feedback tier where the agent infers "wontfix" from "not now" introduces:
- **Misinterpretation risk** — "not now" ≠ "wontfix". The agent may encode the wrong verdict.
- **Auditability loss** — T4 contains signals nobody consciously declared. The audit trail becomes untrustworthy.
- **Replay non-determinism** — same code + same `asOf` may produce different T5 if inference differed between sessions.

### The implemented solution: `close_session` MCP tool

The core insight is: **reduce friction, not remove the explicit call**. The human must still decide — but the agent prompts them at the right moment and makes one word sufficient.

A `close_session` tool was added to the MCP layer. The agent can call it at the end of any session where findings were discussed:

```
Agent → close_session({ discussed: ["fp-a1b2c3", "fp-d4e5f6"] })

RAI → {
  prompt: "You discussed 2 findings this session:",
  items: [
    { fingerprint: "fp-a1b2c3", summary: "CtaButton/LoginButton/SignupBtn similarity (warn)" },
    { fingerprint: "fp-d4e5f6", summary: "CheckoutForm/AuthForm similarity (info)" }
  ],
  question: "Did you decide on any? accept / reject / wontfix / skip"
}
```

Developer responds in one line per finding. RAI calls `record_feedback` with `source: "human"` for each confirmed decision. Nothing is inferred — the human still decides, they are just prompted at closure rather than in the moment.

**Why this preserves the integrity model:**
- LLM is not authoring a verdict — it is triggering a structured prompt
- The human still explicitly declares each decision
- `source: "human"` credibility is maintained — no agent-inference leak
- T4 remains auditable: every weight traces to a conscious human decision
- No schema changes needed — T4 already has all required fields

**Why this is the single highest-value change:**

Without it: RAI detects → agent narrates → developer decides in conversation → decision disappears  
With it: RAI detects → agent narrates → developer decides → `close_session` captures → decision lives in T4 → next session the finding is suppressed

That last step is what AGENTS.md cannot do at scale, what code-review-graph does not do, and what graphify does not do. It is RAI's moat made practical.

### Secondary mechanisms (complementary, not replacements)

**Conversational shortcuts for unambiguous in-session verdicts:**

```
dev: "wontfix this"    → agent calls record_feedback(verdict: "wontfix", source: "human")
dev: "accept"          → idem
dev: "ignore for now"  → idem with verdict: "dismiss"
```

Only when intent is unambiguous and the developer is already engaged with the finding. Never inferred retroactively.

### What was implemented

- `close_session` MCP tool in `packages/core/src/mcp/tools.ts` reads current `lastPresented`, returns structured prompt items, accepts explicit `decisions[]`, and calls `FeedbackStore.record()` only for known current findings.
- No schema changes to T4.
- No changes to the integrity model.
- No inferred agent feedback writes.

---

## 7. Repo workflow gaps — partly resolved

**Resolved:**
- GitHub remote exists: `https://github.com/pavp/react-architecture-intelligence`.
- CI workflow exists: `.github/workflows/ci.yml` runs `pnpm build`, `pnpm test`, and `pnpm typecheck`.
- PR template exists: `.github/PULL_REQUEST_TEMPLATE.md`.

**Still missing:**
- Commitlint and husky.
- PR title validation workflow.
- Release workflow and publishing strategy.
- CONTRIBUTING and RELEASING docs.
