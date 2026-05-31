# Design: P11 React Pattern Analyzers + Pattern Drift

## Technical Approach

Deliver P11-S1 as an adapter-owned React analyzer slice. `packages/adapter-react` becomes the host for pure React pattern analyzers, `packages/cli` composes those analyzers into CLI/MCP/backfill sessions, and `packages/core` remains framework-agnostic. The first concrete analyzer is `react/compound-component-api-drift`, derived only from P10 `RepoGraph.patternFacts`.

This slice treats “pattern drift” as current-repository pattern divergence: observed dot-member JSX usage disagrees with observed static member declarations for the same compound root. Historical drift remains the existing snapshot/`get_drift` comparison of stable findings over time.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Package boundary | Put analyzer factory and compound API analyzer in `packages/adapter-react`; keep `packages/core` unchanged. | Add React analyzer to core; create a new core pattern package. | Existing guardrails require adapters depend on core, never reverse. P10 facts are generic; React interpretation belongs outside core. |
| CLI/MCP composition | Add React adapter loading to `packages/cli/src/adapters.ts` alongside Next, with independent optional-load handling per adapter. | Load React from core session construction; require all adapters to load as one module. | CLI is the existing composition root. Independent loading preserves Next when React fails, and React when Next is unavailable. |
| Analyzer shape | Expose `createReactCoreAnalyzers(input)` returning core-compatible `Analyzer[]`. Register `react/compound-component-api-drift` whenever `@rai/adapter-react` is available. | Add a React detection step before registration. | RAI already analyzes React/JSX projects; the analyzer is self-filtering and emits nothing without corroborating compound facts. |
| Candidate model | Build repo-observed compound roots from same-root `member-assignment` and dot-member `jsx` facts. Split member chains at the final dot, so `Namespace.Modal.Trigger` has root `Namespace.Modal` and part `Trigger`. | Require symbol/type resolution; require declarations and usages in the same file only. | Syntax-only matching preserves scope and budget. Same-file-only would miss normal imported usage; symbol resolution is out of scope. |
| Divergence emitted | Emit findings for `missingDeclarations` first: JSX-used parts with no observed static member assignment for that root. Do not emit unused-only findings in S1. | Emit both missing and unused declarations as findings. | Missing declarations are stronger current-source disagreement. Unused-only declarations are often exported public API not used inside the repo, so S1 avoids that noise. |
| Evidence shape | Reuse `AdapterMetricEvidence` for S1. Do not add a new `Evidence` union variant. | Add generic `adapter-pattern` evidence with structured observations and spans. | Specs allow an equivalent stable field, and existing adapter-metric evidence already flows through persistence, MCP, file refs, and explainability. A new union variant would require core type changes plus explainability/file-ref/MCP tests and increases review risk. |
| Historical drift | Rely on existing snapshot persistence and `get_drift`. | Add a React-specific pattern drift table or MCP tool. | Stable findings automatically participate in snapshot drift. The spec explicitly says no new drift tool for S1. |

## Data Flow

```text
SourceFile[]
  -> @rai/core pass1/buildGraph/freezeGraph
     - RepoGraph.patternFacts: sorted, deduped, frozen generic facts
  -> packages/cli loadInstalledAdapters(rootDir)
     - load @rai/adapter-next independently
     - load @rai/adapter-react independently
  -> createSession/analyzeRepo registryFactory(files)
     - base core analyzers
     - Next analyzers when available/applicable
     - React analyzers when available
  -> react/compound-component-api-drift analyzer
     - read ctx.graph.patternFacts only
     - index member-assignment facts by root/property
     - index dot-member JSX facts by root/part
     - derive declaredParts, usedParts, missingDeclarations
     - emit deterministic findings for missing declarations
  -> core pipeline persists findings and snapshots
  -> MCP/CLI expose counts, current findings, explanations, and existing get_drift
```

## Package Boundaries

### `packages/core`

No planned code changes for S1.

Core continues to own:

- generic `PatternFact` types and frozen `RepoGraph.patternFacts`;
- analyzer execution and diagnostic isolation;
- finding persistence, memory overlay, and snapshot population;
- MCP session tools and generic explainability.

Core MUST NOT gain React imports, React catalog names, React rule IDs, React-specific evidence types, or React analyzer registration.

### `packages/adapter-react`

Owns all React interpretation:

- `src/core-adapter.ts` exports `createReactCoreAnalyzers(input)`.
- `src/compound-component-api-drift.ts` implements the analyzer.
- `src/index.ts` exports analyzer factory, rule id, and public testable analyzer helpers if needed.
- `src/catalog.ts` remains syntax/catalog scaffold; it may be imported by the analyzer only for adapter-owned metadata, not for core changes.

### `packages/cli`

Owns installed adapter composition:

