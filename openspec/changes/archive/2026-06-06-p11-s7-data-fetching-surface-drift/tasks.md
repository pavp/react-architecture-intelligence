# Tasks: P11-S7 react/data-fetching-surface-drift

Persistence: hybrid · Strict TDD ACTIVE (pnpm test / vitest) · Engram topic `sdd/p11-s7-data-fetching-surface-drift/tasks`.
Template: P11-S6 `form-control-surface-drift.{ts,test.ts}`. Honor design ADR-1..ADR-9 and 16 spec scenarios.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~620-700 (test ~430-490, impl ~150-180, wiring ~14, docs ~12) |
| 400-line budget risk | High (vs 400 default) / Low (vs 800 project budget) |
| Chained PRs recommended | No |
| Suggested split | Single PR (one analyzer + tests + wiring + docs is one cohesive work unit) |
| Delivery strategy | auto-chain (forecast-driven) |
| Chain strategy | size-exception (single cohesive analyzer; fits 800 project budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Note: exceeds the 400 default budget but fits the 800 project budget. Test file dominates (RED-first). Splitting a single analyzer + its tests across PRs would break the work-unit rule (tests belong with the behavior). Keep as one PR.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Analyzer + full test suite + wiring + docs | PR 1 (base: main) | One deliverable; tests+docs included; rollback = revert the analyzer file + 3 wiring edits |

## Phase 1: RED — author failing test suite

- [x] 1.1 Create `packages/adapter-react/src/data-fetching-surface-drift.test.ts`. Import from `@rai/core`: `DEFAULT_CONFIG`, types `AdapterMetricEvidence`, `AnalyzerResult`, `Finding`, `PatternFact`, `PresentedFinding`, `Span`. Import `DATA_FETCHING_SURFACE_DRIFT_RULE_ID`, `createDataFetchingSurfaceDriftAnalyzer` from `./data-fetching-surface-drift.js`.
- [x] 1.2 Port the P11-S6 harness verbatim: `runFacts(facts, runId?)`, `normalizeResult`/`normalize` (blanks `id`/`producingRunId`), `adapterEvidence(finding)`, `freezeFacts`, `presented(finding)`, `span(file, kind, start, end)`.
- [x] 1.3 Add NEW builders (design ADR-8): `callFact(id, callee, file, start, end): PatternFact` → `{ id, kind:"call", file, span:span(file,"call",start,end), callee }`; `hookCall(id, name, file, start, end): PatternFact` → `{ id, kind:"hook-call", file, span:span(file,"hook-call",start,end), name }`.
- [x] 1.4 T1 positive (E1): `callFact fetch` + `hookCall useQuery` same file → 1 finding; `severityRaw:"info"`, `type:"opportunity"`; `topology.exceeded` contains `fetchVsQueryHookDrift:<file>`.
- [x] 1.5 T2 destructured (E2, mandatory signal #4): `callFact fetch` + `hookCall useQuery` ONLY (NO call-binding supplied; comment why) → asserts 1 finding — proves hook-call is the sole query discriminator (ADR-4).
- [x] 1.6 T3 (E3) fetch-only → `[]`. T4 (E4) `hookCall useQuery` only → `[]`.
- [x] 1.7 T5 (E5): `callFact fetch` + `hookCall useEffect` + `hookCall useState` → `[]` (non-query hooks).
- [x] 1.8 T6 (E6): `callFact("c","axios.get",...)` + `hookCall useQuery` → `[]` (axios.get not in FETCH_CALLEES, never hook-call).
- [x] 1.9 T7 dedupe (E7): two identical `fetch` callFacts + `useQuery` → 1 finding; `metrics.fetchCalleesObserved === 1`.
- [x] 1.10 T8 multi-hook (E8): `fetch` + `useQuery` + `useMutation` → 1 finding; `metrics.surfaceDivergences === 1`, `metrics.queryHooksObserved === 2`.
- [x] 1.11 T9 (E9): `callFact("c","window.fetch",...)` + `useQuery` → 1 finding (also assert `globalThis.fetch`).
- [x] 1.12 T10 cross-file (E10): `fetch` in `a.tsx`, `useQuery` in `b.tsx` → `[]` (per-file isolation).
- [x] 1.13 T11 determinism (E11): forward vs `[...facts].reverse()`, fixed runId → `normalize` equal, length 1.
- [x] 1.14 T12 structural stability (E12): baseline vs span-shifted offsets → structural FP equal, positional FP differs.
- [x] 1.15 T13 frozen facts (E13): `freezeFacts([...])`; `JSON.stringify(facts)` unchanged after analyze + 1 finding emitted.
- [x] 1.16 T14 bounded explain (E15): get finding, `analyzer.explain?.(presented(finding))` → non-null; `summary` non-empty; `groundingFields` sorted; `glossary.length === groundingFields.length`; serialized envelope matches NONE of `/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|waterfall|two (?:data-fetching )?libraries|runtime behavior|performance|you should/i`.
- [x] 1.17 T15 null ruleId (E14): `presented({...finding, ruleId:"react/other"})` → `explain` returns `null`.
- [x] 1.18 Run `pnpm test packages/adapter-react/src/data-fetching-surface-drift.test.ts` → CONFIRM RED (module not found / failing asserts).

## Phase 2: GREEN — implement analyzer

- [x] 2.1 Create `packages/adapter-react/src/data-fetching-surface-drift.ts`. Imports from `@rai/core` per ADR-2 (incl. `PatternCallFact`, `PatternHookCallFact`, `explainTerm`). Export `const DATA_FETCHING_SURFACE_DRIFT_RULE_ID = "react/data-fetching-surface-drift"`.
- [x] 2.2 Module-level frozen sets (ADR-3): `DIVERGENCE_TOKEN="fetchVsQueryHookDrift"`; `FETCH_CALLEES: ReadonlySet<string>` = {fetch, window.fetch, globalThis.fetch}; `QUERY_HOOK_NAMES: ReadonlySet<string>` = the 11 names. Guards `isFetchCallFact`, `isQueryHookFact`.
- [x] 2.3 `createDataFetchingSurfaceDriftAnalyzer(): Analyzer` (framework `"react"`, ruleId const). Read `ctx.graph.patternFacts`, sort once via `compareFacts`; bucket per-file (ADR-4): `files = sortedUnique([...fetch.file, ...query.file])`; filter both families by file.
- [x] 2.4 Per-file emit (ADR-5): gate `hasFetch && hasQueryHook`; `exceeded=[`${DIVERGENCE_TOKEN}:${file}`]`; `divergenceCount=1`; `severityFor(n)=n>1?"warn":"info"` (→ always info); `observedFetchCallees`/`observedQueryHooks` = sortedUnique.
- [x] 2.5 `primarySpanFor(fetchCalls, queryHooks, file)` (ADR-6 span_anchor_decision): candidates = fetch∪query; sort `compareFacts` then by `span.start`; return `[0].span`; dead fallback `{file,start:0,end:0,kind:"call",astPath:""}`.
- [x] 2.6 Build `AdapterMetricEvidence` (ADR-6): subject `react:data-fetching-surface:${file}`; roles `fetch-call`/`query-hook-call` per observed name, `uniqueRoles().sort(compareRoles)`; metrics `{fetchCalls, queryHookCalls, fetchCalleesObserved, queryHooksObserved, surfaceDivergences}`; thresholds `{minFetchCallsForDrift:1, minQueryHookCallsForDrift:1}`; topology `{directChildIds, reachableNodeIds, exceeded}` (sorted/frozen).
- [x] 2.7 Fingerprint triple (ADR-6): structural `sha(JSON{ruleId,file,divergenceTypes:[token],fetchCallees:observed,queryHooks:observed})`; nominal `sha(file)`; positional `sha([file,primarySpan.start,primarySpan.end].join("|"))`. Finding `id=sha([ctx.runId,RULE_ID,file,structuralFp].join("|"))`; fields `type:"opportunity"`, `analysisVersion`, `fpAlgoVersion:1`, `producingRunId`, `commitSha`, `severityRaw`, `createdAt:0`. Return `findings.sort(compareFindings)`.
- [x] 2.8 `explain(finding): ExplanationEnvelope | null` (ADR-7): guard ruleId + `adapter-metric` else null; `summary`/`whyItMatters`/`inspectFirst` names-only; `groundingFields=Object.keys(evidence).sort()`; `glossary=groundingFields.map(explainTerm)`; `limits[]` = the 5 exact forbidden-category lines from ADR-7.
- [x] 2.9 Run `pnpm test packages/adapter-react/src/data-fetching-surface-drift.test.ts` → CONFIRM GREEN (T1-T15 pass).

## Phase 3: Wiring (registration)

- [x] 3.1 `index.ts`: add re-export block `export { DATA_FETCHING_SURFACE_DRIFT_RULE_ID, createDataFetchingSurfaceDriftAnalyzer } from "./data-fetching-surface-drift.js";` (mirror existing blocks).
- [x] 3.2 `core-adapter.ts`: add import; append `createDataFetchingSurfaceDriftAnalyzer(), // P11-S7` LAST in the `createReactCoreAnalyzers` return array (ADR-2 — keep ordering stable).
- [x] 3.3 `core-adapter.test.ts`: import `DATA_FETCHING_SURFACE_DRIFT_RULE_ID`; append `{ ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID, framework: "react" }` LAST in the ordered `toEqual([...])` list (lines 21-41). Run `pnpm test packages/adapter-react/src/core-adapter.test.ts` → GREEN.

## Phase 4: Verify gate (record exact counts)

- [x] 4.1 `pnpm test` → record new total counts (files + tests).
- [x] 4.2 `pnpm test:launcher`.
- [x] 4.3 `pnpm typecheck`.
- [x] 4.4 `pnpm build`.
- [x] 4.5 `node scripts/check-core-framework-free.mjs` (or `pnpm lint`) — core stays framework-free.
- [x] 4.6 `git diff --check` (whitespace) AND `git diff --stat packages/core` → MUST be empty (zero core changes, ADR-9).

## Phase 5: Docs

- [x] 5.1 `docs/STATUS.md`: add P11-S7 row to capability table; update Product state + Next phase lines; add a "P11-S7 Data-Fetching Surface Drift" section + verification command, mirroring the existing P11-S6 section. Set Next phase to P11-S8 (next deferred family: overlays / design-system / API conventions).
- [x] 5.2 `docs/ROADMAP.md`: add a P11-S7 bullet mirroring the P11-S6 bullet; update the closing "later slices follow the same adapter-owned pattern" line to reference P11-S7.

## ARCHIVE SPEC-SYNC NOTE (read at sdd-archive, do NOT do now)

The spec is a DELTA (3 ADDED requirements + 1 MODIFIED). The MODIFIED requirement "Deferred React Pattern Families Stay Scoped by Slice" copies prior P11-S4/S6 scenarios verbatim and adds the P11-S7 scenario.

At ARCHIVE, merge this delta into the EXISTING canonical capability spec at `openspec/specs/react-pattern-analyzers/spec.md` (directory/canonical form) — NOT a new flat file, NOT a sibling spec file. The MODIFIED block REPLACES the existing scoping requirement in place; the 3 ADDED requirements append. This explicitly prevents repeating the P11-S6 archive mis-merge.
