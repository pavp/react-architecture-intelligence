## Exploration: more-analyzers

### Current State
P4 docs call for `coupling`, `hook-topology`, `over-abstraction`, and `boundary-violation` analyzers, but current core only registers `react/shared-extraction`. C3 is archived and `analyzeRepo` now executes analyzers in registry order with try/catch diagnostics, so adding analyzers is safer than before.

Analyzers are pure sync functions over frozen `AnalysisContext`: `ctx.graph`, read-only memory/config, `ctx.types.typeOf()`, run metadata, and config boundary rules. `ctx.types.typeOf()` still returns `null`; C2b/ts-morph remains deferred. Current graph facts are enough for several structural analyzers: `ComponentNode` has file/name/exportKind, prop names, hook call names, JSX child component names, composition markers, and conditional branch count; `RepoGraph.edges` currently contains only name-resolved `renders` edges. `Pass1Result.imports` exists, and `EdgeKind` includes `imports`, `calls`, and `uses-hook`, but `buildGraph` only constructs `renders`. There are no Hook nodes, no prop-flow `passes` edges, no symbol table, and no type info.

Feasibility with current data:
- `coupling`: pure now for component render coupling only: fan-in, fan-out, direct child count, reachable render depth. Module import coupling needs `buildGraph` import edge construction; type info not needed.
- `over-abstraction`: pure now for large/general-purpose components using `propNames.length`, `hookCalls.length`, `childComponents.length`, `compositionMarkers`, and `conditionalBranches`. Type info would improve precision for prop complexity but is not required for observable value.
- `boundary-violation`: pure now for configured boundary crossings across existing `renders` edges and component file pairs. Import boundary violations need import edge construction; type info not needed.
- `hook-topology`: partial pure now for component-level hook density/repeated hook sets from `ComponentNode.hookCalls`. True hook topology (`uses-hook Hook -> Hook`, custom hook fan-in/fan-out/composition chains) needs parser/graph enrichment, not C2b, because it needs hook declarations/call graph facts rather than prop/type semantics.

### Affected Areas
- `docs/gaps.md` — source of P4 analyzer list plus graph edge gaps: imports ignored, `uses-hook` inert, `renders` topology unanalyzed.
- `docs/superpowers/STATUS.md` — roadmap says more analyzers are pure and belong in registry, but C2b remains deferred unless needed.
- `docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md` — defines P4 exit criteria, analyzer purity, RepoGraph target shape, temporal/coupling examples, and review/performance constraints.
- `packages/core/src/analyzers/analyzer.ts` — stable analyzer seam; no contract change needed for pure C4 analyzers.
- `packages/core/src/analyzers/registry.ts` — registry order/duplicate behavior supports adding analyzers; session registration must include new rules.
- `packages/core/src/analyzers/shared-extraction.ts` — pattern source for pure analyzer shape, deterministic sorting, evidence construction, boundary glob matching, and fingerprinting.
- `packages/core/src/types.ts` — `Evidence` union currently only has `SharedExtractionEvidence`; C4 must add typed evidence variants and keep prose out of findings.
- `packages/core/src/config/schema.ts` — C4 needs tier-2 thresholds for analyzer knobs; defaults must be conservative and documented.
- `packages/core/src/parse/pass1.ts` — already captures component facts and imports; hook-topology truth needs parser enrichment for custom hook declarations/composition.
- `packages/core/src/parse/graph-build.ts` — currently builds only `renders` edges; import/hook/call analyzers need graph enrichment here, not ts-morph.
- `packages/core/src/engine/pipeline.ts` — C3 diagnostic containment already protects new analyzers; no runtime contract change needed.
- `packages/core/src/mcp/tools.ts` / `packages/core/src/index.ts` — new analyzers must be registered/exported so MCP/CLI analysis sees them.
- `packages/core/src/analyzers/*.test.ts` and `packages/core/src/engine/golden.test.ts` — Strict TDD surface for rule behavior, determinism, and integration counts.

### Approaches
1. **Single C4 with four analyzers** — implement all requested analyzers plus required evidence/config/registry wiring in one change.
   - Pros: satisfies roadmap label directly; one proposal/spec/design cycle; proves analyzer framework breadth quickly.
   - Cons: high review-size risk over 400 lines; evidence/config/schema churn multiplies; hook-topology would either be shallow or drag parser enrichment into same PR; harder TDD/debug loop.
   - Effort: High

2. **Chained C4 analyzer slices** — split by current-data availability and keep parser enrichment separate from pure analyzers.
   - Pros: protects 400-line budget; each slice has crisp behavior and tests; avoids premature ts-morph; lets first PR ship immediate value from existing graph.
   - Cons: more SDD artifacts/PRs; P4 checklist completes over multiple changes rather than one.
   - Effort: Medium

3. **Graph-enrichment-first C4** — first build imports/calls/uses-hook/passes edges, then implement all analyzers afterward.
   - Pros: richer analyzer surface; closer to original spec graph model.
   - Cons: delays user-visible findings; larger parser/graph risk; may exceed review budget before any analyzer proves value; still does not justify ts-morph.
   - Effort: High

### Recommendation
Use chained C4 analyzer slices. Start with pure analyzers that use current data only: `react/render-coupling` (or `react/coupling` scoped explicitly to render topology) and `react/over-abstraction`. Both need no C2b, no parser enrichment, and no new I/O; they only add evidence types, conservative config thresholds, analyzer files/tests, registry/session exports, and integration assertions.

Then add `react/boundary-violation` for `renders` boundary crossings as a separate small slice. It can reuse existing `boundaryRules` and glob semantics, but should be distinct from shared-extraction's cluster boundary classification because it detects direct architectural violations, not extraction conflicts.

Defer full `hook-topology` until parser/graph enrichment builds Hook nodes or equivalent custom hook facts plus `uses-hook` edges. A shallow hook-density rule can be folded into over-abstraction if valuable, but naming it `hook-topology` before topology exists would be misleading. C2b/ts-morph should stay deferred: none of the first implementable C4 analyzers needs type info for observable behavior.

Strict TDD approach for first slice:
1. RED unit tests for `render-coupling`: fixture graph with component A rendering many children, component B rendered by many parents, and a deep render chain; assert stable finding count, evidence metrics, severity thresholds, and deterministic order.
2. RED unit tests for `over-abstraction`: component with too many props/hooks/children/branches emits one finding; below-threshold component emits none; evidence has only structural counts/spans.
3. GREEN minimal analyzers, local fingerprint helpers, and config defaults.
4. RED integration test proving both analyzers are registered in `Session`/pipeline and a throwing analyzer still does not block them if using registry-level focused test.
5. GREEN exports/registration; run focused tests, full `pnpm test`, and `pnpm typecheck`.

### Risks
- Evidence union growth touches central `types.ts`; poor naming now becomes persisted contract.
- Registering multiple analyzers changes MCP counts/top fingerprints; golden tests may need intentional updates.
- `coupling` name may overpromise module/import coupling when current implementation can only see render topology; rule name/evidence must be honest.
- Boundary matching with only `renders` edges misses import-only violations until `imports` edges are constructed.
- Hook-topology without hook graph facts risks shallow lint-like output; defer or rename until topology exists.
- Four analyzers plus tests/config/exports likely exceed 400 changed lines; chaining recommended.

### Ready for Proposal
Yes — propose C4 as chained work, not one large PR. Tell user first implementable change should be `more-analyzers-render-overabstraction` (or C4a under `more-analyzers`) covering render coupling and over-abstraction with current graph data only; explicitly defer ts-morph/C2b and full hook topology until a later parser-enrichment slice proves observable value.