- `src/adapters.ts` loads `@rai/adapter-next` and `@rai/adapter-react` independently.
- `package.json` adds `@rai/adapter-react` as a workspace dependency so built CLI distributions include the React adapter.
- Existing `runAnalyze`, `runBackfillCommand`, `runExplainCommand`, `buildCliMcpServer`, and `mcp` continue to use the same `registryFactory` seam.

## Analyzer Placement and Contract

Add a core-compatible analyzer returned by the React adapter:

```ts
export const COMPOUND_COMPONENT_API_DRIFT_RULE_ID = "react/compound-component-api-drift";

export interface ReactCoreAnalyzerInput {
  rootDir: string;
  files: SourceFile[];
}

export function createReactCoreAnalyzers(input: ReactCoreAnalyzerInput): Analyzer[];
```

The returned analyzer has:

- `ruleId: "react/compound-component-api-drift"`;
- `framework: "react"`;
- `analyze(ctx: AnalysisContext): AnalyzerResult`;
- no filesystem reads, writes, network, clock, randomness, memory writes, config writes, or LLM calls.

Analyzer failures should not be caught locally except for narrow input normalization if needed. The existing core pipeline converts thrown errors into `analyzer-error` diagnostics.

## Data Model and Matching Semantics

Internal adapter-only model:

```ts
interface CompoundRootObservation {
  root: string;
  declarationFactsByPart: Map<string, PatternMemberAssignmentFact[]>;
  usageFactsByPart: Map<string, PatternJsxFact[]>;
}
```

Extraction rules:

1. `member-assignment` facts contribute declarations: `object` is the root and `property` is the declared part.
2. `jsx` facts contribute usages only when `tag` contains a dot. Split at the final dot: left side is the root, right side is the used part.
3. Root and part strings must be non-empty and deterministic string comparisons only. Do not resolve imports, exports, aliases, values, or types.
4. Candidate roots require at least one declaration fact and at least one dot-member JSX usage for the same root.
5. `declaredParts = sorted(keys(declarationFactsByPart))`.
6. `usedParts = sorted(keys(usageFactsByPart))`.
7. `missingDeclarations = sorted(usedParts - declaredParts)`.
8. `unusedDeclarations = sorted(declaredParts - usedParts)` may be computed for diagnostics/testing, but S1 does not emit unused-only findings.
9. Emit one finding per root only when `missingDeclarations.length > 0`.

Conservative claim boundary:

- The analyzer may say observed JSX member usage lacks a matching observed static member declaration.
- It must not claim team intent, symbol identity, historical drift, dead code, root cause, user impact, or a required remediation.

## Evidence Decision

S1 reuses `AdapterMetricEvidence` exactly. Evidence encoding:

- `kind`: `"adapter-metric"`.
- `adapterId`: `"react"`.
- `ruleId`: `"react/compound-component-api-drift"`.
- `subject`: the compound root, using the first deterministic divergent usage fact span as the primary span. `subject.id` should be stable, e.g. `react:compound-root:<root>`; `subject.name` is the root string; `subject.fingerprint` is a stable hash of root plus sorted evidence fact ids.
- `roles`: sorted file-level observations. Recommended role/variant pairs:
  - `role: "compound-root", variant: "observed"` for root files when useful;
  - `role: "declared-part", variant: <part>` for declaration facts;
  - `role: "used-part", variant: <part>` for JSX usage facts;
  - `role: "missing-declaration", variant: <part>` for divergent parts.
- `metrics`: counts only, e.g. `declaredParts`, `usedParts`, `missingDeclarations`, and optionally `unusedDeclarations` as an observed count.
- `thresholds`: stable zero thresholds for divergence counts, e.g. `{ maxMissingDeclarations: 0 }`.
- `topology.directChildIds`: stable declaration fact ids for the root, sorted.
- `topology.reachableNodeIds`: stable JSX usage fact ids for the root, sorted.
- `topology.exceeded`: stable divergence tokens such as `missingDeclarations:Footer`, sorted.

This is not as expressive as a future generic pattern evidence shape, but it avoids core churn. If later P11/P12 analyzers need multi-span structured observations, propose a framework-neutral `adapter-pattern` evidence variant in a separate design. That future cost would include updates to `packages/core/src/types.ts`, explainability summaries, file-reference extraction, MCP schema/golden tests, snapshot evidence digest tests, and adapter tests.

## Fingerprints and Determinism

Rules:

- Sort all facts by existing `fact.id` before indexing.
- Sort roots, parts, files, roles, topology arrays, and `exceeded` tokens lexicographically.
- Use deterministic JSON serialization with explicitly ordered object keys for subject fingerprints and finding fingerprints.
- Finding `id` may include `ctx.runId`; structural fingerprints must not.
- Suggested fingerprint layers:
  - `structural = sha([RULE_ID, root, ...missingDeclarations].join("|"))`;
  - `nominal = sha(root)`;
  - `positional = sha(primarySpan.file)`.
