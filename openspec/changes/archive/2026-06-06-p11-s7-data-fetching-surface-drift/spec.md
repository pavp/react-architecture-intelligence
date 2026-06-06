# Delta for React Pattern Analyzers

Capability: `react-pattern-analyzers` (extends `openspec/specs/react-pattern-analyzers/spec.md`).

## ADDED Requirements

### Requirement: Data-Fetching Surface Drift Detection

The React adapter MUST provide an adapter-owned analyzer for rule id `react/data-fetching-surface-drift`. The analyzer MUST consume observed `call` and `hook-call` facts and produce one file-scoped finding per qualifying file anchored on subject `react:data-fetching-surface:${file}`. A file MUST qualify only when it has at least one `call` fact whose callee is in the adapter-owned FETCH_CALLEES set (`fetch`, `window.fetch`, `globalThis.fetch`) AND at least one `hook-call` fact whose name is in the adapter-owned QUERY_HOOK_NAMES set (`useQuery`, `useLazyQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `useSWR`, `useInfiniteSWR`, `useSWRInfinite`, `useSWRMutation`, `useApolloQuery`, `useLazyApolloQuery`). The query-hook family discriminator MUST be the `hook-call` fact, NOT `call-binding`. Findings MUST be `type: "opportunity"` and emitted at most once per qualifying file.

#### Scenario: Co-present fetch and query-hook are reported

- GIVEN a file has a `call` fact with callee `fetch` AND a `hook-call` fact named `useQuery`
- WHEN React pattern analyzers run
- THEN exactly one `react/data-fetching-surface-drift` finding MUST be emitted for that file
- AND the finding MUST report observed call-name-surface divergence for the file.

#### Scenario: Destructured query hook with no call-binding is still detected

- GIVEN a file has a `call` fact with callee `fetch`
- AND the file has a `hook-call` fact named `useQuery` produced by `const { data } = useQuery(...)` with NO accompanying `call-binding` fact
- WHEN React pattern analyzers run
- THEN one `react/data-fetching-surface-drift` finding MUST be emitted for that file
- AND emission MUST be driven by the `hook-call` fact, not by any `call-binding` fact.

#### Scenario: window.fetch and globalThis.fetch qualify as fetch callees

- GIVEN a file has a `call` fact with callee `window.fetch` or `globalThis.fetch` AND a `hook-call` fact named `useMutation`
- WHEN React pattern analyzers run
- THEN one `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Fetch-only file stays silent

- GIVEN a file has one or more `call` facts with callee in FETCH_CALLEES
- AND the file has no `hook-call` fact whose name is in QUERY_HOOK_NAMES
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Query-hook-only file stays silent

- GIVEN a file has one or more `hook-call` facts whose name is in QUERY_HOOK_NAMES
- AND the file has no `call` fact with callee in FETCH_CALLEES
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Non-query hooks alongside fetch stay silent

- GIVEN a file has a `call` fact with callee `fetch`
- AND the file's only hook-call facts are `useState`, `useEffect`, or `useMemo` (none in QUERY_HOOK_NAMES)
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for that file.

#### Scenario: Cross-file co-presence stays silent

- GIVEN one file has a `call` fact with callee `fetch` and no qualifying hook-call
- AND a different file has a `hook-call` fact named `useQuery` and no qualifying fetch call
- WHEN React pattern analyzers run
- THEN no `react/data-fetching-surface-drift` finding MUST be emitted for either file (each file is evaluated independently).

### Requirement: Data-Fetching Surface Evidence and Claim Boundaries

Findings MUST be grounded only in observed current-source `call` and `hook-call` facts. Severity MUST always be `info`. Evidence and the `explain` hook MUST describe ONLY the observed call-name families (fetch callee names and query-hook names) that co-appear in the file. Finding text, the `explain` hook output, and the `explain` hook `limits[]` MUST NOT claim runtime fetch behavior, request waterfalls, performance impact, that the file uses two data-fetching libraries, import or library identity semantics, that the calls interact, co-execute, or conflict, a bug, error, defect, team intent, root cause, user impact, historical drift, or any required remediation or migration.

#### Scenario: Evidence references observed call names only

- GIVEN a `react/data-fetching-surface-drift` finding is emitted
- WHEN the evidence is inspected
- THEN it MUST identify the file and the observed fetch callee names and query-hook names that co-appeared
- AND it MUST NOT assert library identity, runtime behavior, or any required code change.

#### Scenario: Severity is always info

- GIVEN any qualifying file emits a `react/data-fetching-surface-drift` finding
- WHEN the finding is emitted
- THEN `severityRaw` MUST be `info` (single binary signal; no escalation).

#### Scenario: Explain output respects the forbidden-vocabulary boundary

- GIVEN a `react/data-fetching-surface-drift` finding is emitted and its `explain` hook is invoked
- WHEN the serialized explanation (summary, whyItMatters, inspectFirst, and `limits[]`) is inspected
- THEN it MUST NOT contain runtime-behavior, waterfall, performance, "two libraries", import/library-identity, conflict/interaction, bug/defect, intent, root-cause, user-impact, or migration/remediation language
- AND the `explain` hook MUST return null for any finding whose ruleId is not `react/data-fetching-surface-drift`.

### Requirement: Data-Fetching Surface Determinism and Scope Boundaries

The analyzer MUST be pure, synchronous, side-effect free, and deterministic over identical input: no filesystem, network, memory, config, clock, random, or LLM writes. Findings MUST use deterministic ordering, sorted and frozen evidence, deterministic severity, and stable SHA fingerprints — structural (sorted observed fetch-callee + query-hook names plus file identity, span-shift-resistant), nominal (file-only), and positional (file+span) — derived only from stable observed inputs. The analyzer MUST run inside `@rai/adapter-react`, load via the same `createReactCoreAnalyzers()` registry factory in `core-adapter.ts` as other React analyzers, require NO `@rai/core` changes, and add NO new MCP tool.

#### Scenario: Identical input produces stable output

- GIVEN identical source files, graph facts, and configuration are analyzed twice
- WHEN `react/data-fetching-surface-drift` runs
- THEN both runs MUST return equivalent findings with the same rule id, type, severity, fingerprints, metrics, and evidence values in deterministic order.

#### Scenario: Fingerprints exclude unstable inputs and resist span shifts

- GIVEN a finding is emitted and the source is edited so observed spans shift without changing the observed fetch-callee or query-hook names
- WHEN the structural fingerprint is recomputed
- THEN it MUST be unchanged
- AND no fingerprint MUST depend on wall-clock time, process ids, map insertion order, or LLM-generated text.

#### Scenario: Core stays framework-agnostic and wiring stays additive

- GIVEN `react/data-fetching-surface-drift` behavior is available through the React adapter
- WHEN `@rai/core` imports and finding contracts are inspected
- THEN `@rai/core` MUST NOT contain data-fetching rule logic, rule ids, FETCH_CALLEES/QUERY_HOOK_NAMES catalog names, or adapter imports
- AND the analyzer MUST be surfaced through existing CLI/MCP flows with NO new MCP tool.

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S4 MUST add only generic framework-neutral pattern facts and MUST NOT emit new React analyzer findings. P11-S5 MUST add only the context provider value-surface drift analyzer for same-file local context binding/provider value-surface divergence. P11-S6 MUST add only the `react/form-control-surface-drift` analyzer for same-file native form submit-surface divergence and same-element-type controlled/uncontrolled control-binding divergence. P11-S7 MUST add only the `react/data-fetching-surface-drift` analyzer for same-file co-presence of a raw-fetch `call` callee family and a query-hook `hook-call` name family. P11-S7 MUST NOT emit findings for runtime fetch behavior, waterfalls, performance, import/library identity, cross-file co-presence, `useEffect`-driven fetch patterns, axios-vs-fetch client detection, design-system usage, overlays, broad API convention families, or any claim outside observed same-file call-name-surface divergence. Those families MAY be specified and implemented by later approved changes that consume generic facts in adapter-owned analyzers.

(Previously: the slice scoping covered P11-S1 through P11-S6 only and deferred data-fetching, design-system usage, overlay, and broad API convention analyzers to later approved adapter-owned changes.)

#### Scenario: P11-S4 fact expansion emits no new analyzer findings

- GIVEN source code contains provider/context, forms, data-fetching, design-system usage, overlay, or broad API-convention syntax
- WHEN P11-S4 React pattern analyzers run
- THEN no new React pattern findings MUST be emitted for those families
- AND any findings that exist MUST come from already-approved analyzer rule ids.

#### Scenario: P11-S6 form slice excludes other deferred families

- GIVEN source code contains form syntax, data-fetching syntax, design-system usage, overlay syntax, or broad API-convention syntax
- WHEN P11-S6 React pattern analyzers run
- THEN `react/form-control-surface-drift` findings MUST be limited to observed same-file form submit-surface and same-element-type control-binding divergence
- AND P11-S6 MUST NOT emit new findings for data-fetching, design-system, overlay, broad API-convention, cross-file form composition, or library form-component claims.

#### Scenario: P11-S7 data-fetching slice excludes other deferred families

- GIVEN source code contains data-fetching syntax (raw fetch and query hooks), `useEffect`-driven fetch syntax, axios client calls, design-system usage, overlay syntax, or broad API-convention syntax
- WHEN P11-S7 React pattern analyzers run
- THEN `react/data-fetching-surface-drift` findings MUST be limited to observed same-file co-presence of a FETCH_CALLEES `call` and a QUERY_HOOK_NAMES `hook-call`
- AND P11-S7 MUST NOT emit new findings for `useEffect`-driven fetch patterns, axios-vs-fetch detection, cross-file co-presence, design-system, overlay, or broad API-convention claims.

#### Scenario: Future analyzers remain adapter-owned

- GIVEN P11-S4 adds generic fact kinds that future React analyzers can consume
- WHEN `@rai/core` and `@rai/adapter-react` boundaries are inspected
- THEN React interpretation MUST remain outside core
- AND future design-system, overlay, axios-client, or broad API-convention findings MUST require a later approved adapter-owned change.
