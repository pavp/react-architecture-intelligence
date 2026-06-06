# Design: P11-S7 — react/data-fetching-surface-drift

Phase: design · Persistence: hybrid · Engram topic: `sdd/p11-s7-data-fetching-surface-drift/design`
Template mirrored: P11-S6 `packages/adapter-react/src/form-control-surface-drift.ts` (+ `.test.ts`).
Consumer reference: P11-S5 `context-provider-value-surface-drift.ts` (how `hook-call`/`call`/`call-argument` are read).
All structural claims below are verified against `packages/core/src/types.ts` and `packages/core/src/parse/pass1.ts` (read this session).

## Executive Summary

A new adapter-owned, pure synchronous analyzer that emits at most one `info`-severity `opportunity`
finding per file when the file co-presents a raw-fetch `call` family (callee ∈ FETCH_CALLEES) and a
query-hook `hook-call` family (name ∈ QUERY_HOOK_NAMES). Single binary signal → `divergenceCount`
always 1 → severity always `info`. Zero `@rai/core` changes; registry-factory composition only.

---

## ADR-1 — Architecture approach: file-scoped co-presence detector over existing facts

**Decision.** Implement as a pure synchronous `Analyzer` (`analyze(ctx): Finding[]`) that reads
`ctx.graph.patternFacts`, partitions into two fact families, buckets by file, and emits one finding
per file where both families are non-empty. Mirror P11-S6 module shape exactly.

**Rationale.** P11-S6 is the closest merged template (file-scoped, multi-family, `AdapterMetricEvidence`,
`type: "opportunity"`, fingerprint triple, severity-by-count, explain hook with `limits[]`). Reusing its
shape keeps the adapter internally consistent and minimizes review surface. The signal is strictly
binary per file, so this is structurally *simpler* than P11-S6 (one family pair, one token, fixed count=1).

**Rejected alternative.** Option B (axios-vs-fetch + useEffect-driven-fetch) — rejected in exploration:
`useEffect`-fetch correlation requires inferring effect purpose (semantic overreach, high FP); axios
member-matching is fragile; ~1100 lines exceeds budget. Out of scope, deferred to P12+.

**Guardrails honored.** `@rai/core` stays framework-agnostic; all React/library semantics (the callee
and hook name sets) live in the adapter; analyzer is pure and deterministic; uses existing diagnostic
isolation (no custom try/catch); no new MCP tool.

---

## ADR-2 — Module layout (mirror P11-S6 naming exactly)

**Files.**
- NEW `packages/adapter-react/src/data-fetching-surface-drift.ts` — analyzer + explain hook.
- NEW `packages/adapter-react/src/data-fetching-surface-drift.test.ts` — vitest suite.
- EDIT `packages/adapter-react/src/core-adapter.ts` — import + one registration line.
- EDIT `packages/adapter-react/src/index.ts` — two re-export lines (RULE_ID + factory).
- `packages/core/**` — ZERO changes (ADR-9).

**Exports / naming (mirrors `FORM_CONTROL_SURFACE_DRIFT_RULE_ID` / `createFormControlSurfaceDriftAnalyzer`).**
```ts
export const DATA_FETCHING_SURFACE_DRIFT_RULE_ID = "react/data-fetching-surface-drift";
export function createDataFetchingSurfaceDriftAnalyzer(): Analyzer { ... }
```

**`core-adapter.ts` registration** — add import alphabetically near the existing context/form imports and
append the factory to the returned array (append at end to keep the diff minimal and ordering stable for
any downstream snapshot — P11-S6 was appended last):
```ts
import { createDataFetchingSurfaceDriftAnalyzer } from "./data-fetching-surface-drift.js";
// ...
return [
  createCompoundComponentApiDriftAnalyzer(),
  createContainerPresenterRoleDriftAnalyzer(),
  createControlledUncontrolledPropSurfaceDriftAnalyzer(),
  createContextProviderValueSurfaceDriftAnalyzer(),
  createFormControlSurfaceDriftAnalyzer(),
  createDataFetchingSurfaceDriftAnalyzer(), // P11-S7
];
```

**`index.ts` re-export** (mirror the existing block):
```ts
export {
  DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
  createDataFetchingSurfaceDriftAnalyzer,
} from "./data-fetching-surface-drift.js";
```