- If two unrelated roots share the same raw root name, S1 may collapse them by root name. This is an accepted syntax-only limitation; do not add symbol resolution in S1.
- Severity should be conservative: `info` for one missing declaration, `warn` for multiple missing declarations. Avoid `error` in S1 unless a later spec defines stronger guarantees.

## CLI, MCP, Backfill, and Explainability Impact

### CLI

`rai analyze` includes React findings when `@rai/adapter-react` is available. Output shape does not change: counts, top fingerprints, and diagnostics remain existing fields.

`rai explain <file>` benefits through existing `findingFileRefs` behavior for `adapter-metric`: the subject span and role files make React findings discoverable for relevant files. No new command is added.

### MCP

`rai mcp` and `buildCliMcpServer` reuse the CLI registry factory, so `analyze_repo` counts include React findings when available. Diagnostics remain diagnostics, not findings. No new MCP pattern or drift tool is added.

`explain_finding` returns the raw finding plus the existing generic adapter-metric explanation. It may show unknown role/metric terms as raw facts; that is acceptable for S1 and avoids inventing narrative.

### Backfill and snapshots

`rai backfill` already composes adapters through `loadInstalledAdapters`. React findings therefore enter snapshots through the normal pipeline. Historical drift uses existing `(fingerprint, rule_id, evidence_digest)` set algebra in `get_drift`.

## Persistence and Write-Direction Invariants

