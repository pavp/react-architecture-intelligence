# Design: P11-S2 React Container/Presenter Role Divergence

P11-S2 adds one React adapter analyzer: `react/container-presenter-role-drift`. The analyzer stays in `@rai/adapter-react`, consumes existing `RepoGraph` components, render edges, hook calls, spans, and pattern hook-call facts, and emits only grounded current-source role-name/syntax divergence findings. No `@rai/core` fact or evidence expansion is planned.

## Decision summary

| Area | Decision |
|---|---|
| Rule id | `react/container-presenter-role-drift` |
| Package boundary | Implement in `packages/adapter-react`; do not modify `packages/core/**` unless a later design approves generic facts. |
| Analyzer shape | Add `createContainerPresenterRoleDriftAnalyzer(): Analyzer`; register it after `createCompoundComponentApiDriftAnalyzer()` in `createReactCoreAnalyzers()`. |
| Evidence model | Reuse existing `AdapterMetricEvidence`; do not add a new core evidence union variant. |
| Finding unit | Emit at most one finding per direct `container -> presenter` render pair that crosses all thresholds. |
| Noise control | Require paired role-name/path evidence, a direct render edge, and at least one conservative high-signal hook on the presenter-like component. |
| Drift language | Treat output as current-source repo-local divergence, not historical drift. |
| Verification | Strict TDD first, then `pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `git diff --check`. |

## Quick path for apply

1. Add failing adapter-react unit tests for healthy, divergent, unpaired, deterministic, and frozen-input cases.
2. Implement `container-presenter-role-drift.ts` using existing graph facts only.
3. Wire the analyzer through `core-adapter.ts` and `index.ts`; update adapter integration tests.
4. Add minimal container/presenter fixtures if integration tests need source-level coverage.
5. Run the full verification command set and update status/roadmap only after implementation passes.

## Architecture and data flow

```text
SourceFile[]
  -> @rai/core pass1/buildGraph/freezeGraph
     - ComponentNode.name/file/span/hookCalls/childComponents
     - GraphEdge(kind="renders") between syntactically matched components
     - PatternHookCallFact spans for hook calls
  -> @rai/adapter-react createReactCoreAnalyzers()
     - react/compound-component-api-drift
     - react/container-presenter-role-drift
  -> container/presenter analyzer
     - find container-like component role seeds
     - find presenter-like component role seeds
     - join only direct renders edges from container to presenter
     - classify presenter hook calls with conservative high-signal policy
     - return deterministic AdapterMetricEvidence findings
  -> @rai/core pipeline
     - diagnostic isolation, persistence, snapshot population, memory overlay, CLI/MCP output
```

`packages/cli` already loads `@rai/adapter-react` through the installed adapter seam. No CLI production code is required for P11-S2 unless tests reveal that returned React analyzers are not composed into CLI/MCP sessions.

## Analyzer module shape and integration

### New module

Create `packages/adapter-react/src/container-presenter-role-drift.ts`:

```ts
export const CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID = "react/container-presenter-role-drift";