**Imports needed from `@rai/core`** (subset of P11-S6, plus `PatternCallFact`/`PatternHookCallFact`):
`explainTerm`, `AdapterMetricEvidence`, `AnalysisContext`, `Analyzer`, `AnalyzerResult`,
`ExplanationEnvelope`, `Finding`, `PatternCallFact`, `PatternFact`, `PatternHookCallFact`,
`PresentedFinding`, `Severity`, `Span`. (No JSX fact types are needed.)

---

## ADR-3 — Constants (module-level frozen sets)

All React/library semantics stay in the adapter, declared once at module top.

```ts
const DIVERGENCE_TOKEN = "fetchVsQueryHookDrift"; // single divergence family

const FETCH_CALLEES: ReadonlySet<string> = new Set([
  "fetch",
  "window.fetch",
  "globalThis.fetch",
]);

const QUERY_HOOK_NAMES: ReadonlySet<string> = new Set([
  "useQuery",
  "useLazyQuery",
  "useSuspenseQuery",
  "useInfiniteQuery",
  "useMutation",
  "useSWR",
  "useInfiniteSWR",
  "useSWRInfinite",
  "useSWRMutation",
  "useApolloQuery",
  "useLazyApolloQuery",
]);
```

**Why these `FETCH_CALLEES` values.** `expressionText` (pass1.ts:316-327) renders member callees verbatim:
`window.fetch(...)` → `"window.fetch"`, `globalThis.fetch(...)` → `"globalThis.fetch"`, bare `fetch(...)`
→ `"fetch"`. These are the only three forms that resolve to the platform fetch surface from pure syntax.

**Why `hook-call.name` is the right key for the hook set.** pass1.ts:189-191 only emits `hook-call` when
the callee is an `Identifier` matching `/^use[A-Z0-9]/`, storing `name: node.callee.name`. Every entry in
`QUERY_HOOK_NAMES` satisfies that regex, so each is a possible `hook-call.name`.

`ReadonlySet` typing + module-scope const gives effective immutability without runtime `Object.freeze`
(P11-S6 uses plain `Set`; `ReadonlySet` is the stricter, equally-deterministic choice).

---

## ADR-4 — Fact reads, filters, and per-file bucketing

**Two families, read from `ctx.graph.patternFacts` (sorted once via `compareFacts` for determinism).**

- **Fetch family** = `call` facts where `FETCH_CALLEES.has(fact.callee)`.
  Guard: `isFetchCallFact(fact): fact is PatternCallFact => fact.kind === "call" && FETCH_CALLEES.has((fact as PatternCallFact).callee)`.
- **Query-hook family** = `hook-call` facts where `QUERY_HOOK_NAMES.has(fact.name)`.
  Guard: `isQueryHookFact(fact): fact is PatternHookCallFact => fact.kind === "hook-call" && QUERY_HOOK_NAMES.has((fact as PatternHookCallFact).name)`.

**Explicit non-reliance on `call-binding`.** Query hooks are detected ONLY via `hook-call`. The dominant
real-world form `const { data } = useQuery(...)` is an `ObjectPattern` destructure and produces NO
`call-binding` (pass1.ts:157-171 requires `declaration.id.type === "Identifier"`), but DOES produce a
`hook-call` (pass1.ts:189-191). Using `call-binding` would silently miss destructured usage — the most
common case. `hook-call` fires for bare, destructured, and assigned forms alike. This is the single most
important correctness ruling in the design and is asserted by a dedicated test (ADR-8, T2).

**Per-file bucketing data structure.**
```ts
interface FileBucket {
  file: string;
  fetchCalls: PatternCallFact[];      // sorted by compareFacts
  queryHooks: PatternHookCallFact[];  // sorted by compareFacts
}
```
Build by: derive `files = sortedUnique([...fetchCalls.map(f => f.file), ...queryHooks.map(f => f.file)])`,
then for each file filter both arrays by `f.file === file`. Iterating `files` (a sorted unique string
array) guarantees deterministic file order independent of input fact order.

---

## ADR-5 — Divergence computation (algorithm)

Per file: the divergence exists iff BOTH families are non-empty in that file. Single binary signal.

