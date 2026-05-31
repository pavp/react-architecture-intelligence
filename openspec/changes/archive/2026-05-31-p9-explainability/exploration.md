## Exploration: P9 Explainability

### Current State
RAI is ready for an explainability slice, but current output is still tool-facing. `rai analyze [dir]` always prints JSON with counts, diagnostics, and `topFingerprints`; CLI commands are limited to `analyze`, `backfill`, `install`, `doctor`, `mcp`, and `help`. There is no `rai explain <file>` command, no human output mode for findings, and no root `README.md` in the repository.

MCP already exposes `explain_finding`, implemented by `Session.explainFinding`. It returns the full presented finding, raw evidence, `groundingFields: Object.keys(f.evidence)`, and memory overlay summary. Tests explicitly assert there is no prose field, so P9 must preserve deterministic evidence while adding bounded human-readable summaries.

Evidence terms are defined structurally in `packages/core/src/types.ts` and produced by analyzers/adapters. Key terms include `cosine`, `propOverlap`, `hookOverlap`, `sharedSurface`, `variancePoints`, `span`, `diagnostic`, `fanIn`, `fanOut`, `directChildren`, `reachableDepth`, `roles`, `metrics`, `thresholds`, and `topology`. These are good glossary inputs, but currently readers must infer meaning from JSON and source code.

Install instructions already inject short RAI routing guidance into agent files, but onboarding docs are missing. `docs/ROADMAP.md` and `docs/STATUS.md` state P9 must add README quick start, finding-reading guidance, and limitations.

### Affected Areas
- `packages/cli/src/cli.ts` — command parser, usage text, `runAnalyze`, and new `explain` UX likely live here; current CLI emits JSON only except `doctor` text.
- `packages/cli/src/cli.test.ts` — covers parser, command output, adapter composition, install, and doctor; will need tests for `explain`, human analyze output, and help text.
- `packages/core/src/mcp/tools.ts` — `explainFinding` currently returns raw evidence + grounding fields; best place for a reusable deterministic explanation envelope if shared with CLI.
- `packages/core/src/mcp/tools.test.ts` — already protects “no prose” behavior; tests must be revised or extended so prose is bounded/derived, not invented.
- `packages/core/src/mcp/server.ts` — MCP tool description and serialized output may need updated wording/shape if `explain_finding` gains human-readable fields.
- `packages/core/src/mcp/server.test.ts` — tool registration/schema expectations likely unchanged, but description/output behavior may need coverage.
- `packages/core/src/types.ts` — evidence/glossary source terms are modeled here; avoid changing core facts unless adding presentation-only types.
- `packages/core/src/analyzers/*.ts` — analyzer evidence producers should remain unchanged; P9 should interpret their output, not rewrite detection.
- `packages/adapter-next/src/route-coupling.ts` and `packages/adapter-next/src/client-boundary-bloat.ts` — adapter-metric evidence has extra terms (`roles`, `thresholds`, `topology`) that glossary/explanations must cover.
- `packages/cli/src/install/templates.ts` — agent instruction wording may mention `rai explain` once command exists, but keep install guidance bounded.
- `README.md` — missing today; P9 should create root onboarding README with quick path, install, first commands, finding-reading guide, and limitations.
- `docs/STATUS.md` and `docs/ROADMAP.md` — update after implementation to record P9 slice status, not during exploration.

### Approaches
1. **Presentation layer over existing facts** — add pure formatting/glossary helpers that consume `PresentedFinding`/evidence and emit bounded summaries for MCP + CLI.
   - Pros: preserves analyzer truth, keeps @rai/core framework-agnostic, shares one explanation contract between `explain_finding` and `rai explain`.
   - Cons: needs careful tests to prevent “helpful” prose from implying intent not in evidence.
   - Effort: Medium

2. **CLI-only human formatting** — leave `explain_finding` raw and implement all human explanations in `@rai/cli`.
   - Pros: lower core API churn, less MCP test update risk.
   - Cons: duplicates logic later, MCP stays hard to use, violates P9 goal to improve `explain_finding`.
   - Effort: Low

3. **Analyzer-authored explanations** — add description text near each analyzer output.
   - Pros: explanations live close to evidence production.
   - Cons: couples detection with presentation, increases analyzer noise, risks changing core facts and future adapter coupling.
   - Effort: High

### Recommendation
Use **Presentation layer over existing facts**. Add deterministic explanation/glossary helpers in core that map known evidence kinds and fields to bounded text: what RAI found, why it matters, what to inspect first, and what not to assume. Keep analyzer outputs unchanged. Have `explain_finding` include the structured explanation envelope alongside raw evidence, and have `rai explain <file>` run analysis, filter findings for the file/evidence spans, and render the same facts in human-readable CLI output with optional JSON if needed.

For docs, create root `README.md` using cognitive-doc-design patterns: lead with what RAI does, quick path, install command, first `rai doctor`/`rai analyze`/`rai explain` commands, how to read findings, glossary table, limitations, and next steps. This reduces reader recall load and keeps onboarding grounded in actual commands.

### Risks
- `explain_finding` currently has a test asserting no prose; changing shape must preserve “no invented intent” via explicit bounded summary fields and tests.
- `rai explain <file>` depends on mapping findings to files/spans across all evidence kinds; shared-extraction can involve multiple files, while boundary/adapter evidence has nested subjects/edges.
- Human text may imply remediation beyond evidence. Tests should assert summaries use only rule/evidence/glossary data and include “what not to assume”.
- Root README creation may be larger than a pure code slice; keep first version quick-path focused to stay under review budget.
- JSON backward compatibility for MCP/CLI consumers should be considered; additive fields are safer than replacing raw evidence.

### Ready for Proposal
Yes — propose a P9 first slice scoped to presentation-only explainability: glossary + deterministic explanation helpers, additive `explain_finding` output, `rai explain <file>` UX, README onboarding, and tests for core helpers/MCP/CLI/docs-relevant command behavior. Tell the user this slice must not change analyzer predicates, fingerprints, evidence shapes, or memory write semantics.
