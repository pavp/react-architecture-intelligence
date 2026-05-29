# React Architecture Intelligence (RAI) — Design Spec

**Date:** 2026-05-29
**Status:** Approved design (pre-implementation)
**Type:** Backend intelligence layer for AI agents (Claude Code) via MCP

> A deterministic React architecture engine that produces **structured findings + persistent architectural memory**, exposed over MCP, so Claude Code reasons and narrates over truth it did not have to guess.

---

## Table of contents

1. [System shape & integrity model](#1-system-shape--integrity-model)
2. [Engine internals](#2-engine-internals)
3. [Architectural Memory Layer](#3-architectural-memory-layer)
4. [Killer analyzer — shared-component extraction](#4-killer-analyzer--shared-component-extraction)
5. [MCP tool surface](#5-mcp-tool-surface)
6. [Framework-adapter architecture](#6-framework-adapter-architecture)
7. [MVP roadmap / phasing](#7-mvp-roadmap--phasing)
8. [Risks / tradeoffs / scalability / performance](#8-risks--tradeoffs--scalability--performance)

---

## 1. System shape & integrity model

### 1.1 Thesis

A deterministic React architecture engine that produces **structured findings + persistent architectural memory**, exposed over MCP, so Claude Code reasons and narrates over truth it did not have to guess. The platform does **not** compete with Claude Code — it potentiates it. Claude is the orchestration/reasoning layer; RAI provides deterministic analysis, repository intelligence, AST understanding, heuristics, structural findings, and safe refactor capabilities.

### 1.2 The integrity model **is** the product

Not a detail — the central thesis. One-directional, never inverts.

```
┌──────────────────────────────────────────────────────────────────────┐
│ RAI INTEGRITY MODEL  (one-directional · never inverts)                  │
├──────────────────────────────────────────────────────────────────────┤
│ CODE     = source of structural truth                                   │
│            deterministic analyzers over RepoGraph; same in ⇒ same out   │
│ CONFIG   = parameterization of deterministic rules                      │
│            typed knobs: thresholds, boundary globs, severity clamps     │
│ FINDINGS = immutable derived truth — versioned, fingerprinted           │
│            append-only; never mutated, only superseded by new version   │
│ MEMORY   = weighted aggregation of past findings + feedback signals     │
│            decision-weights over fingerprints; read-time overlay        │
│ LLM      = reasoning layer over findings only — no write-back authority │
│            narrates/prioritizes/orchestrates; may emit weak feedback    │
│            signal, may NEVER author or mutate a finding                  │
└──────────────────────────────────────────────────────────────────────┘
        flow: CODE → FINDINGS → (CONFIG clamp · MEMORY weight) → LLM
        feedback: LLM/human → weight nudge → MEMORY  (never → FINDINGS)
```

**Read-path:** analyzers write immutable findings; config + memory are **read-time overlays** (clamp severity, apply weight) that never mutate the artifact; LLM consumes the overlaid view; feedback flows back only as weights. Every store has exactly one writer; write directions never cross. That is the determinism guarantee made physical.

### 1.3 Three leak-invariants (where strict hierarchies rot)

1. **Severity is computed by CODE, clamped by CONFIG, immutable to the LLM.** Analyzer emits raw severity from structural facts; config may remap; the LLM may reorder *presentation* but the stored `severity` field is immutable to it.
2. **The LLM's output is never written back into any tier.** Claude's explanations/priorities/proposals live in the conversation, not the Memory DB. The only mutation into Judgment/Memory is an explicit feedback event routed through a tool — a deterministic write triggered by a person (strong) or a cross-run agent signal (weak), never the model's prose.
3. **Semantic similarity (embeddings) is tier-1 evidence, not tier-3 judgment.** Embeddings are deterministic given a fixed model + fixed code → they feed an analyzer that applies a hard cosine threshold from CONFIG. The *decision* is a deterministic predicate; the LLM only narrates.

### 1.4 Findings are immutable artifacts (keystone)

**Findings are immutable, versioned, fingerprinted artifacts derived from deterministic analyzers. Never mutated — only superseded.** Re-analysis emits a *new* finding version (same fingerprint, new `analysis_version`); the old row stays. This is what makes temporal reasoning work (drift = diffing finding-versions over time) and what lets severity-clamp (config) and weight (memory) be read-time overlays rather than writes. The `finding` table is **append-only**.

### 1.5 System diagram

```
        Claude Code / AI Agent          ← reasons, narrates, orchestrates (tier 3)
                  │  MCP (stdio/JSON-RPC)
        ┌─────────▼──────────┐
        │   MCP Server       │           coarse verb-tools + escape-hatch primitives
        └─────────┬──────────┘
        ┌─────────▼─────────────────────────────────────────┐
        │        React Intelligence Engine                   │
        │                                                    │
        │  Analyzers (registry) ──reads──▶ Config (tier 2)   │
        │       │ Finding[]                                  │
        │  ┌────▼─────┐  ┌──────────────┐  ┌──────────────┐  │
        │  │ RepoGraph│  │ Architectural│  │ Codemod      │  │
        │  │ (struct) │  │ Memory Layer │  │ (propose→gate)│ │
        │  └────┬─────┘  └──────┬───────┘  └──────────────┘  │
        └───────┼───────────────┼───────────────────────────┘
        ┌───────▼─────┐  ┌──────▼────────────────────────┐
        │ Pass1: oxc  │  │ SQLite + sqlite-vec            │
        │ Pass2: lazy │  │ T1 struct·T2 vec (gitignored)  │
        │ ts-morph    │  │ T3 finding·T4 fb·T5 weight     │
        └─────────────┘  └───────────────────────────────┘
```

**Foundational decisions baked in:** two-parser hybrid sharing only byte-ranges (oxc structural / lazy shared ts-morph Program semantic); 3-tier persistence (struct+vec cache gitignored, judgment committed); Architectural Memory = a faculty (recall · recognize · remember · reason-over-time); fingerprint-keyed findings (survive refactor — the #1 risk).

---

## 2. Engine internals

### 2.1 Two-pass parser, byte-range contract

```
FILE (utf-8 bytes)
  │
  ├─ PASS 1 — STRUCTURAL  (every file, no types, cheap, cacheable)
  │    oxc-parser → AST walk → emit position-stable facts only
  │    NEVER stores AST nodes. Stores: {file, [start,end), kind, astPath, meta}
  │    content_hash(file) → skip if unchanged (incremental)
  │    OUT: RepoGraph rows (serializable, → SQLite T1)
  │
  └─ PASS 2 — SEMANTIC  (lazy, only flagged ranges, type-aware)
       ONE shared ts.Project, addSourceFileAtPath on demand
       resolve byte-range → node via best-enclosing-node (see 2.1.1)
       OUT: TypeInfo (real prop types, generic hook returns, symbol id)
```

**Pass-1 purity invariant:** Pass-1 output MUST be a pure function of `content_hash(file)` alone — no dependency on prior AST state, prior graph, or prior run. `pass1(bytes) → Span[]`, nothing else in scope. This makes the T1 cache a pure memoization (`content_hash → rows`), so a from-scratch rebuild is provably identical to an incremental one (testable: rebuild-equivalence test).

**The contract** — the two parsers share **coordinates, never objects**:

```ts
// The ONLY currency between Pass 1 and Pass 2. Parser-agnostic.
interface Span {
  file: string;
  start: number;     // byte offset
  end: number;
  kind: SyntaxKindTag;
  astPath: string;   // structural index, e.g. "module>fn[2]>jsx>child[0]" — position-independent
}
```

**Hard rule:** any code edit invalidates Spans for that file → codemod apply MUST re-run Pass 1 on touched files before any downstream Span is trusted. Stored Spans carry their `content_hash`; a Span whose file hash drifted is *stale*, not wrong — recompute.

#### 2.1.1 Pass-2 resolution (best-enclosing-node, not exact position)

`getDescendantAtPos(start)` can land in whitespace/comments/JSX-text. Resolve by **best enclosing syntactic node of the expected kind**, with an `astPath` fallback:

```ts
function resolve(span: Span, expect: SyntaxKind): Node {
  const sf = program.getSourceFileAtPath(span.file);
  let n = sf.getDescendantAtPos(span.start) ?? sf.getDescendantAtPos(span.start + 1);
  while (n && n.getKind() !== expect && n.getStart() >= span.start - SLOP) n = n.getParent();
  if (!n || n.getKind() !== expect) return resolveByAstPath(span); // structural fallback
  return n;
}
```

Two independent locators: positional fast-path + structural (`astPath`) fallback. `astPath` is more transform-resilient than byte offsets (survives edits elsewhere in the file).

### 2.2 RepoGraph — what Pass 1 extracts

```
NODES
  Component { id, name, span, kind: fn|class|memo|forwardRef|arrow, file, export_kind }
  Hook      { id, name, span, custom: bool, component_id? }        // useX call sites
  Module    { id, file, content_hash }

EDGES  (directed, typed)
  renders   Component ──▶ Component     // <Child/> in JSX of parent
  imports   Module    ──▶ Module
  calls     Component ──▶ Hook          // component invokes hook
  uses-hook Hook      ──▶ Hook          // hook composes hook
  passes    Component ──▶ Prop ──▶ Component   // prop flow (shallow, syntactic)

PROPS  (filled lazily by Pass 2 when an analyzer needs real types)
  Prop { component_id, name, ts_type?, optional, span }            // ts_type null until escalation
```

Stored as relational rows (not a graph lib) — SQLite tables, edges `(src_id, dst_id, kind)`. Graph traversals = recursive CTEs. Supports fan-in/fan-out/reachability without an embedded graph DB in v1.

### 2.3 Fingerprint algorithm (the #1 risk, designed explicitly)

Findings/memory key on fingerprint, **never file:line** (line shifts every edit → memory evaporates).

**Layered fingerprint — coarse-to-fine, so memory degrades gracefully:**

```ts
interface Fingerprint {
  structural: string;  // PRIMARY recognition key. Survives rename/move/reformat.
  nominal:    string;  // hash(componentName + moduleBasename). Tiebreaker.
  positional: string;  // hash(file + exportName). Weakest, fresh-finding fallback.
}
```

**Formal `structural` definition** — `hash(normalize(...))` over exactly:

```
- JSX child component set          (normalized, order-insensitive)
- hook invocation set              (order-insensitive)
- render-time composition markers  (HOC wrapper, memo, forwardRef, lazy)
- prop name set                    (NOT types — Pass-1 only)
- JSX conditional-branch markers   (ternary/&&/switch in render → presence, not content)
```

`structural` deliberately **excludes** prop *types* (no type escalation needed to fingerprint) and the implementation **body** (so internal edits don't churn identity). It keys on *shape* — what "is this the same component?" means architecturally. HOC/memo/forwardRef markers prevent identity-fork on wrapper add/remove (recorded as a rename-class event, not a new entity). Conditional-branch markers prevent two structurally-different renders from colliding.

**Collision is a signal, not an accident:** two genuinely-distinct components with identical shape collide on `structural`, disambiguated by `nominal`. If *both* match → they are, by every structural measure, the same component duplicated — which is itself a shared-extraction finding.

### 2.4 AnalysisContext — the one seam analyzers + adapters implement

```ts
interface AnalysisContext {
  graph: RepoGraph;              // T1 structural facts (this commit), FROZEN
  memory: MemoryReader;          // recall + recognize(fingerprint) + weights (read-only)
  similarity: SimilarityIndex;   // sqlite-vec kNN, deterministic given fixed model
  config: ResolvedConfig;        // T2 knobs, pre-merged + zod-validated
  typeOf(span: Span): TypeInfo;  // lazy Pass-2 escalation, memoized per analyzer
  embeddingModelVersion: string; // pinned — see §2 model-version locking
}

interface Analyzer {
  ruleId: string;                          // "react/shared-extraction" — stable, versioned
  framework: FrameworkId;                  // adapter ownership (react | next | …)
  configSchema: ZodSchema;                 // tier-2 contract this rule reads
  supportedVariants?: string[];            // framework variant guard (see §6)
  crossBoundary?: boolean;                 // default FALSE — adapter isolation (see §6)
  analyze(ctx: AnalysisContext): Finding[]; // PURE. deterministic. no I/O, no writes.
}
```

`analyze` is **pure + side-effect-free** — no DB writes, no file reads, no randomness, no clock, no network. Same `ctx` ⇒ same `Finding[]`. The analyzer *cannot* cheat because it has no write handle. **Analyzer isolation:** all analyzers run against an immutable, frozen snapshot of `AnalysisContext` (`Object.freeze`'d, read-only views); `typeOf()` writes only to a per-analyzer memo. This is what makes parallel execution safe.

### 2.5 Engine pipeline

```
analyzeRepo(commit?):
  1. checkout(commit) if temporal snapshot requested        ← enables drift reasoning
  2. discover files → diff content_hash vs T1 → dirty set
  3. PASS 1 on dirty files → upsert RepoGraph (T1)
  4. embed new/changed components → sqlite-vec (T2)         ← deterministic, fixed model
  5. build AnalysisContext (frozen snapshot)
  6. for each registered Analyzer: findings += analyze(ctx) ← pure, parallelizable
  7. fingerprint each finding → RECONCILE vs prior (see table below)
  8. apply read-time overlays for the response:
       config clamp(severity) · memory weight(fingerprint)  ← never mutates finding row
  9. return overlaid Finding[] (engine), or hand to MCP layer
```

Steps 1–4 = stateful engine (writes T1/T2). Step 6 = pure analyzers. Steps 7–9 = engine runner (writes append-only findings, reads memory). The pure/impure boundary sits exactly at `analyze()`.

#### 2.5.1 Reconciliation decision table

```
RECONCILE(newFinding, priorFindings):
  s = structuralMatch(new, prior)   // 0..1, set-similarity over the 5 structural components
  n = nominalMatch(new, prior)      // exact | mismatch
  e = embeddingSim(new, prior)      // sqlite-vec cosine, 0..1

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ s ≥ T_same (0.95)  ∧  n = exact          → SAME ENTITY                     │
  │     → supersede: finding vN, carry fingerprint + memory weights           │
  │ s ≥ T_same (0.95)  ∧  n = mismatch        → RENAME EVENT                   │
  │     → carry weights, log rename, update nominal                           │
  │ T_div ≤ s < T_same (0.80–0.95)            → SAME ENTITY, EVOLVED           │
  │     → supersede, carry weights, mark structural-drift on the entity       │
  │ s < T_div (0.80)  ∧  e ≥ T_embed (0.92)   → CANDIDATE MERGE  ⚠ needs review│
  │     → DO NOT auto-carry. Emit as a finding for human/agent decision.       │
  │ s < T_div  ∧  e < T_embed                  → NEW ENTITY                     │
  │     → insert finding v1, fresh fingerprint, no memory                     │
  └─────────────────────────────────────────────────────────────────────────┘
  // thresholds live in CONFIG (tier 2) — tunable, not hardcoded.
```

**Key decision:** medium-structural + high-embedding ≠ auto-merge. That is a *candidate* requiring review, never a silent memory carry-over. Ambiguity becomes an explicit finding, never a silent guess.

#### 2.5.2 Cumulative-drift revalidation

Fingerprint identity is **not** globally persistent across analysis versions. Per-step "same" can mask accumulated drift (3%/version × 20 versions = 60% different). Track **cumulative drift from the identity-anchor**:

```ts
entity.anchor_structural   // structural hash AT last revalidation
entity.cumulative_drift    // 1 − similarity(current, anchor), accrued across versions
// when cumulative_drift > T_revalidate (config): FREEZE carry-over.
//   → emit a REVALIDATION finding: "entity X drifted 0.6 from anchor — confirm identity?"
//   → memory weights HELD (not applied, not discarded) pending human/cross-run confirm.
//   → on confirm: reset anchor + cumulative_drift=0, weights resume.
//   → on reject: fork new entity identity, old weights stay with old anchor.
```

### 2.6 Embedding model-version locking

`embedding_model_version` is part of the RepoGraph/Memory schema version. A vector is only comparable to another from the *same* model version. Schema carries it; a model-version bump = schema migration = full re-embed (T2 invalidated, T1 untouched). Stored as `embedding(component_id, model_version, vec)`; queries filter on current model_version; an old-version row is *stale*, recompute. Without this, upgrading the embedding model silently shifts every cosine distance → reconciliation flips → memory becomes non-deterministic across tool versions.

---

## 3. Architectural Memory Layer

**Definition:** Architectural Memory = persistent, decision-weighted knowledge derived from repeated findings + user/agent feedback, used to adjust future scoring and recommendations. Not a fact store — **weights over fingerprints**. Findings stay immutable; memory is a read-time overlay.

**A faculty over the substrate** (SQLite holds bytes; the layer adds capability):

```
RECALL            ask structural questions, get answers (graph traversal, not a SELECT)
RECOGNIZE         identity across change (fingerprint resolution — the hard problem)
REMEMBER          decisions survive re-analysis (the moat)
REASON-OVER-TIME  architectural drift as first-class data (temporal deltas across snapshots)
```

### 3.1 The 5 stores — writers, mutability, git status

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STORE              WRITER           MUTABILITY      GIT        ROLE             │
├──────────────────────────────────────────────────────────────────────────────┤
│ T1 repograph       Pass-1 runner    upsert-by-hash  ignored    structural cache│
│ T2 embedding       embed runner     upsert-by-hash  ignored    semantic cache  │
│ T3 finding         engine runner    APPEND-ONLY     ignored*   immutable truth │
│ T4 feedback_event  MCP/human action APPEND-ONLY     committed  raw signal log  │
│ T5 weight          memory reducer   recomputed      committed  derived overlay │
└──────────────────────────────────────────────────────────────────────────────┘
  * findings are regenerable from code+analyzers → cache. Committed only if cross-machine
    finding history without re-analysis is wanted. Default: ignored, rebuildable.
  snapshot (temporal index)  engine  append-per-commit  ignored*  derived from T3 (see 3.5)
```

**T4 is append-only raw signal (an event log); T5 is a deterministic reduction of T4.** You never write a weight directly — you append a feedback event, the reducer recomputes. Memory is *auditable* (every weight traces to its events) and *reproducible* (replay T4 → identical T5). T4 is the source of truth for memory; T5 is its materialized view. `snapshot` is likewise a derived materialized view of T3 (not an independent source of truth, not human-authored, regenerable from finding history).

### 3.2 Schema

```sql
-- T3: immutable findings — append-only, versioned, fingerprinted
CREATE TABLE finding (
  id              TEXT PRIMARY KEY,        -- ulid
  fingerprint     TEXT NOT NULL,           -- structural|nominal|positional
  rule_id         TEXT NOT NULL,
  type            TEXT NOT NULL,           -- opportunity | architectural-conflict
  analysis_version INTEGER NOT NULL,       -- bumps on supersede; old rows retained
  fp_algo_version INTEGER NOT NULL,        -- §7 schema evolution: which fp algorithm
  producing_run_id TEXT NOT NULL,          -- §3.6 anti-self-loop
  commit_sha      TEXT NOT NULL,
  severity_raw    TEXT NOT NULL,           -- computed by CODE, immutable
  evidence_json   TEXT NOT NULL,           -- structural proof (edges, counts, spans)
  created_at      INTEGER NOT NULL
);                                         -- NO severity_final, NO weight, NO prose

-- T4: raw feedback events — append-only, committed, memory source-of-truth
CREATE TABLE feedback_event (
  id           TEXT PRIMARY KEY,           -- ulid (sortable = temporal order)
  fingerprint  TEXT NOT NULL,              -- what this is feedback ABOUT (not finding.id!)
  rule_id      TEXT NOT NULL,
  verdict      TEXT NOT NULL,              -- accept | reject | wontfix | confirm | dismiss
  source       TEXT NOT NULL,              -- human | agent  (weight differs)
  origin_run_id TEXT,                      -- run that EMITTED feedback (anti-self-loop)
  weight_hint  REAL,
  reason       TEXT,                        -- freeform human note (NOT consumed by logic)
  commit_sha   TEXT,
  created_at   INTEGER NOT NULL
);

-- T5: derived weights — recomputed from T4, committed materialized view
CREATE TABLE weight (
  fingerprint  TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  value        REAL NOT NULL,              -- −1..+1  (−1 suppress, +1 amplify)
  confidence   REAL NOT NULL,              -- 0..1, grows with event count + recency
  event_count  INTEGER NOT NULL,
  last_event   INTEGER NOT NULL,
  config_version TEXT NOT NULL,            -- §5/§7 determinism: which config produced this
  computed_as_of INTEGER NOT NULL,         -- explicit time anchor (not wall-clock)
  PRIMARY KEY (fingerprint, rule_id)
);

CREATE TABLE boundary_rule (
  id TEXT PRIMARY KEY, from_glob TEXT, to_glob TEXT,
  kind TEXT,           -- forbid-import | forbid-render | allow-only
  reason TEXT
);

CREATE TABLE snapshot (
  commit_sha TEXT, fingerprint TEXT, rule_id TEXT,
  severity_raw TEXT, evidence_digest TEXT, created_at INTEGER,
  PRIMARY KEY (commit_sha, fingerprint, rule_id)
);
```

**`fingerprint` keys everything, never `finding.id`.** Feedback is about *the architectural entity* (which persists across analysis_versions), not one finding row that gets superseded. A reject in v1 must still suppress the same finding in v7.

### 3.3 Weight math — the reducer (T4 → T5)

Pure deterministic function of `(T4 event log, config_version, time_window)`. No hidden state.

```ts
reduceWeight(events: FeedbackEvent[], { asOf, configVersion, halfLifeDays }): Weight {
  const SOURCE = { human: 1.0, agent: 0.3 };          // human verdict 3× an agent signal
  const DIR = { accept:+1, confirm:+1, reject:-1, wontfix:-1, dismiss:-0.5 };

  let num = 0, den = 0;
  for (const e of events) {
    const ageDays = (asOf - e.created_at) / 86_400_000;       // asOf, NOT Date.now()
    const decay   = Math.pow(0.5, ageDays / halfLifeDays);    // recency weighting
    const w       = (e.weight_hint ?? 1) * SOURCE[e.source] * decay;
    num += DIR[e.verdict] * w;
    den += w;
  }
  const value      = den === 0 ? 0 : clamp(num / den, -1, 1); // weighted mean of direction
  const confidence = 1 - Math.exp(-den);                       // saturates as evidence grows
  return { value, confidence, event_count: events.length, last_event: maxTs(events) };
}
```

- **Weighted mean, not sum** → `value` bounded [−1,+1], a direction not an unbounded tally.
- **`confidence` separate from `value`** → "strongly suppress, low confidence" vs "mildly suppress, high confidence" are different states the consumer must distinguish.
- **Half-life decay** → architectural feedback expires; old rejects shouldn't hard-suppress today. `asOf` is an explicit input (determinism — same triple ⇒ identical T5, replayable to any past instant).
- **Source authority** → human:agent = 1.0:0.3 encodes "agent emits signals, human emits verdicts."

### 3.4 Read-time overlay — never mutation

```ts
function overlay(f: Finding, w: Weight | null, cfg: ResolvedConfig): PresentedFinding {
  let severity = clampSeverity(f.severity_raw, cfg);     // CONFIG clamp (tier 2)
  let status: 'active'|'suppressed'|'amplified' = 'active';
  if (w) {
    if (w.value <= cfg.suppressBelow && w.confidence >= cfg.minConf) status = 'suppressed';
    if (w.value >= cfg.amplifyAbove && w.confidence >= cfg.minConf) status = 'amplified';
  }
  return { ...f, severity, status, weight: w };           // derived view, not persisted
}
```

`PresentedFinding` is computed per-request and thrown away. The finding row never gains `status`/`severity_final`. Suppression is a *view*, reversible by a counter-signal, auditable to its events.

**Zero-weight semantics (three states, not two):**

```
weight ROW ABSENT   → no feedback ever recorded. finding presents at severity_raw.
weight.value == 0   → feedback EXISTS but nets neutral (cancels / decayed-weak). finding
                      still observable; presentation unshifted; system KNOWS it's contested.
weight.value ≠ 0    → net directional signal → suppress/amplify per thresholds.
```

`value==0` = neutral / insufficient evidence (signals cancel OR too weak), **not** absence of opinion or absence of entity. Overlay branches on `weight IS NULL` vs `weight.value == 0` differently.

### 3.5 Temporal / drift reasoning

`snapshot` records the fingerprint set per analyzed commit. Drift = set-algebra + evidence-delta across snapshots:

```sql
-- Boundary erosion: violations that APPEARED between two commits
SELECT s2.fingerprint, s2.rule_id
FROM snapshot s2
LEFT JOIN snapshot s1
  ON s1.fingerprint=s2.fingerprint AND s1.rule_id=s2.rule_id AND s1.commit_sha=:base
WHERE s2.commit_sha=:head AND s2.rule_id LIKE 'react/boundary%' AND s1.fingerprint IS NULL;

-- Coupling trend on one entity over its history
SELECT commit_sha, json_extract(evidence_digest,'$.fanIn') AS fan_in, created_at
FROM snapshot WHERE fingerprint=:fp AND rule_id='react/coupling' ORDER BY created_at;
```

Produces findings storage cannot: "this PR raised `useCart` fan-in 3→9", "this boundary was clean at v1.2, violated 12× since." Claude consumes **deltas** — the answer to "is this getting worse, since when, and did we already decide it was fine?" (current from T3, "getting worse" from `snapshot`, "already decided" from T5).

### 3.6 Feedback loop closure

```
Claude presents PresentedFinding  ──▶  human or agent reacts
                                          │
              ┌───────────────────────────┴────────────────────┐
              │ MCP tool: record_feedback(fingerprint, verdict, │
              │           source, originRunId?, reason?)        │
              └───────────────────────────┬────────────────────┘
                                          ▼
                          APPEND feedback_event (T4)   ← only write path into memory
                                          ▼
                          reducer recomputes weight (T5) for that fingerprint
                                          ▼
                  next analyzeRepo → overlay() reflects new weight
                          (findings unchanged; only presentation shifts)
```

**Anti-self-loop:** an agent-sourced feedback event MUST NOT originate from the execution context that produced the finding being evaluated. Enforced at append-time: reject if `source='agent' AND origin_run_id == finding.producing_run_id`. Agent feedback must cross a run boundary — react to history, never to itself. Human feedback is exempt. There is no function anywhere that writes `weight.value` directly or mutates a finding; the only mutation into memory is `appendFeedbackEvent()`.

---

## 4. Killer analyzer — shared-component extraction

**Why this single rule is the MVP:** it requires every subsystem to exist (graph + similarity + fingerprint + memory + temporal + deterministic-predicate + MCP narration). If it works end-to-end, the platform thesis is proven; if the fingerprint or memory is rotten, this rule exposes it immediately.

### 4.1 The question

> "Are there ≥N components structurally similar enough that a shared component should be extracted — **and that we haven't already decided not to extract**?"

The clause after the dash is the differentiation. ESLint/jscpd answer the first half and re-nag forever; this rule consults memory and stays quiet on settled cases.

### 4.2 Deterministic predicate (CODE tier)

The decision is a **pure unordered boolean AND over normalized metrics**. No implicit scoring, ranking, or weighted aggregation in v1. Each threshold is an independent deterministic gate from config.

```ts
function analyze(ctx: AnalysisContext): Finding[] {
  const { graph, similarity, config: c } = ctx;
  const out: Finding[] = [];
  const components = graph.components.filter(isCandidate);    // exclude trivial (§4.4)

  // 1. CLUSTER by embedding kNN (deterministic given pinned model_version)
  const clusters = similarity.cluster(components, {
    minCosine: c.shared.minCosine,                            // e.g. 0.90
    modelVersion: ctx.embeddingModelVersion,                  // pinned
  });

  for (const cluster of clusters) {
    if (cluster.size < c.shared.minInstances) continue;       // ≥3 instances

    // 2. STRUCTURAL corroboration — embeddings propose, structure confirms
    const propOverlap = jaccard(cluster.map(propNameSet));
    const hookOverlap = jaccard(cluster.map(hookCallSet));

    // 3. THE PREDICATE — unordered boolean AND, all knobs from config
    const isOpportunity =
      cluster.minCosine >= c.shared.minCosine     &&  // 0.90
      propOverlap       >= c.shared.minPropOverlap &&  // 0.80
      hookOverlap       >= c.shared.minHookOverlap &&  // 0.70
      cluster.size      >= c.shared.minInstances;      // 3
    if (!isOpportunity) continue;

    // 4. DIVERGENCE — what differs becomes the extracted component's props
    const variancePoints = diffProps(cluster);

    // 5. BOUNDARY check BEFORE emitting (see 4.4)
    const type = violatesBoundary(cluster, ctx.boundaryRules)
      ? 'architectural-conflict' : 'opportunity';

    out.push(makeFinding(ctx, cluster, { propOverlap, hookOverlap, variancePoints, type }));
  }
  return out;
}
```

Every threshold is **config (tier 2)**; the logic is **code (tier 1)**; embeddings are **tier-1 evidence** that *propose* clusters; the deterministic conjunction *decides*. Similarity alone never fires a finding.

### 4.3 Finding shape (immutable, no prose)

```ts
makeFinding(ctx, cluster, m): Finding {
  return {
    id: ulid(),
    ruleId: 'react/shared-extraction',
    type: m.type,                                // opportunity | architectural-conflict
    fingerprint: clusterFingerprint(cluster, ctx.config),   // §4.5
    analysisVersion: ctx.version,
    producingRunId: ctx.runId,
    commitSha: ctx.commit,
    severityRaw: severityRaw(m, ctx.config),     // GATE LOOKUP, not a weighted score
    evidence: {
      instances: cluster.map(c => ({ name: c.name, span: c.span, fingerprint: c.fp })),
      cosine: cluster.minCosine,
      propOverlap: m.propOverlap,
      hookOverlap: m.hookOverlap,
      variancePoints: m.variancePoints,          // → proposed prop API of shared comp
      sharedSurface: intersect(cluster.map(propNameSet)), // → proposed shared props
      ...(m.type === 'architectural-conflict' && { conflict: m.conflict }),
    }
    // NO explanation. NO "you should extract". Pure structural proof.
  };
}

// severity is a GATE LOOKUP, not a computed score (no weighted aggregation in v1):
function severityRaw(m, c): Severity {
  if (m.instances >= c.shared.errorAtInstances) return 'error';   // e.g. ≥5
  if (m.instances >= c.shared.warnAtInstances)  return 'warn';    // e.g. ≥3
  return 'info';
}
```

`evidence` carries everything Claude needs to narrate *and* everything the v2 codemod needs to act (variance points become the extracted component's prop signature). No prose field; ranking/prioritization lives above the line (LLM), not in tier-1 severity.

### 4.4 Edge cases

```
EXCLUDE from candidates (isCandidate):
  • trivial components: < N JSX nodes
  • already-shared: shared/ ui/ components/common/  (it IS the abstraction)
  • test/story files: *.test.* *.stories.*  (fixtures legitimately duplicate)
  • generated code: config-globbed

DO NOT FIRE when:
  • memory says rejected: weight.value ≤ suppressBelow ∧ confidence ≥ minConf → suppressed
  • cluster spans a FORBID boundary → type = architectural-conflict (NOT a refactor opp)
  • divergence too high: high cosine but variancePoints > maxVariance → god-component → REJECT

PARTIAL:
  • 2 instances (below minInstances): record as WATCH (snapshot it), don't fire. A 3rd
    appearing later → temporal query catches the threshold crossing → fires then.
```

**Boundary-conflict type (formal):** a boundary-rule violation overrides extraction logic and converts the finding from `opportunity` → `architectural-conflict`. Conflict findings MUST NEVER be interpreted or executed as refactor opportunities. The v2 codemod filters `type === 'opportunity'` and cannot even see conflicts as actionable — type-level separation, not convention.

### 4.5 Opportunity fingerprint (reject survives member churn)

The finding is about a *set*; its fingerprint must survive instances added/removed/renamed/reformatted, yet a reject must persist. Key on the **shared shape** (intersection), not the **member set**:

```ts
clusterFingerprintStructural(cluster, c): string {
  const inter = intersectAll(cluster);                     // shared shape (preferred)
  if (cardinality(inter) >= c.shared.minFpCardinality) {   // e.g. ≥3 shared features
    return hash(sorted(inter));
  }
  // FALLBACK: union minus statistical outliers — stable when intersection is thin
  const union   = unionAll(cluster);
  const trimmed = dropOutliers(union, cluster, c.shared.outlierFreq);
  return hash(sorted(trimmed) + ':union-fallback');        // tagged → regimes never collide
}
```

**Thin-intersection fallback:** if the intersection of shared structural sets falls below a minimum cardinality, fall back to a stabilized `union-minus-outliers` representation, tagged so intersection-based and union-based fingerprints never collide. This avoids degenerate/empty fingerprints where every thin cluster collapses to the same hash. Keying on shared shape makes the reject durable yet scoped: add a 4th matching instance → same shared shape → supersede under same fingerprint → reject still applies.

### 4.6 Codemod binding (v2)

Codemod execution is only allowed when the `clusterFingerprint` matches an existing persisted Finding fingerprint of type `opportunity`, in `active` status (not suppressed by memory), at the current `analysis_version`. Absent / superseded / suppressed / `architectural-conflict` → **REFUSED**.

```ts
function mayExecute(fp: string, ctx): Refusal | Bound {
  const f = findings.currentVersion(fp);
  if (!f)                              return refuse('no such finding');
  if (f.type !== 'opportunity')       return refuse('conflict/non-opportunity not executable');
  if (f.analysisVersion !== ctx.version) return refuse('stale finding — re-analyze first');
  const w = memory.weight(fp);
  if (overlay(f, w, ctx.config).status === 'suppressed')
                                      return refuse('suppressed by memory — rejected before');
  return bind(f);   // codemod operates on THIS finding's evidence
}
```

The fingerprint is the **capability token** (gate 1). Only on `Bound` → run the verification pipeline (gate 2): `DRY-RUN → TYPECHECK → TESTS → GIT-clean → commit + reversal patch`. v1 is proposal-only. Defense-in-depth on the one subsystem that mutates user code.

---

## 5. MCP tool surface

**Governing constraint:** coarse verb-tools for the 90% path + a few escape-hatch primitives; **Claude reasons over structured findings, never assembles low-level data.** Every tool returns findings-or-evidence, never raw bytes for Claude to reconstruct truth from. The MCP layer is a thin adapter over the engine.

**Tool determinism contract:** every MCP tool is deterministic given `(AnalysisContext version, input params, pinned model versions)`. No tool depends on external state, wall-clock, randomness, or unversioned runtime. (`analyze_repo` is the one state-advancing tool — its *outputs* are a deterministic function of repo content_hashes + config_version + model_version. Tools exposing decay take an explicit `asOf`, never call-time `Date.now()`.)

### 5.1 Taxonomy — 3 bands

```
BAND A — COARSE VERB TOOLS  (main path, findings-first)
  analyze_repo · get_findings · explain_finding · find_shared_opportunities
  query_architecture · get_drift
BAND B — MEMORY / FEEDBACK  (the loop — only write path into memory)
  record_feedback · get_memory
BAND C — ESCAPE-HATCH PRIMITIVES  (drill-down only, NOT the main path)
  get_node · raw_graph_query
v2 adds: propose_refactor (proposal-only) → apply_refactor (gated, §4.6 token)
```

### 5.2 Band A — exact schemas

```ts
// analyze_repo — triggers the pipeline. Returns COUNTS + HANDLES, not a finding dump.
analyze_repo(input: { scope?: 'full'|'dirty'|'paths'; paths?: string[]; commit?: string })
 -> { runId: string; analysisVersion: number;
      counts: { byRule: Record<string,number>; byType: { opportunity: n; conflict: n };
                bySeverity: { error: n; warn: n; info: n }; suppressed: n };
      topFingerprints: string[];        // handles, NOT bodies — fetch detail on demand
      durationMs: number; filesParsed: number; typeEscalations: number }

// get_findings — paginated, capped. Suppressed excluded by default.
get_findings(input: { ruleId?; type?; severity?: Severity[];
      status?: ('active'|'suppressed'|'amplified')[]; fingerprints?: string[];
      limit?: number; cursor?: string })
 -> { findings: PresentedFinding[]; nextCursor?: string; total: number }

// explain_finding — narration-input. Returns ONLY evidence (no prose to parrot).
explain_finding(input: { fingerprint: string })
 -> { finding: PresentedFinding; evidence: Evidence;
      groundingFields: string[];        // closed license set — every clause must cite one
      history?: { version; commitSha; severityRaw; createdAt }[];
      memory?: { weight; confidence; eventCount; lastVerdict?; net: 'neutral'|'suppress'|'amplify' } }

// find_shared_opportunities — facade over the killer rule. Opportunities & conflicts SEPARATED.
find_shared_opportunities(input: { minInstances?; includeSuppressed?: boolean })
 -> { opportunities: PresentedFinding[];   // type='opportunity' ONLY
      conflicts: PresentedFinding[] }      // type='architectural-conflict', separate array

// query_architecture — enumerated graph questions, structured answers, bounded depth.
query_architecture(input: { question: 'renders'|'rendered-by'|'hook-consumers'|'fan-in'
      |'fan-out'|'import-path'|'reachability'; target: string; depth?: number })
 -> { answer: GraphAnswer; nodes: NodeRef[]; edges: EdgeRef[] }

// get_drift — temporal deltas. Pure SQL over snapshot index. No live recompute.
get_drift(input: { baseCommit: string; headCommit?: string; ruleId?; fingerprint? })
 -> { appeared: PresentedFinding[]; resolved: PresentedFinding[];
      worsened: { fingerprint; metric: string; from: number; to: number }[];
      improved: { fingerprint; metric; from; to }[] }
```

**`get_drift` strict source:** computes ALL comparisons exclusively from persisted T3 snapshot-indexed findings. Live recompute, ad-hoc traversal, or on-demand re-analysis during a drift query is **prohibited**. If a commit was never analyzed → snapshot absent → REFUSE with "run analyze_repo({commit}) to backfill." Drift never silently triggers analysis.

**`explain_finding` inference lock:** MUST NOT introduce, infer, or suggest any architectural fact absent from `Evidence` fields. The engine populates `groundingFields` — the exhaustive set of facts Claude is licensed to state. A claim citing no field in that set is out-of-contract. Claude may only reformat/summarize/structure existing evidence.

### 5.3 Band B — the feedback loop (only memory write path)

```ts
// record_feedback — THE ONLY MUTATION INTO MEMORY. Append-only.
record_feedback(input: { fingerprint: string;
      verdict: 'accept'|'reject'|'wontfix'|'confirm'|'dismiss';
      source: 'human'|'agent'; originRunId?: string; reason?: string })
 -> { accepted: boolean; refusedReason?: string; newWeight?: Weight }
// HARD VALIDATIONS at append-time:
//   • source='agent' ∧ originRunId == finding.producingRunId → REFUSE (self-loop)
//   • fingerprint must resolve to a real finding — current OR historical T3/T5, OR a
//     snapshot that ever contained it. Phantom (never observed) → REFUSE.
//   • appends feedback_event (T4) → triggers reducer → recomputes weight (T5)
//   • NEVER mutates the finding. Signal in, weight out.

get_memory(input: { fingerprint: string })
 -> { weight: Weight; events: FeedbackEvent[];   // full audit trail
      anchor?: { structural: string; cumulativeDrift: number; needsRevalidation: boolean } }
```

### 5.4 Band C — escape hatches (explicitly NOT the workflow)

```ts
get_node(input: { fingerprint?; file?; byteRange?: [n,n] })
 -> { node: NodeDetail; span: Span; astPath: string; typeInfo?: TypeInfo }

raw_graph_query(input: { cypherLike: string; limit: number })   // bounded, read-only
 -> { rows: unknown[]; truncated: boolean }
```

**Anti-leak rule:** Band C tools are strictly non-primary. If a session uses Band C for >30% of its reasoning flow, the system emits a warning suggesting a missing Band A coarse tool rather than continuing decomposition via primitives:

```ts
const ratio = bandC / (bandA + bandB + bandC);
if (ratio > 0.30 && totalCalls >= MIN_SAMPLE)
  emitWarning({ kind: 'escape-hatch-overuse',
    message: 'Band C >30% of flow — likely rebuilding a finding from primitives. '
           + 'Suggests a MISSING Band A coarse tool.',
    suggestedToolGap: inferGapFromQueryPattern(recentBandCCalls) });
```

The threshold is config-tunable; the warning is advisory but visible — the surface self-diagnoses when its own catalog has a gap.

### 5.5 Orchestration pattern

```
TYPICAL SESSION (findings-first, coarse-tool-driven):
  analyze_repo({scope:'dirty'})        → counts + handles (small payload)
  find_shared_opportunities({})        → opportunities[] + conflicts[] (separated)
  explain_finding({fingerprint})       → evidence (Claude renders per inference-lock)
  Claude narrates grounded in evidence fields
  human reacts → record_feedback({verdict:reject}) → memory updates, loop closes
  next run → that finding suppressed   → Claude doesn't re-nag

ANTI-PATTERN (prevented by design):
  ✗ raw_graph_query × 12 to manually rebuild "shared opportunities" — that's an analyzer's job
  ✗ Claude inventing "you should also extract X" with no finding — no finding = no evidence = forbidden
```

The whole surface is **findings-first, write-once-via-one-door, evidence-not-prose, handles-not-dumps.**

---

## 6. Framework-adapter architecture

**The seam's job:** React is core (v1). Next/TanStack/Remix/Expo are *adapters* that extend — never fork. Adding a framework touches only the adapter package + registration, **zero edits to core**. If adding a framework forces a core change, the seam leaked.

### 6.1 Core vs adapter

```
CORE  (@rai/core — React truth, framework-agnostic)
  two-pass parser · RepoGraph · fingerprint + reconciliation · Architectural Memory
  · analyzer runtime · MCP server · codemod verification gate · base React analyzers
ADAPTER  (@rai/adapter-{next,tanstack,remix,expo})
  framework detection · framework node-kinds (RSC, route segment, loader, server action)
  · framework analyzers (into core registry) · framework codemods (core's same gate)
  · framework config schema extensions · framework semantic enrichment

RULE: adapters DEPEND ON core. core NEVER imports an adapter. CI lint: grep framework-name
      in packages/core == 0 hits. core has no `if (framework === 'next')` anywhere.
```

### 6.2 The adapter contract

```ts
interface FrameworkAdapter {
  id: FrameworkId;
  detect(ctx: RepoContext): DetectionResult | null;       // reads deps, config, conventions
  enrich(graph: DeepReadonly<RepoGraph>, ctx): GraphEnrichment;  // additive metadata, frozen input
  analyzers: Analyzer[];                                    // same Analyzer interface as core
  codemods: Codemod[];                                      // core's gate only — no private write path
  configSchema: ZodSchema;                                  // merged under config.{id}.*
  fingerprintExtension?: (node, base: Fingerprint) => { nominal?: string; positional?: string };
                                                            // structural FORBIDDEN (see 6.5)
}
```

Adapters get **no special powers** — they register more of the same pure analyzers and gated codemods. The integrity model holds identically for adapter-contributed rules.

### 6.3 Enrichment — append-only, immutable over core

Adapters **do not build a parallel graph.** They *annotate* core's RepoGraph with framework roles:

```ts
interface GraphEnrichment {
  nodeTags: Map<NodeId, FrameworkTag[]>;    // additive: this component is also an RSC
  extraEdges: Edge[];                        // framework edges: route→layout, loader→route
  roleIndex: Map<FrameworkRole, NodeId[]>;   // query: "all server actions"
}
// Next example: app/**/page.tsx → RouteSegment; "use client" → ClientComponent (else RSC);
//   "use server" → ServerAction; app/**/layout.tsx → Layout, edge layout──wraps──▶page
```

**Enrichment immutability rule:** graph enrichment is append-only metadata over core RepoGraph nodes. Adapters may add tags/edges/role-indexes — never mutate, delete, or reinterpret existing core structures. `enrich()` receives a `DeepReadonly` frozen graph (any write throws) and returns a *separate* enrichment object that core merges. This keeps core node structure canonical — adapters can't shift a node's structural fingerprint and corrupt memory continuity. **Why additive-on-core-graph:** fingerprints/memory/similarity/temporal all already work on core nodes, so framework findings inherit all of it for free; a parallel graph would duplicate that machinery per framework.

### 6.4 Framework analyzer examples

```
next/client-boundary-bloat   — too much under "use client"; boundary should sit lower
next/server-action-in-loop   — ServerAction invoked inside a mapped JSX region
next/route-coupling          — CORE coupling analyzer + roleIndex(RouteSegment) lens
next/parallel-data-fetch-miss — sequential awaits in an RSC that could be Promise.all
```

`next/route-coupling` is the proof the seam pays off: it's **core's coupling analyzer**, scoped to Next's `RouteSegment` role from enrichment. Adapters compose core rules + framework lenses, not just write from scratch.

### 6.5 Edge cases

```
MONOREPO, MULTIPLE FRAMEWORKS:
  adapter ownership is PATH-SCOPED. shared packages/ui → core rules only, unless an
  analyzer opts into crossBoundary. Adapter isolation: analyzers operate ONLY within
  claimed rootDirs unless `crossBoundary: true` (default FALSE). The graph view is
  PRE-FILTERED to the adapter's subtree — a Next analyzer physically cannot read Expo nodes
  without declaring crossBoundary. (Default-deny, opt-in-cross — bounds cost + false-positives.)

VARIANT GUARDS:
  Next app-router vs pages-router ≈ different frameworks. detect() returns a `variant`;
  analyzers declare `supportedVariants`. If an analyzer would run against an unsupported
  variant → engine emits a `variant-mismatch` DIAGNOSTIC event (skipped, but LOUDLY — logged
  + queryable). Silent fallback is forbidden.

REGISTRATION CONFLICT:
  If multiple adapters claim the same rootDir with INCOMPATIBLE variants, registration FAILS
  deterministically with an explicit conflict diagnostic + a config-override resolution path
  (`adapterOwnership` in react-intel.config.ts). Never resolve implicitly (load-order =
  non-deterministic). Deterministic-fail > implicit-guess.

EXPO / REACT NATIVE:
  JSX primitives differ (<View> not <div>). Core analyzers declare `assumesDom: boolean`;
  Expo disables dom-only core rules for its subtree + supplies RN equivalents. This FORCES
  core to stay react-dom-agnostic — a healthy constraint surfaced by designing the seam early.

FRAMEWORK vs LIBRARY:
  adapter = owns rendering/routing model. library (e.g. TanStack Query as a dep) = handled by
  core analyzers reading import edges. Clear line.

ADAPTER STORAGE RULE:
  adapters may enrich/index core entities; MAY NOT introduce independent persistence for
  findings, memory, fingerprints, or temporal history. ALL persistent architectural truth is
  core-owned (one memory, one history, N lenses — never N parallel databases).
```

**Fingerprint extension constraint:** `fingerprintExtension` may only refine `nominal` or `positional` layers. `structural` remains core-owned and immutable across adapters, to preserve cross-framework memory continuity. The same `packages/ui` `<Button>` has the *same* structural identity regardless of which framework lens observes it — so a reject recorded under the plain-React lens transfers when Next analyzes the same component. Memory is **framework-invariant at the structural layer**.

### 6.6 Package topology

```
packages/
  core/                @rai/core         — engine, MCP, base React. ZERO framework imports.
  adapter-next/        @rai/adapter-next — depends on core.
  adapter-tanstack/    @rai/adapter-tanstack
  adapter-remix/       @rai/adapter-remix
  adapter-expo/        @rai/adapter-expo
  cli/                 @rai/cli          — loads core + auto-detected adapters
  config/              @rai/config       — shared zod config + merge (core + adapter schemas)

REGISTRATION (runtime composition, not core knowledge):
  detect installed adapters → adapter.detect(repo) → load matching →
    register(adapter.analyzers, adapter.codemods, adapter.configSchema) into core.
  core receives a flat Analyzer[] — cannot tell a Next analyzer from a base one (both pure,
  both carry a `framework` tag for FILTERING not BRANCHING). Extension by registration,
  not modification.
```

---

## 7. MVP roadmap / phasing

**Sequencing principle:** the v1 MVP is a **vertical thin slice through every layer on one rule** (shared-extraction); the **dangerous subsystem (codemod apply) is sequenced last**. Each phase retires one top risk *before* the next builds on it.

### 7.1 Golden fixture suite (required from P0)

```
GOLDEN FIXTURE SUITE (/fixtures):
  • curated real React repos + synthetic edge-case fixtures — ONE shared corpus
  • EVERY phase exit runs against the SAME corpus (comparability)
  • versioned + IMMUTABLE once promoted "golden"
  • new regression ⇒ add reproducer fixture BEFORE fixing code
  Categories: rename/move/reformat · same-shape collision · boundary-conflict dup ·
              gradual structural drift · RSC/client-boundary (P6) · codemod rollback
```

### 7.2 Phases (risk-retirement order)

```
P0 — PARSE & GRAPH  (walking skeleton)
  BUILD: oxc Pass-1 → RepoGraph → SQLite T1 (content-hash incremental); Span+astPath;
         lazy ts-morph Pass-2 wired.
  EXIT: from-scratch rebuild == incremental (byte-identical T1) ✓ · parses 3 real OSS repos ✓
        · Pass-1 pure (reproducible, no hidden state) ✓
        · PERF: incremental rebuild (<5 changed files) < 20% of full-rebuild time ✓
  RETIRES: "can we get reliable structural truth from real code?"

P1 — FINGERPRINT & RECONCILE  (#1 risk) ⚠ GO/NO-GO GATE
  BUILD: layered fingerprint; reconciliation table (§2.5.1); cumulative-drift anchor +
         revalidation (§2.5.2).
  EXIT: reformat → same structural fp (0 churn) ✓ · rename → RENAME event, identity carried ✓
        · add prop / conditional branch → drift detected ✓ · slow-drift fixture → revalidation
        fires ✓ · same-shape collision → handled (nominal split or dup-signal, never silent
        wrong-merge) ✓
  RETIRES: "does identity hold so memory doesn't evaporate or mis-stick?"
  GATE: if P1 fails, STOP. Everything downstream depends on this.

P2 — MEMORY LAYER  (the moat)
  BUILD: T3 append-only findings; T4 feedback; T5 reducer (asOf + config_version
         determinism); overlay (suppress/amplify, zero-weight semantics); anti-self-loop.
  EXIT: reject → re-analyze → suppressed ✓ · supersede v1→v2 → reject STILL applies ✓
        · T5 replay: same T4+config+asOf ⇒ byte-identical weights ✓ · agent self-loop → REFUSED ✓
        · weight==0 distinguishable from ABSENT ✓
  RETIRES: "does a decision actually stick?"

P3 — KILLER RULE + MCP + CLAUDE  (the product moment) ★ THIS IS THE MVP
  BUILD: react/shared-extraction (§4); Band-A tools + record_feedback; determinism contract
         + groundingFields.
  EXIT: finds real shared opportunity on a real repo ✓ · Claude narrates grounded ONLY in
        evidence fields ✓ · human rejects → next run silent ✓ · boundary-forbidden cluster →
        architectural-conflict NOT opportunity ✓ · analyze_repo returns counts+handles, never
        dumps ✓
        · DETERMINISM REPLAY: same repo+commit+config+model ⇒ byte-identical findings +
          overlays + MCP payloads ✓  (validates MCP narration inputs are deterministic
          artifacts, not runtime-dependent outputs)
        · PERF: analyze_repo(dirty) medium repo <10s cold / <3s warm ✓
  RETIRES: "does the integrated product prove the pitch end-to-end?"
  MVP SUCCESS METRIC: a real team uses it on an active repo and (a) accepts ≥1 finding as
        valuable, (b) rejects ≥1 finding and sees suppression persist, (c) prefers the
        memory-aware workflow over repeated static lint output. Successful ONLY IF the
        memory loop changes user behavior.

P4 — BREADTH: more analyzers + temporal
  BUILD: coupling, hook-topology, over-abstraction, boundary-violation analyzers; snapshot +
         get_drift (pure SQL); query_architecture. ALSO analyzer isolation runtime:
         per-analyzer timeout budgets · failure containment · deterministic partial-failure
         reporting.
  EXIT: ≥4 analyzers green ✓ · get_drift shows fanIn 3→9 across commits ✓ · boundary_rule
        respected ✓ · one analyzer panic/timeout → remaining analyzers still complete ✓
  RETIRES: "is the analyzer/Finding/memory framework general?"

P5 — CODEMOD APPLY  (dangerous subsystem — LAST on purpose)
  BUILD: propose_refactor → apply_refactor: capability-token binding (§4.6) → DRY-RUN →
         TYPECHECK → TESTS → GIT-clean → commit + reversal patch. NO --force. ALSO codemod
         execution artifacts (append-only, auditable): proposed patch · verification outputs ·
         rollback patch · originating finding fingerprint · verification timestamps.
  EXIT: extract-shared codemod → typechecks + tests green + reversible ✓ · dirty tree →
        REFUSES ✓ · stale/superseded/suppressed/conflict fingerprint → REFUSES ✓ ·
        typecheck-fail post-transform → auto-rollback, no partial write ✓
        · PERF: verification pipeline aborts within bounded timeout on failing tests ✓
  RETIRES: "can it edit code safely?" — apply_refactor never performs an untraceable mutation.

P6 — FRAMEWORK ADAPTER  (prove the seam, ONE adapter: Next.js)
  BUILD: @rai/adapter-next: detect + enrich (frozen-input append-only) + 2-3 Next analyzers
         (client-boundary-bloat, route-coupling reusing core) + variant-guard diagnostics +
         nominal/positional-only fp extension.
  EXIT: grep framework-name in packages/core == 0 hits ✓ (CI lint) · Next analyzers fire on
        Next subtree NOT plain-React ✓ · app-router rule on pages-router → variant-mismatch
        diagnostic ✓ · same shared <Button> → SAME structural fp via Next & plain lens →
        memory transfers ✓
  RETIRES: "is the extensibility real or just claimed?"
```

### 7.3 YAGNI deferrals (named, not drifted)

```
multi-framework simultaneously → P6 ships ONE. · adapter conflict resolution → post-P6. ·
cross-boundary analyzers → opt-in when needed. · embedded graph DB (kuzu) → SQLite CTE
suffices. · declarative rule DSL → only if users demand. · weighted SCORING engine → v1 is
boolean-AND gates; scoring later IF engine-prioritization wanted. · Band C tools → ship in P4
only if the >30% warning shows a gap. · VS Code / non-Claude clients → MCP is the contract.
```

### 7.4 Critical path, gates, transversal requirements

```
CRITICAL PATH:  P0 → P1 → P2 → P3   (the MVP)
                          ▲ P1 is the GO/NO-GO gate for the entire product.
PARALLELIZABLE after P3:  P4 ∥ P5 ∥ P6 (each extends a proven core).
INVARIANT: no phase exits without its MEASURABLE exit criteria green. Each ✓ is a test.

PERFORMANCE BUDGETS (tracked from P0):
  • incremental analysis ALWAYS < full rebuild
  • type escalations bounded by analyzer demand; no analyzer triggers unbounded Pass-2
  • memory overlay cost O(findings), NEVER O(history)
  • snapshot queries index-backed + bounded

OBSERVABILITY (from P0): every major pipeline stage emits structured, machine-readable,
  replayable diagnostics: parse duration · graph node counts · fingerprint reconciliation
  decisions · reducer inputs/outputs · analyzer execution timing · codemod verification stages.

SCHEMA EVOLUTION:
  • all persisted stores forward-migrated, never rewritten in-place
  • reducers stay replay-compatible across schema versions
  • fingerprint algorithm version persisted alongside findings (fp_algo_version)
  • breaking fingerprint changes require explicit re-baselining

EXPLICIT FAILURE CONDITIONS (project kill-switches):
  • fingerprint instability causing persistent identity churn            (P1)
  • memory mis-association across unrelated entities                     (P1/P2)
  • non-deterministic analyzer outputs under identical inputs            (P0–P3)
  • codemod pipeline unable to guarantee rollback integrity             (P5)
  • MCP orchestration requiring primitive tools for common workflows     (P3/P5)
  If any persists beyond its owning phase → development PAUSES until resolved.
```

---

## 8. Risks / tradeoffs / scalability / performance

### 8.1 Top technical risks (ranked by thesis-lethality)

```
R1 — FINGERPRINT IDENTITY INSTABILITY              SEVERITY: CRITICAL (kill-cond)
  Risk: structural fp too strict → memory evaporates; too loose → rejects mis-stick. Either
        kills the moat. Every memory association keys on it.
  MITIGATION: layered fp (§2.3); cumulative-drift anchor + revalidation (§2.5.2); collision→
        signal-not-merge; retired in P1 ALONE on golden fixtures.
  RESIDUAL: slow semantic drift is fundamentally a judgment call — revalidation surfaces it to
        humans, doesn't auto-solve. ACCEPTED: ambiguity → finding, never silent guess.

R2 — EMBEDDING NON-DETERMINISM / SIMILARITY DRIFT  SEVERITY: HIGH
  Risk: model version drift shifts cosine → reconciliation flips → memory non-deterministic.
  MITIGATION: model_version in schema (§2.6); version bump = re-embed migration (§7); similarity
        is tier-1 evidence behind a hard config threshold, never sole trigger.
  RESIDUAL: a locked old model ages. ACCEPTED: deterministic-but-suboptimal; upgrade is an
        explicit re-baseline event.

R3 — CODEMOD CORRUPTS USER CODE                    SEVERITY: HIGH (kill-cond)
  Risk: a transform produces broken/wrong code, or partial write on failure.
  MITIGATION: defense-in-depth — capability-token binding (§4.6) + DRY-RUN→TYPECHECK→TESTS→
        GIT-clean gate + reversal patch + proof artifacts (§7) + sequenced LAST (P5) + v1
        proposal-ONLY. No --force, ever.
  RESIDUAL: tests green yet behavior subtly wrong (test gaps). ACCEPTED: reversal patch makes it
        recoverable; engine never claims correctness beyond "typechecks + existing tests pass."

R4 — ts-morph PASS-2 COST EXPLOSION                SEVERITY: MEDIUM-HIGH
  Risk: an analyzer escalates types broadly → full-program typecheck → minutes, huge memory.
  MITIGATION: per-analyzer escalation budget (§7); typeOf() per-Span on-demand + memoized; "no
        unbounded Pass-2" measured budget; one shared Program; analyzers that don't call typeOf
        never load ts-morph.
  RESIDUAL: a legitimately type-heavy rule is just expensive. ACCEPTED: bounded by budget; rule
        fits the budget or is redesigned/flagged.

R5 — LLM SMUGGLES JUDGMENT PAST THE HIERARCHY      SEVERITY: MEDIUM (thesis-creep)
  Risk: Claude infers facts not in evidence / talks user into downgrading / self-loops feedback
        → "deterministic" quietly becomes "AI guesses."
  MITIGATION: groundingFields closed license set (§5.2); prose-free findings (§4.3); severity
        immutable-to-LLM (§1); record_feedback sole write door + anti-self-loop (§3.6); agent
        feedback decayed 0.3 + run-boundary.
  RESIDUAL: narration quality vs constraint tension. ACCEPTED: field-grounding is the line;
        quality lives in HOW fields are phrased, not in adding facts.

R6 — ADAPTER SEAM LEAKS INTO CORE                  SEVERITY: MEDIUM
  Risk: framework specifics creep into core → core bloats, extensibility claim becomes false.
  MITIGATION: grep-framework-in-core==0 CI lint (§6); adapters depend-on-core-only; no
        adapter-owned storage (§6.5); structural fp core-owned (§6.5); enrichment frozen-input
        append-only (§6.3).
  RESIDUAL: pressure to "just add one if(next)" in core is constant. ACCEPTED: CI lint is the
        hard gate; the assumesDom precedent shows the discipline.
```

### 8.2 Core tradeoffs

```
TRADEOFF                          CHOSE                      COST ACCEPTED
─────────────────────────────────────────────────────────────────────────────────────
Determinism vs LLM flexibility    determinism (code=truth)   no "creative" architectural insight
                                                             beyond rules; system only as smart
                                                             as its analyzers
Two parsers (oxc+ts-morph) vs one depth + speed              byte-range discipline everywhere;
                                                             edits invalidate Spans; 2 deps
Boolean-AND gates vs scoring      explainability (v1)        no nuanced engine ranking;
                                                             prioritization punted to LLM
Memory keyed on fingerprint       verdicts survive           fingerprint IS the single point of
  not file:line                   supersession               failure (R1); all eggs, one basket
Append-only everything            audit + replay             storage grows monotonically; needs
  (T3/T4/snapshot/artifacts)      (determinism)              retention/compaction
SQLite single-file vs server DB   zero infra, portable,      ceiling on concurrent writers; very
                                  commit-friendly            large monorepos may strain (see 8.3)
Proposal-only v1 codemod vs apply safety-first              no autonomous fixing in MVP; value
                                                             deferred to P5
Adapter = enrich core graph       reuse all machinery        adapters can't model a framework that
  vs own graph                    (memory/fp/temporal free)  fundamentally breaks React's
                                                             component/hook model (acceptable)
```

**The defining tradeoff is row 1:** the system is exactly as intelligent as its deterministic analyzers + the LLM's narration of their findings — no more. It will never have a "this architecture feels off" intuition the rules don't encode. That's the deliberate price of "deterministic intelligence over prompt engineering" — and it's the right price, because the alternative (LLM-judges-architecture) is precisely the unreliable, non-reproducible thing the design rejects. The ceiling is real; it's also the point.

### 8.3 Scalability

```
Repo size (files)       Pass-1 O(changed files) incremental (content-hash); full only once.
                        Analyzers O(graph) on in-memory graph. Bottleneck = first cold index.
Component count         Recursive-CTE traversal, index-backed; fan-in/out bounded by depth param.
  (graph density)       Dense graphs: bounded-depth caps cost.
Similarity (sqlite-vec) kNN over N components; handles 10k–100k fine. Embed only changed; cluster
                        within candidate sets. Beyond ~100k: ANN index / partition by area.
History depth           Append-only → grows forever, BUT reads are O(current) not O(history):
  (T4/snapshot/T3)      T5 = materialized current weight (one lookup); snapshot = indexed deltas;
                        findings read latest version. Strategy: RETENTION (compact old snapshots,
                        archive superseded versions beyond N). History grows; READ cost flat.
Concurrent analysis     SQLite single-writer → single-process per repo. Multi-tenant SaaS =
                        process-per-repo + separate DB files. NOT for many concurrent writers/DB.
Monorepo, many pkgs     Adapter path-scoping (§6.5) → each analyzer walks its subtree. Per-package
                        incremental. Scales by partitioning, not analyzing everything every time.
Very large (>50k files) SQLite ceiling concern. IF hit: shard DB per workspace; core reads
                        federate. Deferred until a real repo proves the ceiling (YAGNI).
```

**Thesis:** incremental + index-backed reads + append-only-with-flat-read-cost. Hot-path ops are O(changed) or O(current), **never** O(total history). The budget "overlay O(findings) not O(history)" keeps a 2-year-old repo as fast to read as a new one. Retention/compaction is the named escape valve for unbounded append growth.

### 8.4 Performance — hot paths

```
Cold full index       one-time, repo-sized        oxc parse (fast) + embed all (the cost).
                                                  Parallelize parse; batch embed.
Incremental (dirty)   <3s warm (medium repo)      content-hash diff → parse only dirty →
                                                  re-embed only changed. Dominated by #changed.
Type escalation       bounded by analyzer demand  lazy, per-Span, memoized, ONE shared Program.
                                                  Zero cost if no analyzer needs types.
Similarity cluster    bounded                     sqlite-vec kNN within candidates; vectors
                                                  mostly cached (embed-on-change).
Memory overlay        O(findings) per response    one weight lookup per finding. NOT a history scan.
Drift query           index-backed, bounded       pure SQL set-algebra over snapshot index. No
                                                  live re-analysis. No table scan.
Codemod verification  bounded timeout abort       DRY-RUN + typecheck + test-run; gated by timeout.
```

**Three performance design decisions:**

1. **Cost is front-loaded into the cold index, then amortized to near-zero.** The persistent T1/T2 cache (content-hash keyed) makes run #2…#N fast — you pay the parser once per file-version. "Persistent repository intelligence" is a *performance* feature, not just a memory one.
2. **The two expensive ops (type escalation, embedding) are both demand-gated.** Pass-2 fires only on `typeOf()`; embedding only on changed components. Neither runs eagerly or repo-wide-twice. The hybrid's promise (deep when needed, cheap when not) is enforced by demand-gating, not hope.
3. **Read cost is decoupled from history depth.** Append-only stores grow forever, yet every hot-path read targets *current* state — never a fold over all history. A repo analyzed 1000 times reads as fast as one analyzed once. History is for temporal queries (opt-in, bounded), not a tax on every read.

### 8.5 The honest summary

```
WHAT THIS DESIGN BUYS:           WHAT IT DELIBERATELY GIVES UP:
  deterministic, reproducible      "creative" architectural intuition beyond encoded rules
  memory that changes behavior     autonomous fixing in v1 (proposal-only)
  identity-stable findings         simplicity (two parsers, byte-ranges, 5 stores, fingerprints)
  framework-extensible core        multi-framework / heavy concurrency in MVP
  safe, traceable mutation (P5)    speed-of-first-index on huge cold repos
  flat read cost over time         unbounded write-history growth (needs retention)

THE ONE-LINE TRUTH:
  An engine that makes architectural truth DETERMINISTIC, PERSISTENT, and IDENTITY-STABLE,
  then lets Claude reason over it — trading "AI cleverness" for "reproducible correctness +
  memory." The bet: a system that REMEMBERS your decisions and never re-litigates them beats a
  smarter system that forgets.
```

---

## Appendix A — Invariant index (the non-negotiables)

```
INTEGRITY
  • Code=truth · Config=tuning · Findings=immutable · Memory=weights · LLM=narration-only
  • severity computed-by-code, clamped-by-config, immutable-to-LLM
  • LLM output never written back to any store
  • embeddings are tier-1 evidence, never tier-3 judgment
  • findings append-only, superseded never mutated

IDENTITY
  • fingerprint-keyed everything, never file:line
  • structural fp = shape only (excludes types + body)
  • cumulative-drift revalidation (per-step "same" can mask accumulated drift)
  • collision is a signal, not a silent merge
  • fp algorithm version persisted; breaking change = explicit re-baseline

DETERMINISM
  • Pass-1 pure function of content_hash alone
  • reducer pure function of (T4, config_version, asOf) — never wall-clock
  • embedding model_version in schema; bump = re-embed migration
  • every MCP tool deterministic given (analysisVersion, params, model versions)
  • T5 replayable from T4; snapshot replayable from T3

SAFETY
  • codemod needs capability-token (current+active+opportunity finding) THEN verification gate
  • no unguarded file-write path; no --force; reversal patch + proof artifacts always
  • record_feedback is the SOLE memory-write door; agent anti-self-loop at append-time

EXTENSIBILITY
  • grep framework-name in packages/core == 0 (CI lint)
  • adapters depend-on-core-only; enrichment frozen-input append-only
  • structural fp core-owned (framework-invariant memory)
  • no adapter-owned storage; variant-mismatch loud not silent; conflict claims hard-fail

PERFORMANCE
  • incremental always < full rebuild
  • overlay O(findings) not O(history); reads O(current) not O(total)
  • expensive ops (types, embeddings) demand-gated, never eager
```

## Appendix B — Glossary

```
RepoGraph            structural facts (components/hooks/edges/props) from Pass-1, in SQLite T1
Span                 {file, start, end, kind, astPath} — the parser-agnostic coordinate contract
Fingerprint          layered {structural, nominal, positional} entity identity
Finding              immutable, versioned, fingerprinted analyzer output (evidence, no prose)
Architectural Memory persistent decision-weights over fingerprints (T4 events → T5 weights)
PresentedFinding     read-time overlay of a Finding (config clamp + memory weight) — not persisted
Analyzer             pure fn(AnalysisContext) → Finding[]; registered; framework-tagged
Adapter              framework extension (detect/enrich/analyzers/codemods) depending on core
Overlay              read-time application of severity-clamp + memory-weight (never a write)
Snapshot             derived temporal index of T3 per commit (drift queries)
Capability token     a current+active+opportunity fingerprint that licenses a codemod to run
```