```
for file in sortedUnique(files):
  fetchCalls   = fetchFamily.filter(f => f.file === file)   // already compareFacts-sorted
  queryHooks   = queryFamily.filter(f => f.file === file)
  hasFetch     = fetchCalls.length > 0
  hasQueryHook = queryHooks.length > 0
  if not (hasFetch and hasQueryHook): continue              // HARD silence gate

  exceeded = [`${DIVERGENCE_TOKEN}:${file}`]                // exactly one token
  divergenceCount = exceeded.length                          // always 1
  severity = severityFor(divergenceCount)                    // 1 -> "info"

  observedFetchCallees = sortedUnique(fetchCalls.map(f => f.callee))   // e.g. ["fetch"]
  observedQueryHooks   = sortedUnique(queryHooks.map(f => f.name))     // e.g. ["useMutation","useQuery"]

  primarySpan = primarySpanFor(fetchCalls, queryHooks, file)  // ADR-6
  ...build evidence + finding...

return findings.sort(compareFindings)
```

`severityFor(n) = n > 1 ? "warn" : "info"` is copied verbatim from P11-S6 (convention parity / ADR-7 of
S6). Because `exceeded` always has exactly one element here, severity is always `"info"` — but keeping the
same helper preserves the family convention and leaves a forward-compatible escalation path if a future
second divergence family is added (deferred).

`observedFetchCallees` and `observedQueryHooks` are sorted-unique string arrays, used both in evidence
(human inspection) and in the structural fingerprint (ADR-6), making the fingerprint resistant to span
shifts and duplicate calls while still distinguishing different call-name surfaces.

---

## ADR-6 — Subject, finding shape, fingerprint triple, and span anchor

**Subject (file-level).** `id = react:data-fetching-surface:${file}`, `name = file`, `file`,
`span = primarySpan`, `fingerprint = structuralFp`. (Mirrors P11-S6's
`react:form-control-surface:${file}` and S5's `react:context-provider:...`.)

**Evidence — `AdapterMetricEvidence`.**
```ts
{
  kind: "adapter-metric",
  adapterId: "react",
  ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
  subject: { id, name: file, file, span: primarySpan, fingerprint: structuralFp },
  roles: uniqueRoles(roles).sort(compareRoles),   // see below
  metrics: {
    fetchCalls: fetchCalls.length,
    queryHookCalls: queryHooks.length,
    fetchCalleesObserved: observedFetchCallees.length,
    queryHooksObserved: observedQueryHooks.length,
    surfaceDivergences: divergenceCount,           // always 1
  },
  thresholds: {
    minFetchCallsForDrift: 1,
    minQueryHookCallsForDrift: 1,
  },
  topology: {
    directChildIds: sortedUnique(fetchCalls.map(f => f.id)),
    reachableNodeIds: sortedUnique(queryHooks.map(f => f.id)),
    exceeded: [...exceeded].sort(),                 // ["fetchVsQueryHookDrift:<file>"]
  },
}
```

**Roles (frozen/sorted, corroborative only — never gate emission).** One `fetch-call` role per observed
fetch callee, one `query-hook-call` role per observed hook name:
```ts
for (const callee of observedFetchCallees) roles.push({ role: "fetch-call",      variant: callee, file });
for (const name   of observedQueryHooks)   roles.push({ role: "query-hook-call", variant: name,   file });
```
Deduped via `uniqueRoles` and `.sort(compareRoles)` exactly as P11-S6.

**Evidence "observed names" array.** The sorted-unique `observedFetchCallees` and `observedQueryHooks`
also surface in the explain hook's `inspectFirst`. These arrays are frozen by construction (`sortedUnique`
returns a fresh sorted array; no caller mutates them) and identical given identical facts regardless of
input order.

**Fingerprint triple — EXACT inputs feeding each SHA.**

- **structural** (span/id-free; resists span shift + duplicate identical calls):
  ```ts
  structuralFp = sha(JSON.stringify({
    ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
    file,
    divergenceTypes: [DIVERGENCE_TOKEN],          // sorted, single element
    fetchCallees: observedFetchCallees,           // sortedUnique
    queryHooks: observedQueryHooks,               // sortedUnique
  }))
  ```
  Mirrors P11-S6's structural object (`{ ruleId, file, divergenceTypes, submitSurfaces, controlBindingLabels }`).
- **nominal**: `sha(file)` — identical convention to P11-S6 (file is the nominal identity of a file-level
  subject).
- **positional**: `sha([file, primarySpan.start, primarySpan.end].join("|"))` — identical convention to
  both P11-S6 and S5.

