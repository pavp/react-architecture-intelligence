# Exploration: P11-S7 — react/data-fetching-surface-drift

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p11-s7-data-fetching-surface-drift/explore` (obs #632)

## Executive Summary

`react/data-fetching-surface-drift` is fully groundable from existing `call` + `hook-call` facts with
**zero `@rai/core` changes**. Recommend Option A (narrow): same-file co-presence of a raw-fetch call
family and a query-hook call family, reported as observed call-name-surface divergence. ~605-705
changed lines — single PR within the 800-line budget.

## Current State

adapter-react has five P11 analyzers, pure synchronous functions over
`AnalysisContext.graph.patternFacts`. P11-S6 (`react/form-control-surface-drift`, merged) is the
closest structural template: file-scoped, multi-family, `AdapterMetricEvidence`, `type: "opportunity"`.
P11-S5 (`react/context-provider-value-surface-drift`) is the only existing consumer of `call-binding`/
`call-argument`.

## Verified Fact Shapes (`packages/core/src/types.ts` 40-103)

```typescript
PatternCallFact         { kind: "call";         callee: string }
PatternCallBindingFact  { kind: "call-binding"; local: string; callee: string; declarationKind: "const"|"let"|"var" }
PatternCallArgumentFact { kind: "call-argument"; callee: string; argumentIndex: number; argument: string; argumentKind: "identifier"|"member"|"literal"|"call"|"unknown" }
PatternHookCallFact     { kind: "hook-call";    name: string }
```

## Verified Fact Production (`packages/core/src/parse/pass1.ts` 157-191, 320-323)

- `call-binding` fires only for VariableDeclaration with `id.type === "Identifier"` (NOT destructuring) and `init.type === "CallExpression"`.
- `call` fires for every CallExpression; callee = `expressionText(node.callee)`.
- `hook-call` fires only when `callee.type === "Identifier"` AND `/^use[A-Z0-9]/.test(name)`. Member-expression callees (`axios.get`) NEVER produce hook-call.
- `expressionText` member-callee: `axios.get(url)` → `"axios.get"`; `window.fetch(url)` → `"window.fetch"`; `globalThis.fetch(url)` → `"globalThis.fetch"`.

### Per-Expression Fact Production

| Source | call | call-binding | hook-call |
|---|---|---|---|
| `fetch(url)` bare | YES callee:"fetch" | NO | NO |
| `const p = fetch(url)` | YES | YES local:"p" | NO |
| `useQuery(opts)` bare | YES callee:"useQuery" | NO | YES name:"useQuery" |
| `const { data } = useQuery(opts)` | YES | NO (ObjectPattern) | YES |
| `const q = useQuery(opts)` | YES | YES local:"q" | YES |
| `useSWR(key, fn)` bare | YES | NO | YES name:"useSWR" |
| `axios.get(url)` bare | YES callee:"axios.get" | NO | NO (MemberExpression) |

### Key Discriminators

- **Fetch family**: `call` facts where callee ∈ {`fetch`, `window.fetch`, `globalThis.fetch`}.
- **Query-hook family**: `hook-call` facts where name ∈ QUERY_HOOK_NAMES (adapter-owned constant).
- **Primary fact for query hooks**: `hook-call` (fires for bare/destructured/assigned). `call-binding` is UNRELIABLE for hooks (most real usage is destructured → no call-binding).
- **Primary fact for fetch**: `call` with callee `fetch` (fires bare or assigned).

## Library-Name Boundary Ruling

**Observing call names (`fetch`, `useQuery`, `useSWR`) IS observed-syntax, NOT semantic overreach.**
Observing a hook-call named `"useQuery"` is identical in kind to observing a JSX element named `"form"`
— the token as written in source, nothing more. The analyzer reports that different call-name token
families co-appear in one file and flags name-surface divergence. It does NOT assert what those
functions do at runtime, which library they come from, whether they interact, or that the code is wrong.

**Forbidden in output**: "this file uses two data-fetching libraries" (import semantics), "fetch and
useQuery will conflict" (execution), "you should migrate" (remediation), "this creates a waterfall"
(perf). Enforced via the explain hook `limits[]` array.

## Recommended Scope — Option A (Narrow)

Emit `react/data-fetching-surface-drift` (one finding per qualifying file) WHEN a file has ≥1 `call`
fact with callee ∈ FETCH_CALLEES AND ≥1 `hook-call` fact with name ∈ QUERY_HOOK_NAMES.

- Subject: `react:data-fetching-surface:${file}` (file-level).
- Divergence token: `fetchVsQueryHookDrift:${file}`.
- Severity: always `info` (one binary signal per file; never escalates in single-signal mode).
- type: `opportunity`.

QUERY_HOOK_NAMES (adapter-owned): `useQuery, useLazyQuery, useSuspenseQuery, useInfiniteQuery,
useMutation, useSWR, useInfiniteSWR, useSWRInfinite, useSWRMutation, useApolloQuery, useLazyApolloQuery`.

FETCH_CALLEES (adapter-owned): `fetch, window.fetch, globalThis.fetch`.

Silence: fetch-only file; query-hook-only file; hook name not in set (useState/useEffect); each file
evaluated independently.

**Option B (rejected)**: + axios-vs-fetch + useEffect-driven-fetch. Rejected — `useEffect + fetch`
correlation requires inferring useEffect's purpose (timers/subscriptions/DOM also use it) → semantic
overreach + high FP; axios member-matching fragile; ~1100 lines exceeds budget.

## Reusable Patterns (P11-S6 / P11-S5)

Fingerprint triple, severity-by-count, `AdapterMetricEvidence` + `topology.exceeded: string[]`,
`compareFacts`, `sortedUnique`, `sha`, `compareFindings`, `runFacts()` test harness, `callFact`/
`hookCall` builders (adapt from context-provider test).

## Affected Areas

- `packages/adapter-react/src/data-fetching-surface-drift.ts` — new
- `packages/adapter-react/src/data-fetching-surface-drift.test.ts` — new
- `packages/adapter-react/src/core-adapter.ts` — +~3 lines
- `packages/adapter-react/src/index.ts` — +~2 lines
- `packages/core/**` — ZERO

## Core Changes Needed

**NO.** `call` (callee) + `hook-call` (name) facts already produced by pass1.ts. Purely adapter-owned.

## Estimated Lines

~250-300 impl + ~350-400 test + ~5 registry = **~605-705 total**. Single PR, budget risk Low.

## Open Questions for Proposal

1. QUERY_HOOK_NAMES fixed set (defer configurability)? → recommend fixed.
2. Include `window.fetch`/`globalThis.fetch`? → recommend yes (expressionText produces them).
3. Severity always `info` single-signal? → recommend yes.
4. Include `useMutation`? → recommend yes (network surface hook).
5. Structural FP includes sorted observed callee + hook names? → recommend yes.

## Risks

- QUERY_HOOK_NAMES staleness — new libs undetected until set updated (adapter-owned, changeable, no core change).
- `call-binding` is NOT the query-hook discriminator (destructured usage → none); MUST use `hook-call`. Verified.
- `hook-call` not produced for member callees (`axios.get`) — axios hook detection deferred.

## Status

Ready for proposal. Recommended scope: Option A. Zero core changes.