export function createContainerPresenterRoleDriftAnalyzer(): Analyzer {
  return {
    ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
    framework: "react",
    analyze: (ctx: AnalysisContext): AnalyzerResult => analyzeContainerPresenterRoleDrift(ctx),
  };
}
```

Implementation rules:

- Pure synchronous function over `AnalysisContext`.
- Read only `ctx.graph.components`, `ctx.graph.edges`, and optionally `ctx.graph.patternFacts` for hook-call spans.
- Do not read filesystem, network, clock, randomness, memory, feedback, config files, snapshots, or source files.
- Do not locally catch analyzer failures except for narrow normalization; existing core diagnostic isolation should convert thrown errors into `analyzer-error` diagnostics.

### React adapter wiring

Modify `packages/adapter-react/src/core-adapter.ts`:

```ts
export function createReactCoreAnalyzers(_input: ReactCoreAnalyzerInput): Analyzer[] {
  return [
    createCompoundComponentApiDriftAnalyzer(),
    createContainerPresenterRoleDriftAnalyzer(),
  ];
}
```

Keep compound first so P11-S1 ordering remains stable. Add exports in `packages/adapter-react/src/index.ts` for the new rule id and factory. No catalog change is required; analyzer-local role constants are enough for S2.

## Role-name evidence detection boundaries

Roles are observed string/path evidence, not truth. The analyzer MUST use only current graph values and deterministic string checks.

### Container-like role seeds

A component is container-like when at least one seed exists:

| Seed source | Match rule | Examples that match | Examples that do not match |
|---|---|---|---|
| Component name suffix | Case-sensitive suffix `Container` with a non-empty prefix. | `UserContainer`, `CheckoutContainer` | `Container`, `ContainerizedPanel`, `Usercontainer` |
| File basename suffix | Basename without extension ends with `Container` with a non-empty prefix. | `UserContainer.tsx` | `Container.tsx`, `containerized.tsx` |
| Path segment | Normalized file path split on `/`, `\\`, `.`, `_`, and `-`; lowercased segment equals `container` or `containers`. | `src/containers/User.tsx`, `src/user-container/View.tsx` | `src/containerized/User.tsx` |

### Presenter-like role seeds

A component is presenter-like when at least one seed exists:

| Seed source | Match rule | Examples that match | Examples that do not match |
|---|---|---|---|
| Component name suffix | Case-sensitive suffix `Presenter` or `View` with a non-empty prefix. | `UserPresenter`, `ProfileView` | `Presenter`, `View`, `Overview` |
| File basename suffix | Basename without extension ends with `Presenter` or `View` with a non-empty prefix. | `ProfileView.tsx`, `UserPresenter.tsx` | `View.tsx`, `Overview.tsx` |
| Path segment | Normalized file path split on `/`, `\\`, `.`, `_`, and `-`; lowercased segment equals `presenter`, `presenters`, `view`, or `views`. | `src/presenters/User.tsx`, `src/views/Profile.tsx` | `src/overview/Profile.tsx` |

### Explicit non-goals

Do not infer roles from:

- hook names alone;
- props such as `children`, `data`, `items`, or `onChange`;
- import sources, package names, or exports;
- React Native `View` imports or a component named exactly `View`;
- names such as `Screen`, `Page`, `Layout`, `Controller`, `Provider`, `Form`, `Query`, or design-system component names;
- transitive render paths such as `Container -> Wrapper -> View`;
- semantic symbol resolution, type information, aliases, or LLM inference.

## Paired evidence and thresholds

A finding requires all thresholds below. Single evidence categories are never enough.

| Gate | Required evidence | Threshold field |
|---|---|---|
| Container role evidence | Container component has at least one container role seed. | `minContainerRoleSeeds: 1` |
| Presenter role evidence | Presenter component has at least one presenter role seed. | `minPresenterRoleSeeds: 1` |
| Direct pair evidence | Existing graph has a direct `renders` edge from the container component id to the presenter component id. | `minRenderPairs: 1` |
| Divergence evidence | Presenter component has at least one high-signal hook call after filtering. | `maxPresenterHighSignalHookCalls: 0` |

Finding unit: one finding per deterministic direct render pair. Multiple high-signal hooks on the same pair are grouped into one finding. Duplicate graph edges are deduped by stable edge id before analysis.

Silent cases:

- presenter-like component with hooks but no container-like renderer;
- container-like component that renders no presenter-like component;
- container-like and presenter-like names in the same repo without a direct render edge;
- presenter-like component with only low-signal hooks;
- imported presenter JSX with no local `ComponentNode`/`renders` edge;
- deferred P11 families: provider/context, controlled/uncontrolled, forms, broad data-fetching conventions, design-system usage, overlay behavior beyond compound primitive evidence, and broad API conventions.

## High-signal hook policy

The first slice uses a conservative allowlist. Unknown custom hooks are not high-signal in S2.

| Class | High-signal hooks |
|---|---|
| State/store | `useState`, `useReducer`, `useActionState`, `useOptimistic`, `useSyncExternalStore` |
| Effects | `useEffect`, `useLayoutEffect`, `useInsertionEffect` |
| Recognized data hooks | `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `useSWR`, `useLoaderData`, `useRouteLoaderData`, `useActionData`, `useFetcher`, `useFetchers` |