**Finding `id`** (mirrors P11-S6): `sha([ctx.runId, RULE_ID, file, structuralFp].join("|"))`. Run-scoped,
so excluded from cross-run determinism comparisons (test `normalize()` blanks `id`/`producingRunId`).

**Other finding fields** (verbatim P11-S6 conventions): `type: "opportunity"`,
`analysisVersion: ctx.analysisVersion`, `fpAlgoVersion: 1`, `producingRunId: ctx.runId`,
`commitSha: ctx.commitSha`, `severityRaw: severity`, `createdAt: 0`.

### Span anchor decision (the load-bearing call)

**Decision.** `primarySpan` = the span with the **lowest `span.start`** among ALL contributing facts
(`fetchCalls ∪ queryHooks`), tie-broken by `compareFacts`. Fallback to `{ file, start: 0, end: 0, kind:
"call", astPath: "" }` only in the structurally-impossible case where the contributing set is empty
(both families are guaranteed non-empty at emission, so the fallback is dead-but-safe defense).

```ts
function primarySpanFor(
  fetchCalls: readonly PatternCallFact[],
  queryHooks: readonly PatternHookCallFact[],
  file: string,
): Span {
  const candidates: PatternFact[] = [...fetchCalls, ...queryHooks];
  if (candidates.length === 0) return { file, start: 0, end: 0, kind: "call", astPath: "" };
  const byStart = [...candidates].sort(compareFacts).sort((a, b) => a.span.start - b.span.start);
  return byStart[0]!.span;
}
```

**Why "first contributing fact" rather than file-level 0/0.** Three reasons:
1. **Determinism.** Sorting by `compareFacts` first, then a stable sort by `span.start`, yields one
   deterministic winner regardless of input fact ordering (verified pattern: P11-S6 `primarySpanFor`
   does exactly this — sort by `compareFacts` then by `span.start`).
2. **Usefulness.** The positional fingerprint and the IDE jump target point at a real contributing
   token (the earliest fetch or query-hook call in the file), not an inert `0/0` that would collapse the
   positional fingerprint to `sha("<file>|0|0")` for every file and defeat positional drift tracking.
3. **Template parity.** P11-S6 anchors on a contributing element span (lowest `span.start`), never on a
   synthetic file span. We follow the same convention; the only difference is the candidate set is `call`
   + `hook-call` facts instead of `jsx` + `jsx-attribute` facts.

The `kind: "call"` on the (dead) fallback span is arbitrary-but-fixed; it never executes at emission time.

---

## ADR-7 — Explain hook + `limits[]` guardrail (the central boundary)

Adapter-owned `explain(finding): ExplanationEnvelope | null`. Returns `null` unless
`finding.ruleId === DATA_FETCHING_SURFACE_DRIFT_RULE_ID && finding.evidence.kind === "adapter-metric"`
(mirrors P11-S6 / S5 guard).

**`summary`** — names only, no semantics. Example shape:
```
`${file} co-presents a raw fetch call surface (${fetchList}) and a query-hook call surface (${hookList}) in the same file.`
```
where `fetchList`/`hookList` are `formatList(observedFetchCallees)` / `formatList(observedQueryHooks)`.

**`whyItMatters`** — bounded, review-framing only (no runtime/perf/conflict language):
```
"This is worth checking because two different data-fetching call-name surfaces appear in the same file, which can make the file's data-loading approach harder to review or keep consistent."
```

**`inspectFirst`** — derived from metrics/observed-name arrays:
```
[ `${file}`,
  `raw fetch call names observed: ${observedFetchCallees.join(", ")}`,
  `query-hook call names observed: ${observedQueryHooks.join(", ")}`,
  `fetch calls observed: ${metrics.fetchCalls}`,
  `query-hook calls observed: ${metrics.queryHookCalls}`,
  `surface divergence signals observed: ${metrics.surfaceDivergences}` ]
```

**`groundingFields`** = `Object.keys(evidence).sort()`; **`glossary`** = `groundingFields.map(explainTerm)`
(verbatim P11-S6).

