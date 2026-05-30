# RAI — Future Ideas & Implementation Directions

> Observations and directions that emerged from architectural review. Not commitments — ideas worth evaluating before planning each phase.

---

## 1. Team-defined convention analyzers

RAI's current analyzers measure structural patterns mathematically. A complementary layer would let teams declare their own conventions explicitly in config — not imported from any external standard, but written by the team itself:

```ts
// react-intel.config.ts
conventions: [
  { rule: "hooks-must-be-extracted", pattern: "component with >3 hooks", severity: "warn" },
  { rule: "no-god-components",       pattern: "component with >10 props",  severity: "error" },
  { rule: "forms-use-react-hook-form", requiredHooks: ["useForm"],         scope: "**/*Form*" }
]
```

**Why team-defined, not external standards:**
- React best practices change across major versions — an external source ages badly without the team noticing
- Every team has different context (design system ownership, full-stack vs frontend split, etc.)
- The feedback loop works better: rejecting a rule your team wrote is a legitimate architectural decision; rejecting an external authority feels like "ignoring best practices"

**Key design constraint:** convention findings must be clearly distinguished from structural findings in the MCP output. A finding that says "this violates your team's convention X" and a finding that says "these 4 components are mathematically similar" are different kinds of truth — they should never merge into a single opaque verdict. The `groundingFields` mechanism already supports this separation.

**What to avoid:** integrating any external rule source automatically (React docs, Airbnb guide, a model trained on "good code"). The problem is not that they're bad sources — it's that they're not auditable over time the same way a team decision is. A convention the team didn't explicitly choose can't be meaningfully rejected via `record_feedback`.

---

## 2. Config auto-tuning from feedback history

Currently all repos start with the same thresholds (`minCosine`, `minPropOverlap`, etc.). After P6 there will be enough T4 feedback data per repo to ask: which thresholds produce findings that get accepted vs rejected in this specific codebase?

**Idea:** a background reducer that reads T4 per repo and proposes adjusted config values — not applied automatically, but surfaced as a suggestion with the evidence behind it (e.g. "your team consistently rejects findings below cosine 0.82 — raising `minCosine` would suppress 4 of the 6 current open findings").

This would be the natural step after P6: feedback data already exists, the reducer pattern already exists, it just needs a config-targeted output.

---

## 2. Proactive RAI invocation from the editor

Today, RAI requires either explicit CLI invocation or MCP configured once in Claude Code. The most natural UX would be a VS Code extension (or Claude Code hook) that detects when a user is editing a React component and queries RAI proactively — without the user typing anything.

**Trigger ideas:**
- File save in a `.tsx` file → background `analyze_repo({scope:'dirty'})` → surface findings inline
- PR open event (GitHub Action already possible in MVP) → comment with counts + top fingerprints
- Import of a new component → check if a structurally similar one already exists

The MCP layer is already in place. This is a client-side integration problem, not an engine problem.

---

## 3. Consequence-aware analysis (beyond structure)

RAI today answers "what exists and what is structurally inconsistent." It cannot answer "which inconsistencies actually caused problems." Bridging that gap would require correlating structural findings with:

- Git blame + commit history (which components change most frequently together?)
- Issue tracker links (do components flagged by `coupling` analyzer have more bug reports?)
- Test failure history (do components outside the dominant structural pattern fail tests more?)

This would allow RAI to prioritize findings not just by severity thresholds but by **observed consequence**. High-cosine cluster that has never caused a bug → lower priority than a lower-cosine cluster whose members have diverged 12 times in 3 months.

Not in the current roadmap but the data plumbing (T3 + snapshot table) already enables the temporal side of this.

---

## 4. Prescription layer: pattern library per codebase

RAI is deliberately descriptive ("your codebase does X") not prescriptive ("you should do Y"). A thin optional layer on top could close that gap without violating the integrity model:

**How it would work:**
1. RAI detects the dominant structural patterns in the repo (e.g. "87% of data-fetching components use `useSWR` + `useErrorBoundary` together")
2. A new finding type — `pattern-deviation` — fires when a new component diverges from the dominant pattern for its category
3. The LLM narrates: "This component handles data fetching but doesn't follow the pattern used by the other 23 — here's what they share"

The key constraint: the "pattern" is derived from the codebase itself, not from an external style guide. No external opinion enters the system.

---

## 5. Learned embeddings to replace feature-hash vectors

The current 256-dim feature-hash embedding is fully deterministic and requires no model, which is correct for the MVP. Its limit: two components with different prop names but identical purpose (e.g. `onClick` vs `onPress` in a React Native adapter) will score low cosine even if structurally equivalent.

When Pass-2 (ts-morph semantic layer) is fully wired, the richer type information could feed a small fine-tuned model to produce embeddings that are semantic rather than purely structural. The schema already supports this via `embedding_model_version` — a model bump invalidates T2 and triggers re-embed without touching T1, T3, T4, or T5.

**Threshold recalibration required:** the current `minCosine=0.75` was calibrated to the feature-hash embedding. A learned embedding will shift the similarity distribution — both `minCosine` and `minPropOverlap` need re-derivation against the golden fixture suite before deploying.

---

## 6. Cross-repo architectural memory

Today memory (T4/T5) is per-repo. An organization with 10 repos built on the same design system could benefit from a shared memory layer: a reject recorded against `<BaseCard>` in `repo-a` should inform analysis of the structurally identical component in `repo-b`.

This requires resolving identity across repos (structural fingerprint is already repo-agnostic — same component code = same fingerprint regardless of repo), and a trust model for cross-repo feedback (human feedback from `repo-a` should carry weight in `repo-b`; agent feedback probably should not).

The append-only + fingerprint-keyed design already supports this conceptually. The engineering challenge is the multi-tenancy boundary in the persistence layer.

---

## 7. "Already decided" as a first-class UX primitive

The most underrated feature in the current design is that a rejection survives re-analysis. This should be surfaced more explicitly to users — not just as suppressed findings, but as a queryable history:

> "Show me all architectural decisions recorded in this repo"

This would turn RAI's memory into a lightweight **Architecture Decision Record (ADR) system** — auto-populated from actual analysis + feedback rather than manually written. The data is already in T4; it just needs a dedicated read path and presentation layer.

---

## 8. Inspirations from Gentle-AI

> Reference: [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)