Explicitly low-signal for S2: `useMemo`, `useCallback`, `useRef`, `useId`, `useContext`, `useTheme`, `useMediaQuery`, `useTransition`, `useDeferredValue`, `useImperativeHandle`, `useDebugValue`, and any unknown `use*` custom hook.

Rationale: exact built-in state/effect hooks and exact known data hooks are reproducible from existing `hookCalls`. The analyzer avoids broad suffix patterns such as `*Query` because names like `useMediaQuery` would be noisy.

## Finding and evidence contract

Use existing `AdapterMetricEvidence`. Do not add a custom prose `message`, `description`, or `recommendation` field to evidence in S2; bounded wording comes from stable role, metric, threshold, and topology tokens.

### Subject

Use the render pair as the subject:

- `subject.id`: stable pair id, e.g. `react:container-presenter:<container.id>-><presenter.id>`.
- `subject.name`: `<ContainerName> -> <PresenterName>`.
- `subject.file`: presenter file, because the hook evidence is on the presenter-like component.
- `subject.span`: first deterministic high-signal `PatternHookCallFact` span inside the presenter component when available; otherwise the presenter component span.
- `subject.fingerprint`: stable hash of ordered container/presenter fingerprints, role seeds, render edge id, and high-signal hook names.

Hook span lookup is best-effort and core-free:

1. collect `PatternHookCallFact` values where `file === presenter.file`;
2. require `fact.name` to be a high-signal hook on the presenter component;
3. require `fact.span` to sit inside `presenter.span`;
4. sort by fact id/file/span/name;
5. use the first fact as the primary span and include matching fact ids in topology.

If no matching hook fact is available, the component-level `hookCalls` evidence is still enough and the subject uses `presenter.span`.

### Roles

Recommended role entries, sorted and deduped by `role`, `variant`, and `file`:

| Role | Variant |
|---|---|
| `container-component` | container component name |
| `presenter-component` | presenter component name |
| `container-role-seed` | seed token such as `name-suffix:Container` or `path-segment:containers` |
| `presenter-role-seed` | seed token such as `name-suffix:View` or `path-segment:views` |
| `render-pair` | `<container.name>-><presenter.name>` |
| `presenter-high-signal-hook` | hook name such as `useState` |

These role names intentionally say what was observed. They do not say `wrong`, `bad`, `intended`, `pure`, or `must-refactor`.

### Metrics, thresholds, and topology

Recommended evidence fields:

```ts
metrics: {
  containerRoleSeeds: number,
  presenterRoleSeeds: number,
  renderPairs: 1,
  presenterHighSignalHookCalls: number,
},
thresholds: {
  minContainerRoleSeeds: 1,
  minPresenterRoleSeeds: 1,
  minRenderPairs: 1,
  maxPresenterHighSignalHookCalls: 0,
},
topology: {
  directChildIds: [presenter.id],
  reachableNodeIds: sorted([container.id, presenter.id, ...hookFactIds]),
  exceeded: sorted(highSignalHooks.map((hook) => `presenterHighSignalHook:${hook}`)),
}
```

It is acceptable to add an adapter-local extra field to `topology` through structural typing, as Next analyzers do for `renderEdgeIds`, but S2 does not need one. If added, prefer `renderEdgeIds: ["<container.id>-><presenter.id>"]` and keep it sorted.

### Fingerprints and severity

Use deterministic SHA-256 helpers as in existing adapter analyzers.

Suggested layers:

- `containerFingerprint = sha(JSON.stringify({ id, name, file, kind, exportKind, span }))`
- `presenterFingerprint = sha(JSON.stringify({ id, name, file, kind, exportKind, span }))`
- `subjectFingerprint = sha(JSON.stringify({ containerFingerprint, presenterFingerprint, containerSeeds, presenterSeeds, highSignalHooks, renderEdgeId, hookFactIds }))`
- `structural = sha([RULE_ID, subjectFingerprint, ...exceeded].join("|"))`
- `nominal = sha(container.name + "->" + presenter.name)`
- `positional = sha(presenter.file)`

