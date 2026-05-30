# RAI — Known Gaps & Missing Documentation

> Compiled from architectural review on 2026-05-30. Gaps are organized by layer: code-level stubs, missing plans, and unresolved conceptual issues.

---

## 1. MVP gaps — marked in code, no formal plan

These are deferred features inside the already-completed P0–P3 scope. They are documented as inline comments in the source but have no corresponding plan file or executable task list.

### 1.1 `boundary_rule` → `architectural-conflict` never fires

**Location:** [packages/core/src/analyzers/shared-extraction.ts](../packages/core/src/analyzers/shared-extraction.ts) line 44
```ts
// boundary check is a P4 feature (boundary_rule table empty in MVP) → always opportunity
```
**Impact:** The `boundary_rule` table exists in the schema and T5 has rows for it, but `shared-extraction` always emits `opportunity` regardless of boundary violations. The `architectural-conflict` finding type is never produced.

**Fix:** Wire `ctx.boundaryRules` in `shared-extraction.ts` and populate `boundary_rule` rows from config. Defined in spec §4.4.

---

### 1.2 `typeOf()` always returns null (Pass-2 not wired)

**Location:** [packages/core/src/engine/pipeline.ts](../packages/core/src/engine/pipeline.ts) line 45
```ts
types: { typeOf: () => null }, // lazy Pass-2 wired in P4
```
**Impact:** All type-level analysis is unavailable. Analyzers that call `ctx.typeOf(span)` always get `null`. This also blocks the learned-embedding work (§future-ideas §5) since richer type information is a prerequisite.

**Fix:** Wire ts-morph lazy Pass-2 in `pipeline.ts`. Contract defined in spec §2.1.

---

### 1.3 Config severity-clamp is identity in overlay

**Location:** [packages/core/src/memory/overlay.ts](../packages/core/src/memory/overlay.ts) line 7
```ts
const severity: Severity = f.severityRaw; // config severity-clamp is a P4 knob; identity here
```
**Impact:** The `clampSeverity(f.severity_raw, cfg)` function described in spec §3.4 does nothing — severity is always passed through unchanged. Teams cannot remap severity levels via config.

**Fix:** Implement `clampSeverity` using the config severity-map knobs. Spec §3.4 defines the contract.

---

### 1.4 KI-1 — Non-component capitalized functions → false positives

**Location:** [packages/core/src/parse/pass1.ts](../packages/core/src/parse/pass1.ts) line ~10 (`COMPONENT_NAME = /^[A-Z]/`)

**Impact:** Next.js route handlers (`GET`, `POST`, `PUT`, `DELETE`) are capitalized functions that are not React components. Pass-1 treats them as components, they all get the same empty structural fingerprint, and `shared-extraction` fires a false positive at cosine 1.0.

**Reproduced in field:** `scaffold-nextjs-app/src` (477 files) → 1 true positive + 1 false positive (route handlers).

**Fix options:**
- **Preferred (B):** Add `returnsJsx: boolean` flag during AST walk in `pass1.ts`. Skip components where `returnsJsx === false`. Route handlers never enter the graph.
- **Alternative (A):** Cardinality floor in the analyzer — treats the symptom, not the cause.
- **Alternative (C):** `excludeGlob` config — hides Next handlers but leaves the gap for other frameworks.

**Documented in:** [docs/superpowers/STATUS.md](superpowers/STATUS.md) under "Known issues → KI-1".

---

## 2. P4–P6 gaps — listed in STATUS.md, no executable plan

The [docs/superpowers/STATUS.md](superpowers/STATUS.md) lists these under "Next steps" and explicitly states each should get its own plan file. None exist yet.

### 2.1 P4 — Breadth + temporal

Missing plan file: `docs/superpowers/plans/p4-breadth-temporal.md`