Gentle-AI is an ecosystem configurator for AI coding agents (Claude Code, Cursor, Copilot, etc.) that provides persistent memory ([Engram](https://github.com/Gentleman-Programming/gentle-ai/blob/main/docs/engram.md)), Spec-Driven Development workflows, skills, and per-phase model assignment. It does not analyze code — but several of its patterns are directly applicable to RAI's UX and memory layer.

### 8.1 `rai memory export/import` — committable memory (inspired by `engram sync`)

Engram lets teams export memories to `.engram/` in the repo and share them via git (`engram sync` / `engram sync --import`). RAI already has T4 as a committable store by design, but there is no explicit command that makes this easy. A `rai memory export` / `rai memory import` command would be the direct equivalent — making the onboarding story "clone repo → `rai memory import` → start with the team's accumulated decisions" concrete.

### 8.2 `rai doctor` — ecosystem health check (inspired by `gentle-ai doctor`)

Gentle-AI ships a read-only `gentle-ai doctor` command that verifies tool binaries, state files, memory reachability, and disk space without mutating anything. RAI has known environment gotchas (better-sqlite3 native build, sqlite-vec loading, workspace symlinks, fixtures path). A `rai doctor` command would check all of these and report clearly — reducing the support burden for new users and CI failures that are environment issues, not code issues.

### 8.3 Session summary MCP tool (inspired by `mem_session_summary`)

Engram's `mem_session_summary` saves an end-of-session summary so the next session has context on what happened. RAI has no equivalent — if an agent rejects several findings in session A, session B has access to the T4 events but no narrative summary of what was decided and why. A lightweight MCP tool `summarize_session(runId)` that produces a structured summary of findings reviewed + verdicts recorded in a given run would close this gap without violating the integrity model (it would be a read-only projection of T4, not a new write path).

### 8.4 Explicit delegation triggers in `AGENTS.md` (inspired by Gentle-AI's delegation trigger table)

Gentle-AI defines explicit rules for when an AI agent must delegate or pause rather than continuing autonomously (e.g. "touching 2+ non-trivial files → require review"). RAI should ship a recommended `AGENTS.md` snippet that projects can adopt, specifying when an agent must consult RAI before acting:

```markdown
## RAI consultation rules
- Before creating a new component: call analyze_repo({scope:'dirty'})
- Before any refactor touching >2 component files: call find_shared_opportunities()
- Before declaring a refactor complete: call get_drift({baseCommit, headCommit:'HEAD'})
```

Today this depends entirely on the agent's own judgment. Making it explicit and project-level means the behavior is consistent across agents and auditable.

### 8.5 Fingerprint identity browser (inspired by `engram tui`)

Engram ships a TUI (`engram tui`) for visually browsing, searching, and inspecting memories. RAI has no equivalent inspection surface for T3/T4/T5 — the only way to inspect findings and memory state is programmatically via MCP tools or directly querying SQLite. A `rai memory` TUI (or even a structured CLI output) that shows:
- All findings grouped by fingerprint
- Their T4 event history
- Current T5 weight + status (active / suppressed / amplified)
- Whether the fingerprint has drifted from its anchor

...would significantly lower the barrier to trusting and maintaining the memory layer.

---

## 9. Engram vs RAI memory — technical comparison and what RAI should adopt

> Reference: [Engram](https://github.com/Gentleman-Programming/gentle-ai/blob/main/docs/engram.md) — the persistent memory layer inside [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)

Engram and RAI's T4/T5 memory layer solve different problems and are not in competition. Understanding the tradeoffs points to one concrete gap RAI should close.

### Comparison

| | Engram | RAI T4/T5 |
|---|---|---|
| **What it stores** | Free-text observations (decisions, bugs, session context) | Structured feedback events keyed to architectural fingerprints |
| **Who writes** | The agent automatically, at any point in a session | Only via `record_feedback` — one controlled entry point |
| **Format** | Natural language + tags | Strict schema (verdict enum, source, weight_hint) |
| **Expiration** | No decay — memories do not expire | Half-life 180 days — old decisions lose weight gradually |
| **Auditability** | Text search | Deterministic replay: same T4 + `asOf` = identical T5 always |
| **Subject identity** | Project name string (prone to "my-app" vs "My-App" drift) | SHA256 structural fingerprint (survives rename, move, reformat) |
| **Team sharing** | `engram sync` → `.engram/` committed to git | T4 committable by design — no explicit CLI command yet |

### Where Engram has the advantage

- **Automatic capture** — the agent saves things without anyone asking. RAI requires an explicit `record_feedback` call, which creates friction in populating T4 organically.
- **Natural language context** — Engram can store "we decided not to extract this because the design was changing in Q3" with full narrative. RAI only stores a verdict enum + optional `reason` string that is not currently surfaced or searched.
- **Inspection UX** — `engram tui` is usable by any team member. RAI's memory is only inspectable via SQL or MCP calls.

### Where RAI has the advantage

- **Robust identity** — Engram's project-name identity drifts ("my-app" vs "My-App"); RAI's SHA256 structural fingerprint is stable across rename, move, and reformat.
- **Temporal decay** — a rejection from two years ago should not carry the same weight as one from last week. RAI models this mathematically; Engram has no expiration mechanism.
- **Anti-self-loop** — RAI refuses agent feedback on the agent's own findings. Engram does not distinguish between agent-authored and human-authored observations.
- **Credibility differentiation** — human=1.0 vs agent=0.3. Engram treats all observations equally regardless of source.
- **Deterministic replay** — same events + same `asOf` = same computed weights, always. Engram is not reproducible in this sense.

### The one thing RAI should adopt

The `reason` field in `record_feedback` already exists but is treated as inert — it is stored in T4 but never surfaced back to the agent or shown in `explain_finding`. Engram demonstrates how much value narrative context adds to a memory system.

**Concrete change:** treat `reason` as first-class. Surface it in `explain_finding` (under `memory.lastReason`), make it searchable, and show it in any future `rai memory` inspection surface. This would give RAI the narrative richness of Engram without adding a new write path or compromising the integrity model. The data is already being collected — it just needs to be read back.

---

## 10. Distribution and native dependency problem

> Context: [Gentle-AI](https://github.com/Gentleman-Programming/gentle-ai) ships as a single binary with zero runtime dependencies (written in Go). RAI requires Node.js + native compiled addons.

### The problem

RAI has two native dependencies that must be compiled on the user's machine during `npm install`:

- **`better-sqlite3`** — SQLite bindings, compiled via `node-gyp`
- **`sqlite-vec`** — vector extension for SQLite, also native

This requires Python, a C++ compiler (Xcode CLI tools on Mac, `build-essentials` on Linux, Visual Studio on Windows), and a matching Node.js version. The STATUS.md documents this as a known gotcha:

> *"If a CI image skips build scripts, run `node node_modules/.pnpm/better-sqlite3*/node_modules/.bin/prebuild-install -r node`"*

### Impact by context

| Context | Severity | Detail |
|---|---|---|
| Local dev (Mac/Linux) | Low | Most Node.js developers already have the toolchain |
| Local dev (Windows) | Medium | Requires Visual Studio build tools — non-obvious for many devs |
| CI (minimal Docker image) | High | Alpine/slim images often lack a C++ compiler — build fails silently |
| First-time install | Medium | `pnpm install` can fail with cryptic `node-gyp` errors |

### Three options to fix it

**Option A — Prebuilt binaries (lowest effort)**
Publish precompiled native bindings for Mac/Linux/Windows in each GitHub Release (as `better-sqlite3` itself does for stable versions). Users download the right binary, no compilation needed. Requires a CI matrix build per platform per release.

**Option B — Go CLI wrapper (highest impact, aligns with Gentle-AI model)**
Rewrite only the CLI (`@rai/cli`) in Go, compiling to a single distributable binary with no runtime dependencies. The TypeScript engine (`@rai/core`) remains as an npm library for programmatic use. The CLI binary communicates with a local Node.js server or embeds the engine via a subprocess. Users get `brew install rai` with zero setup friction — same as Gentle-AI.

**Option C — WASM SQLite (avoids native entirely)**
Replace `better-sqlite3` + `sqlite-vec` with a WebAssembly SQLite implementation (`@sqlite.org/sqlite-wasm`). No compilation, runs anywhere Node.js runs. Downsides: no production-ready vector extension equivalent to `sqlite-vec` yet; WASM SQLite is slower for large repos; loses the binary portability anyway since Node.js is still required.

### Recommendation

**Option A** for the near term — low effort, unblocks CI, no architectural change. **Option B** as a longer-term goal once the engine stabilizes: a Go CLI that ships as a single binary is the difference between "a library developers integrate" and "a tool developers install and trust." Gentle-AI's zero-dependency model is a significant adoption advantage worth replicating at the CLI boundary.

---

## 11. Eliminating the explicit `rai analyze` invocation

Today the user must explicitly run `rai analyze src/` before any findings are available. This is a friction point — the value of RAI is highest when data is always fresh without anyone having to think about it.

### Three approaches

**Option A — Git hook (automatic on commit)**

```bash
# .git/hooks/pre-commit
rai analyze src/ --scope=dirty --quiet
```

Runs automatically on every commit, scoping to dirty files only. The developer never calls it manually.

- **Pro:** completely transparent to the user
- **Con:** adds latency to every commit. On large repos, even a 2-3 second analysis will cause the team to disable it within days.

**Option B — File watcher daemon (`rai watch`)**

```bash
rai watch src/   # background process, listens for file changes
```

Every time a `.tsx` file is saved, T1 is updated incrementally in the background. When `rai analyze` or a MCP tool is called, the heavy work is already done and the response is near-instant.

- **Pro:** `rai analyze` becomes instant; no per-commit latency
- **Con:** consumes background resources; requires implementing the watch mode (not in the current roadmap)

**Option C — MCP triggers analysis automatically (already possible today)**

If Claude Code is configured with RAI as an MCP server, Claude can call `analyze_repo` on its own before answering questions about React code — without the user asking. This already works in the MVP if the agent's system prompt includes the instruction.

- **Pro:** no new infrastructure; the user just talks to Claude naturally
- **Con:** depends on the agent's judgment; not consistent across all agents or system prompts

### Recommendation

Do not make `rai analyze` fully automatic on every file save — the cost/benefit ratio is wrong for local development. The right model per context:

| Context | Approach | Why |
|---|---|---|
| Local development | `rai watch` (Option B) — incremental, silent | No commit latency; always-fresh data when needed |
| CI / PR open | GitHub Action always runs `rai analyze` | No UX friction in CI; PR review agent needs fresh data |
| Claude Code session | Claude calls `analyze_repo` via MCP (Option C) | User talks naturally; agent consults RAI when context is React |

The ideal end state: **the user never types `rai analyze`** — but there are always fresh findings available when the agent or CI needs them. Option C is the nearest-term win since it requires no new code; Option B is the long-term solution for local development.

---

## 12. AGENTS.md routing rules — capability-based, not tool-name-based

When RAI is used alongside other MCP tools (dependency graphs, knowledge graphs, blast-radius analyzers), the risk is that the agent calls all available tools for every question — increasing token usage instead of reducing it. The solution is an `AGENTS.md` that routes by **question type**, not by tool name.

### Why question-based routing, not tool-name routing

If the instructions say "use RAI for architecture, use code-review-graph for impact analysis", they break the moment either tool is replaced or renamed. If they describe what each *capability* answers, the routing stays valid regardless of which tool provides it.

### Recommended AGENTS.md snippet for RAI

```markdown
## When to use RAI tools

Use RAI tools when the question is about React component architecture:
- "Are there similar components that could be unified?"
- "Has this architectural decision been made before?"
- "What is the structural pattern of this codebase?"
- "Is this component drifting from the team's established patterns?"

For these questions, call RAI INSTEAD OF reading .tsx files directly.

## What RAI does NOT answer

Do not call RAI for:
- "Which files are affected by this change?" → use a dependency/impact tool
- "What connects module X to module Y in general?" → use a graph query tool
- "What does this function do?" → read the file directly

RAI answers architectural questions about React components specifically.
If the question is about file dependencies, call impact analysis tools.
If the question is about general code connections, use graph query tools.
```

### The key lines

The negative rules ("do NOT call RAI for X") are as important as the positive ones. Without them the agent calls every available tool defensively. With them, each capability has an exclusive domain and the agent routes by the nature of the question automatically.

This pattern generalizes: any MCP tool that has overlapping surface area with another should have its `AGENTS.md` entry defined by what it uniquely answers, not by what it is called.

---

## 13. `rai install` — platform-aware agent onboarding

RAI is protocol-agnostic (MCP stdio), but the user experience of setting it up is not. Each AI coding platform reads its instructions and MCP configuration from a different location:

| Platform | MCP config | Instructions |
|---|---|---|
| Claude Code | `~/.claude.json` | `CLAUDE.md` |
| Cursor | `~/.cursor/mcp.json` | `.cursor/rules/*.mdc` |
| GitHub Copilot | `.vscode/mcp.json` | `.github/copilot-instructions.md` |
| Windsurf | `~/.windsurf/mcp.json` | `.windsurfrules` |
| Codex | `~/.codex/config.json` | `AGENTS.md` |

Without a `rai install` command, the user must know all of these paths and manually write the correct config for each platform they use. This is a meaningful barrier to adoption and a correctness risk — an MCP entry written to the wrong path silently does nothing.

### How similar tools solve this

Three tools in the ecosystem already have this problem and their solutions are worth comparing before deciding on RAI's approach:

**code-review-graph** (Python, `pip install code-review-graph`)
https://github.com/tirth8205/code-review-graph

`code-review-graph install` auto-detects which platforms are present (by checking known config paths) and writes the MCP config + routing instructions for each one. `--platform X` targets a specific platform. Supports 13+ platforms. Also writes platform-native hooks/skills where supported. The install command is feature-central — it's part of the core onboarding story, not a secondary concern.

**graphify** (Python, `pip install graphify`)
https://github.com/safishamsi/graphify

Same pattern: `graphify install --platform cursor`, `graphify install --platform copilot`, etc. Minimalist in the instructions it injects — 4-5 lines per platform (just the trigger rules, no verbose explanation). The AGENTS.md that install writes is intentionally short.

**gentle-ai** (Go installer)
https://github.com/Gentleman-Programming/gentle-ai

The installer IS the product — its entire value is knowing the correct config path for every agent platform and writing the right files. Overkill as a standalone tool, but the knowledge of paths is useful.

### Decision for RAI

The right approach combines code-review-graph's architecture with graphify's content minimalism:

1. **`rai install [--platform X]`** as a subcommand of `@rai/cli`. TypeScript can know all platform paths without a separate Go binary — no new package needed.
2. **Auto-detection**: if `~/.cursor/` exists → install for Cursor; if `~/.claude.json` exists → install for Claude Code; etc. Users with multiple agents get all of them configured in one run.
3. **Injected instructions**: minimal (graphify style). 4-5 lines per platform covering: when to call `analyze_component`, when to call `get_drift`, what RAI does NOT answer (see §12). Not a README.
4. **No external dependency**: the install writes static config, no runtime agents, no registration with any external service.

### What needs to be decided before implementing

- Which platforms to support in MVP vs later (at minimum: Claude Code, Cursor, Copilot)
- Whether to overwrite existing configs or append/merge safely
- Whether the generated MCP entry uses `npx @rai/cli serve` (no global install required) or assumes global `rai`
- How to handle monorepos where different workspaces use different agents

---

## 14. Shared team memory — T4/T5 committed to the repo

Today RAI's SQLite is local. Developer A records "wontfix CtaButton" → their T4 knows it. Developer B starts a session and gets the same finding again — their T4 is empty. In a team of 5, each developer accumulates divergent memory.

The solution does not require a server. The schema already anticipates this:

- **T4 (`feedback_event`) committed to the repo** — each developer's feedback events are appended, committed, and pushed. Since T4 is append-only and every row has a ULID (sortable, globally unique), merging two developers' event logs is deterministic: merge by ULID ordering, deduplicate by `id`. No conflict resolution needed.
- **T5 (`weight`) recomputed on pull** — T5 is a materialized view of T4. After a `git pull`, a `rai sync` recomputes T5 from the merged T4. Every developer gets the same weights.
- **`rai sync`** — a CLI command that merges local T4 with the committed version, recomputes T5, and reports what changed.

```bash
rai sync
# → merged 3 new feedback events from teammates
# → weight updated: fp-a1b2c3 (CtaButton cluster) → suppressed (team rejected 2026-05-28)
```

This converts RAI from a personal tool to a team-level architectural memory. The moat grows with team size, not just with time.

**What needs to be decided:**
- Git strategy: commit the `.rai/` db file directly, or export T4 as a human-readable JSONL and commit that instead (JSONL is more diff-friendly and reviewable in PRs)
- Conflict resolution when two developers record opposing verdicts for the same fingerprint on the same day
- Whether T3 (findings) should also be committed, or regenerated on demand

---

## 15. CI/PR integration — architectural visibility at review time

RAI's findings exist in the session context of a developer who asks. Without CI integration, a developer who never runs `analyze_repo` never sees the finding. A PR can introduce a new duplicate component and merge undetected.

A `rai check --diff HEAD~1` command that:
1. Runs `analyze_repo` on the changed files
2. Compares findings against the committed T3 baseline
3. Reports **net new findings** introduced by this PR — not all findings, only regressions

```bash
# In CI (GitHub Actions, etc.):
rai check --diff origin/main --format github-pr-comment
```

Output (as a PR comment):

```
RAI: 1 new architectural finding in this PR

⚠️  CheckoutButtonV2 is 87% structurally similar to 3 existing components:
    CtaButton · LoginButton · SignupBtn
    
    Options: extract a shared component, or record this as intentional (wontfix).
    Run: rai mcp . → record_feedback
```

This does not block the PR. It is informational, visible, and actionable. It is also the primary adoption channel — developers who never run RAI locally will see it in PR reviews.

**Implementation path:** `rai check` is a CLI command on top of the existing `analyzeRepo` engine. The diff logic is a set-algebra comparison between new findings and the T3 snapshot at `origin/main`. No new architecture needed — only a new CLI command and a GitHub Actions example in the README.

---

## 16. `rai explain <file>` — memory inspection without an agent session

Without an agent session, there is no way to ask RAI what it knows about a specific component. A developer debugging unexpected agent behavior ("why did it suppress this finding?") has no tool to inspect the memory.

```bash
rai explain src/components/Button.tsx
```

Output:

```
Button.tsx — 2 components found

  PrimaryButton  fp: a1b2c3...
    Last seen:   2026-05-28 (run-xyz)
    Findings:    1 active (shared-extraction, warn)
    Memory:      weight=-0.8 (rejected 2026-04-12 by human)
    Decision:    "wontfix — intentional divergence from LoginButton"

  SecondaryButton  fp: d4e5f6...
    Last seen:   2026-05-28 (run-xyz)
    Findings:    none
    Memory:      no feedback recorded
```

This surfaces T3 + T4 + T5 in a readable format. It also makes the `reason` field in T4 (gap §3.5) useful — the decision note appears directly here.

**Implementation:** a CLI command that queries the SQLite db directly by file path, joins T3/T4/T5, and formats the output. Low implementation cost — the data is already stored, only the presentation layer is missing.

---

## 17. Sprint digest — architectural health metric for tech leads

RAI accumulates findings and feedback over time, but there is no summary surface for technical leadership. A tech lead has no way to see "is our architectural debt growing or shrinking this sprint?"

```bash
rai digest --since 1w
```

Output:

```
RAI Architecture Digest — week of May 26, 2026

  New findings:        3  (+2 shared-extraction, +1 boundary-violation)
  Resolved this week:  1  (CtaButton cluster → extracted, accepted 2026-05-27)
  Drifted components:  2  (CheckoutForm, AuthModal changed structurally)
  Wontfix backlog:     7  (findings with no decision, oldest: 2026-04-02)
  
  Most active files:
    src/components/forms/  — 2 new findings
    src/features/checkout/ — 1 boundary violation
```

This is a `rai digest` CLI command + a potential MCP tool (`get_digest`) for agents that need to brief a tech lead. It answers "is the architecture getting better or worse?" — a question no other tool in the ecosystem answers for React specifically.

**Implementation:** pure SQL aggregation over T3/T4/T5 + snapshot. No new data collection needed — the tables already have everything required. The hardest part is deciding which metrics matter and calibrating the format for readability.