Severity stays conservative:

- `info` for one distinct high-signal presenter hook;
- `warn` for two or more distinct high-signal presenter hooks;
- never `error` in S2.

Finding `id` may include `ctx.runId`; structural, nominal, positional fingerprints must not include `ctx.runId`.

## Deterministic ordering rules

The analyzer MUST copy before sorting frozen graph arrays.

Sort order:

1. components by `id`, then `name`, `file`, `span.start`, `span.end`;
2. render edges by `srcId`, then `dstId`, then `kind`;
3. hook facts by `id`, then `file`, `span.start`, `span.end`, `name`;
4. role seed tokens lexicographically;
5. hook names lexicographically;
6. role entries by `role`, then `variant`, then `file`;
7. topology arrays lexicographically;
8. findings by `fingerprint.structural`, then `fingerprint.nominal`, then `fingerprint.positional`.

All map/set-derived values must be converted to sorted arrays before evidence or fingerprint construction.

## File changes

| File | Action | Purpose |
|---|---|---|
| `packages/adapter-react/src/container-presenter-role-drift.ts` | Create | Pure analyzer, role seed detection, hook filtering, evidence, fingerprints, deterministic sorting. |
| `packages/adapter-react/src/container-presenter-role-drift.test.ts` | Create | Strict TDD unit coverage. |
| `packages/adapter-react/src/core-adapter.ts` | Modify | Register compound analyzer first and container/presenter analyzer second. |
| `packages/adapter-react/src/core-adapter.test.ts` | Modify | Assert analyzer metadata order and source-level integration for the new rule. |
| `packages/adapter-react/src/index.ts` | Modify | Export new rule id and factory. |
| `fixtures/react/container-presenter/healthy.tsx` | Create if needed | Source fixture for a silent healthy pair. |
| `fixtures/react/container-presenter/divergent.tsx` | Create if needed | Source fixture for a paired presenter-like component with high-signal hooks. |
| `packages/cli/src/cli.test.ts` | Optional test-only | Add MCP/CLI composition parity test only if adapter-react integration coverage is not enough. |
| `docs/STATUS.md`, `docs/ROADMAP.md` | Later apply/docs | Mark P11-S2 complete after verification. |
| `packages/core/**` | Unchanged | Core remains framework-agnostic; no fact/evidence/config expansion. |

## Strict TDD plan

Strict TDD is mandatory. Start with failing tests before implementation.

| Order | Test | Expected RED reason before implementation |
|---|---|---|
| 1 | `container-presenter-role-drift.test.ts`: healthy `UserContainer -> UserView` with no high-signal hooks emits no findings. | Analyzer module does not exist. |
| 2 | Divergent `UserContainer -> UserView` where `UserView` has `useState` emits one `react/container-presenter-role-drift` finding. | Analyzer not implemented. |
| 3 | Finding evidence includes container/presenter components, role seeds, render pair, high-signal hook names, thresholds, topology ids, and primary span fallback/lookup. | Evidence absent. |
| 4 | Unpaired presenter-like component with `useState` is silent. | Pairing gate not implemented. |
| 5 | Container-like component with no presenter-like child is silent. | Pairing gate not implemented. |
| 6 | Low-signal presenter hooks (`useMemo`, `useContext`, `useTheme`, `useMediaQuery`) are silent. | Hook filtering not implemented. |
| 7 | Path-segment role seeds work, but substring-only paths such as `containerized` and names like `Overview` do not. | Role seed logic not implemented. |
| 8 | Reversed component/edge/patternFact order returns equivalent normalized findings and sorted evidence arrays. | Deterministic sorting not implemented. |
| 9 | Frozen graph input is not mutated. | Implementation may sort in place if wrong. |
| 10 | Serialized finding/evidence avoids prohibited claim words: `wrong`, `bad separation`, `team intent`, `historical`, `must refactor`, `root cause`, `bug caused`. | Bounded evidence naming not enforced. |
| 11 | `core-adapter.test.ts`: `createReactCoreAnalyzers()` returns compound first, container/presenter second. | Adapter not wired. |
| 12 | Source fixture through `analyzeRepo` emits the new rule for divergent fixture and stays silent for healthy fixture. | Integration not wired. |

