# Exploration: P11 React Pattern Analyzers + Pattern Drift

Date: 2026-05-31
Change: `p11-react-pattern-analyzers-pattern-drift`
Phase: explore only; no implementation.

## Status

`complete`

## Executive summary

P11 should not attempt the full roadmap scope in one apply pass. The roadmap target spans compound components, container/presenter, controlled/uncontrolled, provider/context, forms, data fetching, design-system usage, overlays, and API conventions. That is likely above the 800-line session budget and above the 400-line chained-PR skill guardrail.

Recommended first slice:

1. Add adapter-owned React analyzer infrastructure in `packages/adapter-react`.
2. Load React adapter analyzers through CLI/MCP adapter composition without importing React logic into `packages/core`.
3. Implement one concrete analyzer family: compound component / compound primitive API drift, grounded in P10 `RepoGraph.patternFacts`.
4. Treat “pattern drift” in this slice as deterministic current-repo divergence between observed compound API declarations and observed JSX usage. Existing `get_drift` already handles historical finding drift once stable findings are emitted.
5. Defer the remaining React pattern families to follow-up work units.

No tests were run. No code was changed.

## Skill resolution

`paths-injected`

Loaded exact requested skills before work:

- `/Users/macbook/.config/opencode/skills/chained-pr/SKILL.md`
- `/Users/macbook/.config/opencode/skills/work-unit-commits/SKILL.md`

## Context read

Canonical project/OpenSpec context:

- `CLAUDE.md`
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `openspec/config.yaml`
- `p11/init.md`
- `openspec/specs/pattern-fact-extraction/spec.md`
- `openspec/specs/react-pattern-catalog/spec.md`
- P10 archived design/tasks/verify context

Relevant source inspected:

- `packages/core/src/types.ts`
- `packages/core/src/analyzers/analyzer.ts`
- `packages/core/src/analyzers/registry.ts`
- `packages/core/src/parse/pass1.ts`
- `packages/core/src/parse/graph-build.ts`
- `packages/core/src/graph/repograph.ts`
- `packages/core/src/memory/snapshot-store.ts`
- `packages/core/src/mcp/tools.ts`
- `packages/core/src/explainability/explain.ts`
- `packages/core/src/explainability/file-refs.ts`
- `packages/adapter-react/src/catalog.ts`
- `packages/adapter-react/src/catalog.test.ts`
- `packages/adapter-react/package.json`
- `packages/adapter-next/src/core-adapter.ts`
- `packages/adapter-next/src/route-coupling.ts`
- `packages/adapter-next/src/client-boundary-bloat.ts`
- `packages/cli/src/adapters.ts`
- `packages/cli/src/adapters.test.ts`
- `fixtures/react/compound-primitives/modal.tsx`
- `fixtures/react/compound-primitives/popover.tsx`

## Existing P10 foundation

P10 gives P11 enough foundation for a first analyzer slice:

- `RepoGraph.patternFacts` exists and is sorted, deduped, JSON-safe, and frozen.
- Core fact kinds are framework-neutral:
  - `import`
  - `export`
  - `call`
  - `jsx`
  - `hook-call`
  - `member-assignment`
  - `file-role-seed`
- `packages/core` intentionally contains no React catalog intent.
- `packages/adapter-react` exists as a workspace package.
- `packages/adapter-react/src/catalog.ts` defines a React catalog scaffold with a `compound-primitive` signature.
- P10 fixtures cover Modal/Popover compound primitive syntax:
  - namespace import
  - static member assignment
  - dot-member JSX
  - trigger/content children
  - alias/re-export forms

Important limitation: P10 facts are syntax observations only. They do not resolve symbols or prove React intent.

## Existing seams P11 should reuse

### Analyzer seam

Analyzers implement pure synchronous `Analyzer`:

- `ruleId: string`
- `framework: string`
- `analyze(ctx: AnalysisContext): AnalyzerResult`

`AnalysisContext.graph` is frozen. Analyzer failures are already isolated by the core pipeline into diagnostics, so adapter analyzers should not add custom outer failure handling.

### Adapter precedent

`packages/adapter-next` already demonstrates the correct direction:

- adapter depends on `@rai/core`
- core does not depend on adapter
- CLI composition loads adapter analyzers into the registry
- adapter findings use core `Finding` and `AdapterMetricEvidence`

React analyzer infrastructure should mirror this model.

### Snapshot drift seam

Existing `get_drift` is historical set algebra over the `snapshot` table. It compares `(fingerprint, rule_id)` and `evidence_digest`.

P11 pattern findings will automatically participate in historical drift if they have:

- stable structural fingerprints
- stable evidence ordering
- deterministic evidence JSON

## Recommended first-slice semantics

### React pattern analyzer

Add a React adapter analyzer with a focused rule such as:

- `react/compound-component-api-drift`

Suggested behavior:

- Build compound family candidates from P10 facts:
  - `member-assignment` facts like `Modal.Trigger = ModalTrigger`
  - `jsx` facts like `<Modal.Trigger>` and parent/root tags like `<Modal>`
  - optional `export` facts for alias/re-export grounding
  - optional `import` facts for primitive provenance, without requiring symbol resolution
- For each root object, derive:
  - declared parts from static member assignments
  - used parts from dot-member JSX
  - missing declarations: JSX uses with no matching static member assignment
  - unused declarations: assigned members never observed in JSX, if chosen conservatively
- Emit findings only for divergences, not for healthy pattern detection alone.

This keeps output deterministic and avoids inventing intent. The analyzer can say “observed JSX member usage diverges from observed static member declarations,” not “team intended a compound component.”

### Pattern drift

Disambiguate two meanings:

1. **Historical drift**: existing `get_drift` comparing snapshots across commits.
2. **Repo-local pattern divergence**: current-source finding when observed pattern usage diverges from observed repo facts.

Recommendation for P11-S1:

- Define repo-local divergence in a new pattern-drift spec.
- Do not add a new MCP drift tool in S1.
- Let historical drift work through existing `get_drift` once the new findings are persisted.
- Use “pattern divergence” wording in evidence/docs where helpful to avoid confusing it with snapshot drift.

## Evidence shape decision

Current `Finding.evidence` is a closed core union. Adapter findings can already reuse:

- `AdapterMetricEvidence`

Pros of reusing `adapter-metric` in S1:

- avoids core `Evidence` union churn
- avoids explainability/file-ref/MCP updates
- keeps first slice smaller and under budget
- follows `@rai/adapter-next` precedent

Cons:

- awkward for multi-fact pattern evidence
- only one primary `subject.span`
- roles/metrics/topology fields are not semantically rich for pattern facts

Recommendation:

- For S1, reuse `AdapterMetricEvidence` if the analyzer can express divergence with a primary subject, metrics, thresholds, and topology/exceeded keys.
- In design, explicitly record that richer generic adapter-pattern evidence may be a follow-up if provider/forms/API convention analyzers need multi-span evidence.
- If new evidence is added, it must be generic and adapter-owned in content, e.g. no React-specific type names in core.

## Likely OpenSpec artifacts

Create:

- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/proposal.md`
- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/design.md`
- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/tasks.md`
- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/specs/react-pattern-analyzers/spec.md`
- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/specs/pattern-drift/spec.md`

Possible existing spec touched after archive:

- `openspec/specs/react-pattern-catalog/spec.md` if catalog responsibilities expand beyond scaffolding.

## Likely implementation domains

Recommended S1 source/test domains:

- `packages/adapter-react/src/core-adapter.ts`
  - create React core analyzers for registry composition
- `packages/adapter-react/src/compound-component-api-drift.ts`
  - pure adapter analyzer over `RepoGraph.patternFacts`
- `packages/adapter-react/src/*.test.ts`
  - strict TDD tests for analyzer candidates, divergences, deterministic ordering, and no memory writes
- `packages/adapter-react/src/index.ts`
  - export analyzer factory
- `packages/cli/src/adapters.ts`
  - load both Next and React adapters
- `packages/cli/src/adapters.test.ts`
  - adapter composition and unavailable-adapter diagnostics
- `fixtures/react/compound-primitives/*`
  - add one divergent fixture if needed

Avoid unless design approves evidence expansion:

- `packages/core/src/types.ts`
- `packages/core/src/explainability/*`
- `packages/core/src/mcp/tools.ts`

## Proposed work-unit split

### Work unit 1: React adapter analyzer composition

Goal:

- Add `createReactCoreAnalyzers` outside core.
- Load React analyzers alongside Next analyzers from CLI adapter composition.
- Preserve no-op behavior when adapter is unavailable.
- Preserve deterministic diagnostics for unexpected import failures.

Review risk: medium.

### Work unit 2: Compound component API drift analyzer

Goal:

- Consume frozen `graph.patternFacts`.
- Detect static-member/JSX dot-member divergence.
- Emit deterministic findings with stable fingerprints and stable evidence order.
- Add Modal/Popover positive tests and a divergent fixture test.

Review risk: medium.

### Work unit 3: Specs/docs/status

Goal:

- Record P11-S1 behavior, non-goals, and review forecast.
- Clarify pattern drift terminology.
- Defer broader pattern families.

Review risk: low.

If forecast exceeds 800 changed lines, stop before apply and ask for slicing. If forecast exceeds 400 changed lines, chained-pr skill says split unless maintainer accepts an exception.

## Dependencies

- P10 pattern facts and React catalog scaffold.
- Existing pure analyzer registry and pipeline isolation.
- Existing snapshot persistence and `get_drift`.
- Existing CLI adapter composition.
- Existing explainability behavior for `adapter-metric`.
- Strict TDD from `openspec/config.yaml`.

No new runtime dependency appears necessary for S1.

## Risks

### Scope risk

Full P11 is too broad for one PR. Start with compound components and minimal pattern divergence. Defer other families.

### Core-boundary risk

React-specific pattern labels, catalog logic, or analyzer imports must not enter `packages/core`.

### Evidence-shape risk

`AdapterMetricEvidence` may be too generic for later pattern families. A new evidence shape would require core type, explainability, file-ref, MCP span, and tests. Keep S1 small unless design chooses otherwise.

### Drift terminology risk

Existing `get_drift` already means historical snapshot drift. P11 “pattern drift” may mean intra-repo convention divergence. Specs must disambiguate.

### Symbol-resolution risk

P10 facts are raw syntax. Matching must be conservative. Avoid claiming symbol identity when only names match.

### False-positive risk

A dot-member JSX expression can be unrelated to static assignments. S1 should require multiple corroborating facts, e.g. same root object with member assignment and JSX member usage, before emitting divergence.

### Adapter activation risk

`@rai/adapter-react` exists but CLI currently loads only `@rai/adapter-next`. P11 findings are invisible until adapter composition loads React.

### Review-budget risk

Adapter composition + analyzer + fixtures + docs/specs can approach the 800-line budget. Keep S1 narrow and plan chained follow-ups.

## Non-goals for first slice

- No provider/context analyzer.
- No controlled/uncontrolled analyzer.
- No forms analyzer.
- No data-fetching analyzer.
- No design-system usage analyzer.
- No overlays analyzer beyond compound primitive fixture evidence.
- No API convention analyzer.
- No LLM-based findings.
- No memory writes from React adapter.
- No core React imports.
- No broad new MCP pattern query tool.

## Recommended acceptance themes

Specs/tasks should require:

- React analyzer logic MUST live outside `packages/core`.
- Analyzers MUST consume only frozen `RepoGraph` data, config, and adapter-owned catalog metadata.
- Findings MUST be deterministic, grounded, and append-only through the existing engine.
- Pattern evidence MUST include stable file/span references.
- Fingerprints MUST be stable across identical source input.
- Evidence arrays/maps MUST be sorted before persistence.
- Analyzer diagnostics MUST use existing pipeline isolation.
- Historical drift MUST continue through existing snapshot/get_drift behavior.
- Tests MUST be written before implementation.

## Verification performed

- Read injected skills.
- Read canonical repo docs and OpenSpec config/specs.
- Read P11 init context.
- Read relevant P10 code, fixtures, adapter seams, evidence/explainability, and snapshot drift code.
- Did not run tests.
- Did not modify files.
- Did not save Engram; memory tools unavailable in this subagent surface.