Tasks that need to be formalized:
- Fix KI-1 (1.4 above) — first task of P4
- Wire `typeOf()` Pass-2 (1.2 above)
- Wire `boundary_rule` → `architectural-conflict` (1.1 above)
- Wire config severity-clamp in overlay (1.3 above)
- Populate `snapshot` table on each analysis run
- Implement `get_drift` MCP tool (pure SQL set-algebra over snapshots — spec §3.5/§5.2)
- Implement `query_architecture` MCP tool (enumerated graph questions, bounded CTEs — spec §5.2)
- Add more analyzers: `coupling`, `hook-topology`, `over-abstraction`, `boundary-violation`
- Analyzer fault containment: per-analyzer timeout + crash isolation (see §3 below)
- Band C MCP tools: `get_node`, `raw_graph_query` (spec §5.4)

Exit criteria (to be defined in the plan): same format as P0–P3 plan checkboxes.

### 2.2 P5 — Codemod apply

Missing plan file: `docs/superpowers/plans/p5-codemod-apply.md`

Tasks that need to be formalized:
- `propose_refactor` (proposal-only, no file writes)
- `apply_refactor` with the §4.6 capability-token gate
- Pipeline: DRY-RUN → TYPECHECK → TESTS → GIT-clean → commit + reversal patch
- Append-only codemod proof artifacts (patch + verification output + rollback patch + originating fingerprint)
- Type-safety of generated code when Pass-2 returns non-null types

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

### 3.3 Analyzer fault containment not implemented

**Problem:** The spec states "one analyzer panic ≠ run failure" (STATUS.md P4 list) but there is no timeout, try/catch isolation, or crash boundary around individual analyzer execution in `pipeline.ts`. A hung or throwing analyzer currently fails the entire run.

**Impact:** As more analyzers are added in P4, a bug in one analyzer silently breaks all analysis.

**Fix:** Wrap each `analyzer.analyze(ctx)` call in an isolated try/catch with a configurable timeout. Emit a `diagnostic` event on failure rather than propagating the error. Log the failure with enough context to debug.

### 3.4 Next.js variant guard design not detailed

**Problem:** The spec (§6.5) states that app-router vs pages-router should be treated as different variants, and that a variant mismatch must fail loudly with a diagnostic event — never silently fall back. The adapter contract mentions `supportedVariants` on the `Analyzer` interface, but there is no spec for:
- How `detect()` distinguishes app-router from pages-router
- What the `variant-mismatch` diagnostic event looks like
- Whether a repo can have both (monorepo with mixed Next versions)

**Fix:** Resolve before writing the P6 plan. Decisions here affect the adapter contract and the `detect()` return type.

### 3.5 `reason` field in T4 is inert

**Problem:** `record_feedback` accepts a `reason` string that is stored in T4 but never surfaced back. `explain_finding` does not include it, there is no search over it, and no inspection tool shows it.

**Impact:** Narrative context about why a finding was rejected is lost from the user-facing layer. This is the main advantage Engram has over RAI's memory system (see future-ideas §9).

**Fix:** Surface `reason` in `explain_finding` response under `memory.lastReason`. Make it part of any future `rai memory` inspection surface. No schema change needed — the data is already being collected.

### 3.6 Hook coupling conventions — edges planned but no config mechanism

**Problem:** The spec (§2.2) defines `uses-hook Hook → Hook` edges so RAI can trace hook composition chains. In P4, `buildGraph` will create these edges. But there is no config mechanism to declare forbidden or required hook dependency patterns — no way to say "useCheckout must not depend on useCart directly".

The edges will exist in the graph. The `Analyzer` interface supports pure graph traversal. But without a `conventions[]` config knob for edge patterns, the data is invisible to any finding.

**Impact:** Hook coupling is architecturally meaningful (a hook that transitively depends on 5 other hooks is harder to maintain and test), but it produces no finding. The entire `uses-hook` edge type is inert from a detection standpoint until conventions are wired. This is the same mechanism as §1.1 (boundary_rule for components) — a feature that needs to be implemented before the graph data is useful.

**Fix:** Implement the team-defined convention analyzer (future-ideas §1) before or during P4. The `uses-hook` edge case should be a first-class example in the convention config schema.

---

### 3.7 `passes` edge absent from `EdgeKind` — spec/code divergence

**Location:** [packages/core/src/types.ts](../packages/core/src/types.ts) `EdgeKind` + [packages/core/src/parse/graph-build.ts](../packages/core/src/parse/graph-build.ts)