**`limits[]` — the forbidden-overreach guardrail (exact lines).**
```ts
limits: [
  "This is a syntax-surface observation only; it observes call-name tokens as written and does not establish runtime behavior, framework warnings, defects, or any required code change.",
  "RAI only compares observed call and hook-call names in current source within a single file; no cross-file or import resolution is performed.",
  "RAI does not determine which library any observed name (fetch, useQuery, useSWR, etc.) comes from, nor that any two surfaces belong to different libraries.",
  "RAI makes no claim that the observed call surfaces interact, conflict, run in sequence, or create a request waterfall, and no performance claim is implied.",
  "RAI does not assert developer intent, the purpose of any call, or any remediation, migration, or refactor.",
]
```
Each line negates one forbidden category called out by the proposal's Library-Name Boundary:
import/library semantics, execution/interaction/conflict, waterfall/perf, intent, remediation/migration.
A test asserts the serialized envelope matches none of a forbidden-vocabulary regex (ADR-8, T-explain).

---

## ADR-8 — Edge cases, failure modes, and test plan

### Edge cases & failure modes (each maps to a test)

| # | Case | Expected | Mechanism |
|---|------|----------|-----------|
| E1 | `fetch(...)` + `useQuery(...)` same file | 1 finding, `info` | both families non-empty |
| E2 | `fetch(...)` + `const { data } = useQuery(...)` (destructured) | 1 finding | `hook-call` fires for ObjectPattern; `call-binding` does NOT — ADR-4 |
| E3 | `fetch(...)` only (no query hook) | silent `[]` | `hasQueryHook === false` |
| E4 | `useQuery(...)` only (no fetch) | silent `[]` | `hasFetch === false` |
| E5 | `fetch(...)` + `useEffect(...)`/`useState(...)` (non-query hooks) | silent `[]` | hook names not in QUERY_HOOK_NAMES |
| E6 | `axios.get(...)` + `useQuery(...)` | silent `[]` | `axios.get` is a `call` (callee `"axios.get"`) NOT in FETCH_CALLEES; never a `hook-call` (member callee) |
| E7 | duplicate identical `fetch(...)` calls + `useQuery` | 1 finding; `observedFetchCallees` deduped to `["fetch"]` | `sortedUnique` |
| E8 | multiple DISTINCT query hooks (`useQuery` + `useMutation`) + `fetch` | 1 finding, count=1, `observedQueryHooks=["useMutation","useQuery"]` | single token regardless of family size |
| E9 | `window.fetch` / `globalThis.fetch` + `useQuery` | 1 finding | member-callee forms in FETCH_CALLEES |
| E10 | cross-file: `fetch` in file A, `useQuery` in file B | silent `[]` for both | per-file bucketing; no cross-file correlation |
| E11 | forward vs reversed fact order | byte-identical findings (after `normalize`) | sort-everywhere determinism |
| E12 | pure span shift (same callees/hooks, different offsets) | structural FP stable, positional FP differs | structural FP excludes spans/ids |
| E13 | frozen input facts | no mutation; finding still emitted | analyzer never writes to facts |
| E14 | non-matching ruleId passed to `explain` | `null` | ruleId guard |
| E15 | explain envelope forbidden vocabulary | no match | `limits[]` + regex assertion |

### Test plan outline (vitest, mirror P11-S6 `runFacts()` harness)

Suite `describe("data fetching surface drift analyzer")`. Reuse the P11-S6 harness verbatim:
`runFacts(facts, runId?)`, `normalizeResult`, `adapterEvidence`, `normalize`, `freezeFacts`, `presented`,
`span(file, kind, start, end)`. **New builders required** (P11-S6 only has `jsx`/`jsxAttribute`; this
analyzer needs `call`/`hook-call` facts):
```ts
function callFact(id: string, callee: string, file: string, start: number, end: number): PatternFact {
  return { id, kind: "call", file, span: span(file, "call", start, end), callee };
}
function hookCall(id: string, name: string, file: string, start: number, end: number): PatternFact {
  return { id, kind: "hook-call", file, span: span(file, "hook-call", start, end), name };
}
```
(These match `PatternCallFact` / `PatternHookCallFact` exactly: `id, kind, file, span` + `callee`/`name`.)

Cases:
- **T1 positive** (E1): `callFact("c1","fetch",...)` + `hookCall("h1","useQuery",...)` → 1 finding,
  `severityRaw: "info"`, `type: "opportunity"`, `topology.exceeded` contains `fetchVsQueryHookDrift:<file>`.
- **T2 positive destructured** (E2): represent the AST reality — destructured `useQuery` produces a
  `hook-call` only (NO `call-binding`). Provide `callFact fetch` + `hookCall useQuery` and ASSERT a
  finding; add a comment that no `call-binding` is supplied on purpose (proves hook-call is the
  discriminator). This is the proposal's mandatory acceptance signal #4.
