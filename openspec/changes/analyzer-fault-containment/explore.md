## Exploration: analyzer-fault-containment

### Current State
`docs/gaps.md` §3.3 and `docs/superpowers/STATUS.md` both state analyzer fault containment is missing: one analyzer panic/timeout must not fail the whole run. The design spec P4 exit criteria require "one analyzer panic/timeout → remaining analyzers still complete" and "deterministic partial-failure reporting".

Today analyzers are pure, synchronous functions: `Analyzer.analyze(ctx): Finding[]` in `packages/core/src/analyzers/analyzer.ts`. `AnalyzerRegistry` only registers unique `ruleId`s and returns analyzers in insertion order. `analyzeRepo` builds/freeze the graph, creates `AnalysisContext`, then runs every analyzer via `input.registry.list().flatMap((a) => a.analyze(ctx))`. There is no `try/catch`, no timeout budget, no diagnostics field, and no logger seam. A thrown analyzer aborts `analyzeRepo` before any findings are persisted. A synchronous infinite loop also blocks the event loop, so Promise-based timeout alone cannot interrupt it.

Findings are currently limited to `FindingType = "opportunity" | "architectural-conflict"` and `Evidence = SharedExtractionEvidence`. That is correct for integrity: analyzer failures are runtime diagnostics, not architectural findings. They must not invent fingerprints, write T3 findings, or pass through memory/config overlay as if they came from CODE.

Tests cover registry duplicate protection, shared-extraction behavior/purity, pipeline append-only persistence, golden determinism, MCP counts/handles, and close-session feedback. There are no tests for analyzer failure, analyzer timeout, or diagnostics. Callers are `Session.analyzeRepo`, MCP `analyze_repo`, and CLI `rai analyze`; all currently assume only `presented`, `runId`, and `analysisVersion` from pipeline.

### Affected Areas
- `packages/core/src/analyzers/analyzer.ts` — analyzer contract is sync-only; C3 must decide whether to preserve sync analyzers and add async orchestration around them or widen the contract.
- `packages/core/src/analyzers/registry.ts` — registry stores order and uniqueness; containment should not live here because registry is catalog/registration, not execution.
- `packages/core/src/engine/pipeline.ts` — current execution seam (`flatMap(a.analyze(ctx))`) is the smallest correct place for crash isolation, result aggregation, diagnostics, and future timeout orchestration.
- `packages/core/src/config/schema.ts` — no analyzer timeout budget exists. Add config only if timeout becomes part of C3; default should preserve current behavior unless configured.
- `packages/core/src/types.ts` — findings/evidence should remain unchanged; add a separate diagnostic/result type if exposed from pipeline/MCP.
- `packages/core/src/mcp/tools.ts` and `packages/core/src/mcp/server.ts` — analyze output can surface diagnostics/counts without dumping findings; avoid making diagnostics a feedback target.
- `packages/core/src/engine/pipeline.test.ts` — best home for Strict TDD crash-containment tests and diagnostic result assertions.
- `packages/core/src/engine/golden.test.ts` — determinism replay should include diagnostics when partial failure is deterministic.

### Approaches
1. **Try/catch only in pipeline** — replace `flatMap` with ordered loop and catch each analyzer error, append diagnostic metadata, continue with remaining analyzers.
   - Pros: smallest safe change, protects against thrown errors, preserves sync analyzer contract, no worker/thread complexity, easy Strict TDD.
   - Cons: does not handle hangs/timeouts, only partially satisfies roadmap §3.3/P4 wording.
   - Effort: Low

2. **Promise timeout wrapper in pipeline** — make pipeline async and wrap `analyzer.analyze(ctx)` in `Promise.race` with timeout.
   - Pros: covers async analyzers if contract is widened, simple timeout API shape.
   - Cons: current analyzers are sync; sync infinite loop blocks event loop so timeout cannot fire. Would force async API through Session/MCP/CLI/tests and create broad churn for weak containment.
   - Effort: Medium