Recommended fixture contents:

- `healthy.tsx`: `UserContainer` directly renders `UserView`; `UserView` renders JSX and uses no high-signal hooks.
- `divergent.tsx`: `UserContainer` directly renders `UserView`; `UserView` calls `useState` and/or `useEffect`; expected one grouped finding for that pair.
- Optional path-based fixture or unit builder: component names `User` and `Profile` in `src/containers/` and `src/views/` to prove path seeds work without suffix names.

After focused tests pass, run:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## Core boundary decision

No `@rai/core` expansion is justified for S2.

Existing core data is enough:

| Existing data | S2 use |
|---|---|
| `ComponentNode.name` | Name suffix role seeds. |
| `ComponentNode.file` | Path role seeds and positional fingerprint. |
| `ComponentNode.span` | Component-level subject span fallback and hook fact containment check. |
| `ComponentNode.hookCalls` | High-signal hook detection. |
| `GraphEdge(kind="renders")` | Direct container/presenter pair evidence. |
| `PatternHookCallFact` | Optional primary hook span and hook fact ids. |
| `AdapterMetricEvidence` | Stable evidence without new core union variant. |

Rejected core changes for S2:

- no React-specific role fact kind;
- no hook-owner fact expansion;
- no JSX attribute extraction;
- no semantic symbol resolution;
- no new `Evidence` union variant;
- no config schema change for hook thresholds.

If implementation discovers that hook-call spans cannot be matched safely, keep the component span fallback. Do not expand core in apply without a new SDD decision.

## Rollout and compatibility

- Existing P11-S1 `react/compound-component-api-drift` behavior should remain unchanged.
- CLI/MCP/backfill composition should pick up the new analyzer because `createReactCoreAnalyzers()` returns it through the already-loaded React adapter.
- Historical drift remains snapshot-based through existing finding persistence; no new MCP drift tool is added.
- Explainability and `rai explain <file>` use existing `adapter-metric` subject/role file references. No custom explanation work is required in S2.
- Rollback is adapter-local: remove the analyzer from `createReactCoreAnalyzers()`, remove its exports/tests/fixtures, and leave P10/P11-S1 code intact.

## Review workload forecast

Expected apply size is below the active 1200-line budget:

| Area | Forecast changed lines |
|---|---:|
| Analyzer implementation | 220-320 |
| Analyzer unit tests | 250-380 |
| Adapter wiring/index tests | 30-80 |
| Fixtures | 40-90 |
| Status/roadmap after verify | 20-50 |
| Optional CLI/MCP parity test | 30-70 |
| Total expected | 590-990 |

Risk: the repo handoff still prefers splitting work above 400 changed lines, while this SDD task states an active 1200-line budget. For apply, keep one PR if forecast stays under 1200 and the active SDD preference remains authoritative. Pause before apply if the forecast grows beyond 1200 or if the maintainer reasserts the 400-line split.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Role names look like intent claims. | High | Evidence says `role-seed`, `observed`, and hook names only; tests ban intent/remediation wording. |
| Presenter hooks can be noisy. | Medium | Require direct container/presenter pair and conservative exact hook allowlist. |
| `useEffect` may be presentational. | Medium | Keep severity `info` for a single hook; no remediation claim; future calibration can refine. |
| Path seeds can overmatch. | Medium | Use exact path segments and suffix-with-prefix only; no substring matches. |
| Duplicate component names can mislead graph edges. | Medium | State syntax-only limitation; use existing `renders` edge and do not claim semantic identity. |
| Evidence shape is generic. | Low | `AdapterMetricEvidence` already works with persistence, MCP, explainability, and file refs. |
| Core boundary drift. | High | No core files in planned changes; any core expansion requires separate design approval. |

## Open questions

None for S2. Broader hook policy, custom data-hook patterns, provider/context, JSX attributes, and richer adapter evidence should be handled by later approved changes.