- **T3 negative fetch-only** (E3): `callFact fetch` only → `[]`.
- **T4 negative hook-only** (E4): `hookCall useQuery` only → `[]`.
- **T5 negative non-query hook + fetch** (E5): `callFact fetch` + `hookCall useEffect` (and `useState`) → `[]`.
- **T6 negative axios** (E6): `callFact("c","axios.get",...)` + `hookCall useQuery` → `[]`.
- **T7 dedupe** (E7): two identical-callee fetch facts + `useQuery` → 1 finding; assert
  `metrics.fetchCalleesObserved === 1`.
- **T8 multi-hook** (E8): `fetch` + `useQuery` + `useMutation` → 1 finding; assert
  `metrics.surfaceDivergences === 1` and `metrics.queryHooksObserved === 2`.
- **T9 window/globalThis fetch** (E9): `callFact("c","window.fetch",...)` + `useQuery` → 1 finding.
- **T10 cross-file** (E10): `fetch` in `a.tsx`, `useQuery` in `b.tsx` → `[]`.
- **T11 determinism** (E11): forward vs `[...facts].reverse()` with fixed runId → `normalize` equal,
  length 1.
- **T12 structural stability under span shift** (E12): baseline vs shifted offsets → structural FP equal,
  positional FP not equal.
- **T13 frozen facts** (E13): `freezeFacts([...])`; assert `JSON.stringify(facts)` unchanged + 1 finding.
- **T14 bounded explanation**: build analyzer, get a finding, call `analyzer.explain?.(presented(finding))`;
  assert non-null, `summary` non-empty, `groundingFields` sorted, `glossary.length === groundingFields.length`,
  and serialized envelope matches NONE of forbidden regex:
  `/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|waterfall|two (?:data-fetching )?libraries|runtime behavior|performance|you should/i`.
- **T15 null for non-matching ruleId** (E14): `presented({ ...finding, ruleId: "react/other" })` →
  `explain` returns `null`.

**Strict TDD.** `sdd-init` set `strict_tdd: true` (Vitest present). Tests are authored with/before the
implementation; the apply phase must write a failing test, then the minimum code to pass, per
`strict-tdd.md`. The design above gives the exact assertions so red→green is mechanical.

---

## ADR-9 — No-core-change & registry-composition confirmation

**No `@rai/core` change.** Both required fact kinds already exist and are already produced:
- `PatternCallFact { kind: "call"; callee }` — types.ts:40-43; produced for every `CallExpression`
  (pass1.ts:172-174), member callees rendered verbatim by `expressionText`.
- `PatternHookCallFact { kind: "hook-call"; name }` — types.ts:75-78; produced for `Identifier` callees
  matching `/^use[A-Z0-9]/` (pass1.ts:189-191).
No new fact kind, no new evidence kind (`adapter-metric` reused), no new MCP tool, no pipeline change.

**Registry composition.** The analyzer is wired solely through `createReactCoreAnalyzers` in
`core-adapter.ts` (one factory-call line) and re-exported from `index.ts`. The default analyzer order in
`packages/core/src/analyzers/registry.ts` is NOT touched — adapter analyzers compose via the adapter
factory list, consistent with the five existing P11 analyzers.

---

## Risks

1. **QUERY_HOOK_NAMES staleness** — new query libraries/hooks are undetected until the adapter-owned set
   is updated. Adapter-owned, no core change to extend. Accepted (proposal R1).
2. **`call-binding` mis-use would silently drop destructured hooks** — mitigated by ADR-4 ruling +
   dedicated test T2. This is the single highest-impact correctness risk; the design pins it down.
3. **Axios / member-callee hooks not detected** — `axios.get` and `client.useQuery()` (member callees)
   never produce a `hook-call` and `axios.*` is not in FETCH_CALLEES. Known, intentional gap; deferred
   to P12+ (proposal Scope-Out). Test E6 asserts the silence so it is documented, not accidental.
4. **`limits[]` must be wired and asserted** — covered by T14 forbidden-vocabulary regex; if a future
   edit weakens the summary/whyItMatters wording, the regex test guards the boundary.
5. **Span-anchor edge** — the dead `0/0` fallback never executes at emission (both families non-empty),
   but is kept defensively; if a refactor ever emits with an empty candidate set the positional FP would
   degrade. Low risk given the hard gate.
