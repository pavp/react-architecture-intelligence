## Exploration: P6 Slice 6 — CLI adapter loading + docs

### Current State

`rai analyze` currently creates a default core session only: `runAnalyze()` resolves config, calls `createSession({ config })`, reads sources, and returns `session.analyzeRepo({ files, asOf: 0 })`. `rai mcp` calls `serveStdio({ config, rootDir })`, and `buildMcpServer()` creates the same default session internally. Both paths rely on `Session` owning a private registry initialized with `createDefaultAnalyzerRegistry()`.

Core already has a deterministic analyzer registry and diagnostic channel. `analyzeRepo()` executes `registry.list()` in order, persists returned findings through the existing T3 path, overlays memory, snapshots persisted findings, and returns diagnostics separately. `Session.analyzeRepo()` preserves the MCP result shape: `counts`, `topFingerprints`, and `diagnostics`.

`@rai/adapter-next` exports detection, enrichment, variant guard, and two pure adapter analyzers, but those analyzers do not implement the core `Analyzer` interface directly. They expect adapter input `{ graph, detection, enrichment, thresholds?, runId, commitSha, analysisVersion }` and return `{ findings, diagnostics }`. Core `Analyzer.analyze(ctx)` can only return `Finding[]`; diagnostics are only produced when the analyzer throws. This is the main seam gap for Slice 6.

### Affected Areas

- `packages/cli/src/cli.ts` — CLI composition point for `rai analyze`, `rai mcp`, and `rai backfill`; currently no adapter loading or registry injection.
- `packages/core/src/mcp/tools.ts` — `Session` owns a private default registry and exposes no supported registration/composition API.
- `packages/core/src/mcp/server.ts` — MCP server creates its own default session, so `rai mcp` cannot receive CLI-loaded adapter analyzers without a new option.
- `packages/core/src/engine/pipeline.ts` — diagnostic contract cannot carry adapter `variant-mismatch` diagnostics from successful analyzers unless analyzer API grows or adapters encode diagnostics another way.
- `packages/core/src/analyzers/analyzer.ts` — core analyzer contract is `Finding[]` only; adapter analyzers return findings plus diagnostics.
- `packages/adapter-next/src/index.ts` — exports needed pieces: `detectNext`, `enrichNext`, `createClientBoundaryBloatAnalyzer`, `createRouteCouplingAnalyzer`.
- `packages/cli/package.json` — currently depends only on `@rai/core`; CLI cannot import or detect installed `@rai/adapter-next` as package metadata stands.
- `packages/cli/src/cli.test.ts` — has fixture-based CLI coverage but no adapter-loading fixture or MCP adapter regression.
- `openspec/specs/analysis-pipeline.md` — should gain adapter registration / adapter diagnostic flow requirements.
- `openspec/specs/mcp-tools.md` — should state `analyze_repo` result shape stays unchanged while counts/diagnostics include adapter outputs.
- `docs/superpowers/STATUS.md` and `docs/gaps.md` — should mark Slice 6 complete and close/update P6 CLI-loading docs debt.

### Approaches

1. **Core-supported registry composition + diagnostic-aware analyzer result** — Add a supported `SessionOpts.registry` or `SessionOpts.analyzers` seam, pass it through MCP server opts, and evolve analyzer execution to accept either `Finding[]` or `{ findings, diagnostics }`. CLI builds default registry, then conditionally registers Next adapter wrapper analyzers when `@rai/adapter-next` resolves.
   - Pros: Cleanest long-term seam; adapter variant diagnostics flow through existing `diagnostics` array; `analyze_repo` contract stays stable; no private field mutation; backfill can reuse the same composition.
   - Cons: Touches core analyzer contract/types and tests; must preserve existing analyzers unchanged via backward-compatible normalization.
   - Effort: Medium

2. **CLI-only private registry mutation** — Keep core contracts unchanged and cast `Session` to mutate its private `registry`, wrapping Next analyzers as core analyzers that drop adapter diagnostics or encode skips as findings.
   - Pros: Small code diff in CLI.
   - Cons: Breaks encapsulation; loses required diagnostics or pollutes findings; poor MCP parity; fragile under TypeScript private-field refactors.
   - Effort: Low initially, high risk

3. **Core imports adapter directly** — Register `@rai/adapter-next` inside `createDefaultAnalyzerRegistry()` or core session startup.
   - Pros: Straightforward runtime path.
   - Cons: Violates P6 exit criteria and invariant that `packages/core` has no framework strings/imports; lint should reject this.
   - Effort: Low but unacceptable

### Recommendation

Use Approach 1. Treat CLI as the composition root and core as the framework-agnostic execution host. Add a small public registry/session injection seam in core, keep default React analyzers as the baseline, and make analyzer execution normalize both legacy `Finding[]` and new diagnostic-aware results. Then add adapter wrapper analyzers in CLI that lazily compute Next detection/enrichment from `ctx.graph` and `files`, call the adapter analyzers, and return findings plus variant diagnostics through the same `analyze_repo` result shape.

Implementation should avoid making `@rai/adapter-next` a hard core dependency. CLI can depend on it in this workspace slice or use a dynamic import helper that returns `null` when the package is absent. If the goal is truly “when installed,” dynamic import is the better external-package model; tests can still run with workspace dependency present.

Backfill should reuse the same registry composition as `rai analyze`; otherwise snapshot history would omit adapter findings while normal analysis includes them.

### Risks

- Adapter diagnostics cannot flow today because core `Analyzer.analyze()` returns `Finding[]` only. Dropping diagnostics would fail Slice 6 intent.
- Dynamic import plus TypeScript NodeNext can cause build/test friction if `@rai/adapter-next` is not declared in CLI dependencies or optional peer/dependency metadata.
- Adapter wrappers need access to source files for `enrichNext()`. `AnalysisContext` has `graph` but not raw files, so wrappers likely need closure-captured `files` per run or pipeline context extension.
- `detectNext(rootDir)` needs a root directory, while core analysis uses relative source files. CLI composition must pass `dir` consistently into wrappers.
- There are no Next fixture files under `fixtures/` yet. Slice 6 needs at least one App Router fixture that produces `next/client-boundary-bloat` or `next/route-coupling` counts and diagnostics.
- Existing core lint forbids `app-router` / `pages-router` strings in `packages/core`; adding generic adapter contracts is okay, but examples/tests in core must not include forbidden Next strings.

### Ready for Proposal

Yes. Orchestrator should proceed to proposal/spec/design for a reviewable Slice 6 focused on: public core composition seam, diagnostic-aware analyzer normalization, CLI adapter loader, Next fixture coverage, and docs/spec status sync.