- Analyzer reads only `ctx.graph`, `ctx.config` if needed, and adapter-owned constants.
- Analyzer does not write findings directly; it returns findings to the core pipeline.
- Analyzer does not write snapshots; snapshot writes remain derived from persisted findings.
- Analyzer does not write feedback, memory, config, instruction files, codemod proofs, or source files.
- `get_drift` remains read-only and never triggers analysis.
- Memory overlay remains read-time presentation only; React findings can be suppressed/amplified through existing feedback paths after they exist, but the analyzer does not create feedback.
- LLMs remain presentation-only and are not part of finding generation.

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/adapter-react/src/core-adapter.ts` | Create | Export `createReactCoreAnalyzers` returning the S1 React analyzer. |
| `packages/adapter-react/src/compound-component-api-drift.ts` | Create | Implement pure fact indexing, divergence derivation, evidence, fingerprints, and deterministic sorting. |
| `packages/adapter-react/src/index.ts` | Modify | Export analyzer factory, rule id, and public types. |
| `packages/adapter-react/src/catalog.ts` | Maybe modify | Only if the analyzer needs adapter-owned catalog constants; do not add findings or writes there. |
| `packages/adapter-react/src/*.test.ts` | Create/modify | Unit tests for analyzer behavior, determinism, and package boundary. |
| `packages/cli/src/adapters.ts` | Modify | Load Next and React adapters independently; emit per-adapter diagnostics for unexpected failures. |
| `packages/cli/src/adapters.test.ts` | Modify | Cover both adapters available, each adapter unavailable, failure diagnostics, and Next preservation. |
| `packages/cli/package.json` | Modify | Add `@rai/adapter-react` workspace dependency. |
| `packages/cli/src/cli.test.ts` | Modify if needed | Add CLI/MCP/backfill parity tests for React findings if adapter-loading unit tests are insufficient. |
| `fixtures/react/compound-primitives/divergent.tsx` | Create if needed | Minimal fixture with declared `Trigger` and used `Footer` to produce one missing declaration. |
| `docs/STATUS.md`, `docs/ROADMAP.md` | Modify after apply | Record completed P11-S1 and deferred P11 families. |

No `packages/core` code changes are planned.

## Interfaces / Contracts

### Adapter loader contract

Refactor `packages/cli/src/adapters.ts` around adapter descriptors:

```ts
interface InstalledAdapterDescriptor<T> {
  adapterId: "next" | "react";
  packageName: string;
  importAdapter: () => Promise<T>;
  createAnalyzers: (mod: T, input: { rootDir: string; files: SourceFile[] }) => Analyzer[];
}
```

Each descriptor loads independently. Missing optional adapter packages produce no diagnostic. Unexpected failures produce one `adapter-load-skipped` diagnostic with the relevant `adapterId` and `packageName`. Loaded analyzers are appended after base analyzers in descriptor order: Next, then React, unless implementation chooses a documented stable order. Duplicate rule IDs continue to fail through `AnalyzerRegistry.register`.

### React analyzer contract

`createReactCoreAnalyzers({ rootDir, files })` returns `[compoundComponentApiDriftAnalyzer]`. `rootDir` and `files` are accepted for parity with Next and future React detection, but S1 analyzer decisions must come from `ctx.graph.patternFacts`.

### Finding contract

A `react/compound-component-api-drift` finding:

- type: `opportunity`;
- severity: `info` or `warn` by missing declaration count;
- evidence kind: `adapter-metric`;
- adapter id: `react`;
- no prose remediation in evidence;
- stable subject span and file references;
- deterministic roles/metrics/topology values;
- stable structural fingerprint for identical source input.

## Testing Strategy

Strict TDD applies: add failing tests before implementation.

| Layer | Tests |
|---|---|
| Adapter unit | Healthy Modal/Popover fixture emits no `react/compound-component-api-drift` finding. |
| Adapter unit | Divergent fixture with `Modal.Trigger` declared and `Modal.Footer` used emits one finding with `missingDeclarations:Footer` evidence token. |
| Adapter unit | No finding when JSX dot-member usage has no same-root static member assignment at all. |
| Adapter unit | No unused-only finding when a declared part has no observed JSX use. |
| Adapter unit | Multiple roots/parts/files produce sorted findings, roles, metrics, topology arrays, and deterministic fingerprints across repeated runs. |
| Adapter unit | Analyzer does not mutate frozen `graph.patternFacts`; Object.freeze violations should not be needed because analyzer only reads. |
| Adapter integration | `createReactCoreAnalyzers` returns core-compatible analyzer(s) with framework `react` and findings flow through `analyzeRepo`. |
| CLI unit | Loader composes both Next and React analyzers when both modules are available. |
| CLI unit | React unavailable is a no-op and does not suppress Next. |
| CLI unit | Next unavailable is a no-op and does not suppress React. |
| CLI unit | Unexpected React import failure emits deterministic `adapter-load-skipped` with `adapterId: "react"`. |
| CLI/MCP integration | `buildCliMcpServer` / `analyze_repo` includes React findings through the same registry factory when the workspace adapter is available. |
| Snapshot/drift integration | A snapshot-producing analysis can persist a React finding; existing `get_drift` reports added/removed when comparing commits or test snapshots. |
| Explainability/file refs | `rai explain <file>` or direct `findingMatchesFile` can find the React finding by subject span or role file. |
| Guardrail | `pnpm lint` core framework-free guard still passes. |

Verification commands after implementation:

```bash
pnpm test
pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## Rollout Plan

Recommended apply order:

1. **React analyzer work unit**: add analyzer tests, analyzer implementation, core-adapter export, and adapter-react index exports.
2. **Composition work unit**: add CLI dependency and independent Next/React adapter loading tests/implementation.
3. **Integration/docs work unit**: add divergent fixture and CLI/MCP/snapshot/explain coverage as needed; update status/roadmap after verification.

Review workload forecast is medium-to-high for a single PR. If changed lines exceed 400, use work-unit commits and split into chained/stacked PRs unless a maintainer accepts a size exception. The likely split is:

```text
PR 1: adapter-react analyzer + tests
  -> PR 2: CLI/MCP composition + integration tests
  -> PR 3: docs/status/spec archive updates if needed
```

## Rollback Plan

Rollback is adapter-local and composition-local:

1. Remove React adapter descriptor from `packages/cli/src/adapters.ts`.
2. Remove `@rai/adapter-react` from `packages/cli/package.json` if added only for this slice.
3. Revert `packages/adapter-react` analyzer/core-adapter files and tests.
4. Revert divergent fixture additions if they are not useful for future P11 work.
5. Leave P10 `RepoGraph.patternFacts` intact.
6. Ignore or delete local snapshots containing `react/compound-component-api-drift`; no memory/config writes should exist.
7. Revert status/roadmap/OpenSpec updates if the slice is abandoned.

Existing core analyzers, Next adapter behavior, memory feedback semantics, and historical drift tooling should remain unaffected.

## Review Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Core boundary regression | High | No core changes planned; run `pnpm lint`; review imports for `adapter-react` in core. |
| False positives from raw names | Medium | Require same-root declaration plus usage; emit only missing declarations; phrase as observed current-source disagreement. |
| Evidence awkwardness | Medium | Reuse `adapter-metric` for S1; document future generic evidence separately if needed. |
| Adapter load coupling | Medium | Load adapters independently; tests cover one adapter failing while the other remains active. |
| Snapshot noise | Medium | Stable fingerprints/evidence ordering; test repeated identical analysis. |
| Review budget overrun | Medium/high | Keep S1 narrow; split above 400 changed lines according to chained-pr/work-unit guidance. |
| Explainability under-specific | Low/medium | Existing generic adapter-metric explanation is acceptable; raw evidence remains authoritative. |

## Open Questions

None for S1. The richer `adapter-pattern` evidence shape is explicitly deferred until multiple React pattern families prove `AdapterMetricEvidence` is insufficient.