3. **Worker-thread analyzer isolation** — execute each analyzer in an interruptible worker with per-analyzer timeout and structured failure/timeout diagnostics.
   - Pros: real crash/hang isolation, timeout can terminate runaway CPU loops, matches "panic/timeout" intent strongest.
   - Cons: high complexity for P4 core, analyzers close over functions and `MemoryReader` so serialization/seams need redesign; risky before multiple analyzers/adapters exist.
   - Effort: High

4. **Registry-level guarded analyzers** — wrap analyzers during `register()` so `list()` returns safe wrappers.
   - Pros: centralizes containment before pipeline sees analyzers.
   - Cons: mixes catalog with execution policy, hides diagnostics from run context (`runId`, config, timeout budget), harder to test result aggregation and ordered partial failure.
   - Effort: Medium

5. **Diagnostic metadata, not dropped/warning findings** — return `diagnostics` alongside `presented` and optionally expose diagnostic counts in `analyze_repo`.
   - Pros: preserves CODE -> FINDINGS -> CONFIG/MEMORY overlay -> LLM, avoids phantom findings, keeps append-only finding table clean, gives users/debuggers visibility.
   - Cons: consumers need to learn a new non-finding channel.
   - Effort: Low

### Recommendation
Use pipeline-level containment with a small `runAnalyzerSafely` helper and a separate `AnalysisDiagnostic` result channel. C3 should implement crash isolation first: ordered loop, `try/catch` per analyzer, failed analyzer contributes zero findings plus one deterministic diagnostic `{ ruleId, kind: "analyzer-error", message }`, remaining analyzers still run, and only successful findings persist. Surface diagnostics through `AnalyzeRepoResult` and MCP `analyze_repo` as counts/details, not as findings.

For timeout, recommend C3 specify config/API shape but avoid pretending Promise timeout can stop sync CPU hangs. Add `config.analysis.analyzerTimeoutMs` only if proposal accepts an async/worker follow-up. Smallest correct C3 scope: crash containment now, explicit non-goal for true hard timeout until worker execution is designed. If roadmap requires timeout in same change, do worker-level design in C3 rather than Promise-race half-measure.

Strict TDD path:
1. Add failing `pipeline.test.ts` case with two fake analyzers: first throws, second returns a valid finding; assert run does not throw, returned finding persists/presents, diagnostic includes failed `ruleId`, and append-only table has only successful finding.
2. Add failing test for ordering/determinism: repeated run with same throwing analyzer yields same diagnostics after stripping volatile stack details; do not include stack traces in stable result.
3. Implement pipeline loop and `AnalysisDiagnostic` type; keep `Analyzer` sync.
4. Update MCP/session tests to assert `analyze_repo` includes diagnostics/counts but not finding bodies.
5. Run `pnpm --filter @rai/core test src/engine/pipeline.test.ts`, then full `pnpm test` and `pnpm typecheck` in later apply/verify phases.

### Risks
- Calling this complete timeout containment would be dishonest unless analyzers run in an interruptible boundary; Promise timeout cannot preempt sync analyzer loops.
- Diagnostic text can break determinism if it includes stacks, file paths, or runtime-specific error formatting. Keep stable fields minimal: ruleId, kind, message string, maybe `errorName`.
- If diagnostics are modeled as findings, memory/feedback semantics get polluted by non-CODE runtime failures. Keep channel separate.
- Async pipeline conversion would ripple into Session, MCP, CLI, and many tests; avoid unless worker/timeout scope demands it.
- A throwing analyzer before C3 currently prevents all persistence; tests must prove successful analyzers still persist after failure.

### Ready for Proposal
Yes — propose crash isolation as the C3 deliverable, with diagnostic reporting and explicit timeout design decision. If stakeholders insist on per-analyzer timeout in C3, proposal should choose worker-thread isolation rather than Promise-based timeout, because technical truth matters here.