**Problem:** Spec §2.2 describes a `passes Component → Prop → Component` edge type (prop flow, shallow/syntactic) as part of the RepoGraph. It is not in `EdgeKind`:

```ts
export type EdgeKind = "renders" | "imports" | "calls" | "uses-hook";
// "passes" is absent — spec §2.2 says it should exist
```

`buildGraph` also only creates `renders` edges today — `imports`, `calls`, and `uses-hook` are defined in `EdgeKind` but never constructed. The `pass1` result includes `imports` but `buildGraph` ignores them.

**Impact:** Prop drilling (same prop passed through N levels without being consumed) is detectable from `passes` edges but can never be analyzed because the edge type doesn't exist. More broadly, three of the four `EdgeKind` types are phantom — defined but never built.

**Fix:** Before P4, audit which edge types are needed for which P4 analyzers and add construction logic to `buildGraph` for each. Add `passes` to `EdgeKind` or decide to remove it from the spec if not planned.

---

### 3.8 `renders` graph topology captured but never analyzed

**Problem:** `buildGraph` creates `renders` edges (Component A → renders → Component B). These are in the RepoGraph, visible to all analyzers. But no analyzer in any phase plan uses the renders graph topology.

Detectable patterns that are currently invisible:
- **God components by composition** — a component that directly renders 12+ child components (distinct from god components by props, which `over-abstraction` in P4 could detect)
- **Orphan components** — components that are never rendered by anything (candidates for deletion, not extraction)
- **Composition depth** — a render chain of depth 8+ is an architectural signal that the intermediate layers may be candidates for flattening

**Impact:** The most structurally informative edges in the graph (who renders what) produce no findings. A new analyzer (`renders-topology`) is needed in P4 to make this data useful.

**Fix:** Add `renders-topology` to the P4 analyzer list. Define thresholds in config (e.g., `maxDirectChildren`, `maxRenderDepth`). The edge data already exists — only the analyzer is missing.

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
| P4 | `docs/superpowers/plans/p4-breadth-temporal.md` | ❌ Missing |
| P5 | `docs/superpowers/plans/p5-codemod-apply.md` | ❌ Missing |
| P6 | `docs/superpowers/plans/p6-adapter-next.md` | ❌ Missing |

---

## 5. Recommended resolution order

1. **Fix KI-1** (§1.4) — blocks real-world Next.js usage today. Smallest code change in P4.
2. **Write the P4 plan** — formalizes the 10+ known tasks into executable checkboxes with exit criteria.
3. **Resolve §3.1 (drift cold-start)** and **§3.4 (variant guard design)** — both are decisions that affect the P4/P6 plan structure. Decide before writing those plans.
4. **Fix §3.5 (`reason` as first-class)** — low effort, high value, no architectural change needed.
5. **Fix §1.1, §1.2, §1.3** — straightforward wiring tasks, first tasks of P4.
6. **Fix §3.3 (analyzer fault containment)** — implement as part of P4 alongside new analyzers.
7. **Implement `close_session`** (§6) — the single highest-impact change. Implement before P4 ships to users. Required for the memory layer to provide practical value.

---

## 6. Feedback friction — implicit decisions are never captured

**Severity: Critical.** This is the single highest-impact gap in RAI. Without solving it, the memory layer has no practical value regardless of how correct the architecture is.

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

### The recommended solution: `close_session` MCP tool

The core insight is: **reduce friction, not remove the explicit call**. The human must still decide — but the agent prompts them at the right moment and makes one word sufficient.

A `close_session` tool is added to the MCP server. The agent calls it at the end of any session where findings were discussed:

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

### What this requires to implement

- `close_session` MCP tool in `packages/core/src/mcp/tools.ts` — reads session's `lastPresented`, returns structured prompt, accepts confirmed verdicts, calls `FeedbackStore.record()` for each
- Agent routing rule in `AGENTS.md`: call `close_session` at the end of any session where `analyze_repo` or `find_shared_opportunities` was called
- No schema changes to T4
- No changes to the integrity model
