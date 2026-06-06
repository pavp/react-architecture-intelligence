# Proposal: P11-S7 — react/data-fetching-surface-drift

Phase: propose · Persistence: hybrid
Engram topic: `sdd/p11-s7-data-fetching-surface-drift/proposal`

---

## Intent

React codebases that adopt a query-hook library (TanStack Query, SWR, Apollo) often leave legacy raw `fetch` calls in some files, producing a call-name-surface divergence that is invisible to standard lint rules. The analyzer `react/data-fetching-surface-drift` detects this by observing, within a single file, the co-presence of a `call` fact whose callee belongs to the raw-fetch family (`FETCH_CALLEES`) and a `hook-call` fact whose name belongs to the query-hook family (`QUERY_HOOK_NAMES`). When both token families appear in the same file, the analyzer emits one `opportunity`/`info` finding reporting the observed call-name-surface divergence. The signal is purely syntactic: the analyzer observes which token families co-appear in source text, makes no assertion about runtime behavior, library identity, or whether the co-presence is problematic.

---

## Scope — In

- **Single signal family**: same-file co-presence of `call` (callee ∈ FETCH_CALLEES) AND `hook-call` (name ∈ QUERY_HOOK_NAMES).
- **FETCH_CALLEES** (adapter-owned constant, no core changes): `"fetch"`, `"window.fetch"`, `"globalThis.fetch"`.
- **QUERY_HOOK_NAMES** (adapter-owned constant, no core changes): `useQuery`, `useLazyQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `useSWR`, `useInfiniteSWR`, `useSWRInfinite`, `useSWRMutation`, `useApolloQuery`, `useLazyApolloQuery`.
- **Emit condition**: ≥1 `call` fact with callee ∈ FETCH_CALLEES AND ≥1 `hook-call` fact with name ∈ QUERY_HOOK_NAMES, in the same file.
- **Subject**: file-level. `subjectId: "react:data-fetching-surface:${file}"`.
- **Severity**: always `"info"` (one binary signal per file; count never exceeds 1 in single-signal mode).
- **Finding type**: `"opportunity"`.
- **Divergence token**: `fetchVsQueryHookDrift:${file}`.
- **Primary discriminator for query hooks**: `hook-call` fact (NOT `call-binding` — destructured usage, the dominant pattern, produces no `call-binding`; this is a verified pass1.ts production rule).
- **Primary discriminator for fetch**: `call` fact (fires for both bare and assigned forms).
- **Silence conditions**: file with fetch calls but zero matching query-hook calls → silent; file with query-hook calls but zero fetch calls → silent; hook names in source that are not in QUERY_HOOK_NAMES (e.g. `useState`, `useEffect`) → do not contribute; each file evaluated independently.
- **Affected files**: `packages/adapter-react/src/data-fetching-surface-drift.ts` (new), `packages/adapter-react/src/data-fetching-surface-drift.test.ts` (new), `packages/adapter-react/src/core-adapter.ts` (+~3 lines), `packages/adapter-react/src/index.ts` (+~2 lines).

---

## Scope — Out

- Runtime fetch behavior, waterfall, performance, response or error handling semantics.
- Whether the fetch calls and hook calls in a file are related, interact, or co-execute.
- Import source of `fetch` (browser native vs polyfill) or of `useQuery` (TanStack vs Apollo) — import semantics are out.
- Cross-file or cross-module analysis.
- `useEffect`-driven fetch pattern detection (inferring `useEffect`'s purpose requires semantic analysis beyond observed-syntax).
- Axios-vs-fetch client inconsistency detection (deferred; `axios.get` produces `call` but not `hook-call`, and member-expression callee matching is fragile and semantically riskier).
- Any required remediation, suggested migration, or refactor guidance.
- TypeScript types, prop flow, runtime values.
- User-configurable hook/fetch name sets (fixed set first; configurability deferred to P12+).
- Any changes to `packages/core/**`.
- A new MCP tool.

---

## Library-Name Boundary

**Central risk and the ruling that makes this proposal safe**: observing a `hook-call` fact named `"useQuery"` is identical in kind to observing a JSX element named `"form"`. It is the literal token as written in source text. The analyzer observes that different call-name token families co-appear in the same file and reports name-surface divergence. It does NOT assert what those functions do at runtime, which library they originate from, whether they interact, or whether the co-presence constitutes a defect.

**Explicitly forbidden in emitted output** (enforced via `limits[]` in the explain hook):
- "this file uses two data-fetching libraries" — import semantics claim.
- "fetch and useQuery will conflict" — execution/runtime claim.
- "you should migrate to useQuery" — remediation claim.
- "this creates a request waterfall" — performance inference.
- Any statement asserting intent, correctness, or execution behavior from call-name surface alone.

The explain hook must constrain output to: "observed call-name families that co-appear in this file" and nothing beyond.

---

## Resolved Open Questions

**OQ1 — QUERY_HOOK_NAMES set scope**: **Fixed set only.** Ship a curated adapter-owned constant covering TanStack Query, SWR, and Apollo query/mutation hooks. User-configurability deferred to P12+. Rationale: fixed set is simpler, deterministic, and avoids config surface complexity before the pattern is validated.

**OQ2 — `window.fetch` / `globalThis.fetch` inclusion**: **Include both.** `expressionText` in pass1.ts (lines 320–323) produces `"window.fetch"` and `"globalThis.fetch"` for those call forms verbatim. They are observable callee strings identical in production to `"fetch"`. Excluding them would create a detection gap for fetch calls qualified with the global object.

**OQ3 — Severity gate**: **Severity stays `"info"` always.** The analyzer emits at most one finding per file (one binary signal). Count is always 1 in single-signal mode, so the `divergenceCount > 1 ? "warn" : "info"` pattern from P11-S6 never escalates here. If a second signal family is added in the future, severity escalation can be re-evaluated at that point.

**OQ4 — `useMutation` inclusion**: **Include `useMutation` in QUERY_HOOK_NAMES.** `useMutation` is a network-surface data-fetching hook (write/mutation via the same client). Its co-presence with raw `fetch` is a valid divergence signal on the call-name surface. Excluding it would create a gap where mutation-only query-hook files escape detection.

**OQ5 — Structural fingerprint content**: **Include sorted observed callee names and hook names in the structural fingerprint.** The structural fingerprint captures `[sorted divergence types, sorted signal names, file]`. This ensures fingerprint stability across span shifts (line number changes from unrelated edits) while still changing when the actual observed call names change. Consistent with the P11-S6 template.

---

## Approach and Rationale

The analyzer is a pure synchronous function over `AnalysisContext.graph.patternFacts`, matching the P11 pattern family exactly. It follows the P11-S6 (`react/form-control-surface-drift`) structural template:

1. Partition `patternFacts` by file.
2. For each file: collect `call` facts with callee ∈ FETCH_CALLEES; collect `hook-call` facts with name ∈ QUERY_HOOK_NAMES.
3. If both collections are non-empty: emit one finding with subject `"react:data-fetching-surface:${file}"`, type `"opportunity"`, severity `"info"`, `AdapterMetricEvidence` with `topology.exceeded` listing sorted observed callee and hook names.
4. Fingerprint triple: structural (sorted signal families + file), nominal (sha(file)), positional (sha([file, span.start, span.end])).
5. Explain hook produces repo-local divergence wording ("observed raw-fetch calls co-present with query-hook calls in the same file") and enforces `limits[]` to prevent semantic overreach.

**Why this approach**: zero core changes, reuses verified fact shapes, deterministic (set membership is O(n) per file, no ordering sensitivity), extensible (add names to constants), bounded explainability (limits[]).

---

## Guardrail Compliance

- **Adapter-owned**: lives entirely in `packages/adapter-react/`. No `packages/core/**` changes.
- **Pure/deterministic**: function over `patternFacts` with set-membership checks; same input → same output always.
- **Stable fingerprints**: structural FP includes sorted signal names, resistant to span shifts.
- **No new MCP tool**: uses existing analyzer registry pattern; no new tools.ts entry.
- **Registry-factory composition**: registered via `core-adapter.ts` array entry, same pattern as all P11 analyzers.
- **Drift terminology**: findings use repo-local divergence language ("call-name families co-present in same file"), not historical drift language.

---

## Acceptance Signals

Spec and design MUST preserve:

1. **Determinism**: given frozen `patternFacts`, analyzer output is byte-identical across invocations.
2. **Silence conditions are hard gates**: a file with only fetch calls (no matching hook-call) emits nothing; a file with only query-hook calls (no matching fetch call) emits nothing.
3. **Bounded explanation language**: the explain hook enforces `limits[]` — no output may assert runtime behavior, library identity, import semantics, remediation, or performance inference.
4. **hook-call is the query-hook discriminator, NOT call-binding**: spec must state this explicitly and tests must verify the destructured case (`const { data } = useQuery(...)`) is detected via `hook-call`.
5. **Single finding per file**: one `react/data-fetching-surface-drift` finding per qualifying file, never multiple findings for the same file.

---

## Risks

1. **QUERY_HOOK_NAMES staleness**: new query-hook libraries (e.g. a future Relay hook, Vue Query port) will go undetected until the constant is updated. Mitigated: the constant is adapter-owned and changeable without core changes; P12+ can add configurability.
2. **call-binding unreliable for hooks**: using `call-binding` as the query-hook discriminator would miss the dominant destructured usage pattern. Decision: use `hook-call` only. This must be carried through to spec and tests explicitly.
3. **Axios deferred**: `axios.get` and other HTTP client member-expression calls produce `call` facts but not `hook-call`. Axios-vs-hook detection is out of scope for this change. This is a known gap, not a regression.
4. **Explain limit enforcement**: if `limits[]` is not wired correctly in the explain hook, the analyzer could emit semantically overreaching output. Spec must require limit tests.
