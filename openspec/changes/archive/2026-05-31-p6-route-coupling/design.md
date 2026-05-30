# Design: P6 Slice 5 — next/route-coupling

## Technical Approach

Add a pure `@rai/adapter-next` analyzer that measures route-owned render topology for `RouteSegment` nodes from `NextGraphEnrichment.roleIndex`. It mirrors `next/client-boundary-bloat` contracts: adapter-local thresholds, `guardNextVariant`, deterministic sorting, `Finding[]` plus `AnalysisDiagnostic[]`, and `AdapterMetricEvidence`. `@rai/core` remains unchanged and framework-independent.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| API shape | Export `ROUTE_COUPLING_RULE_ID`, `createRouteCouplingAnalyzer`, `RouteCouplingInput`, `RouteCouplingThresholds`, `RouteCouplingAnalyzer` from `packages/adapter-next/src/index.ts`. | Register in core analyzer registry. | Keeps ownership in adapter and avoids core framework strings. |
| Inputs | Accept `{ graph, detection, enrichment, thresholds?, runId, commitSha, analysisVersion }`; factory also accepts optional thresholds. | Add global config seam now. | Existing adapter pattern already supports deterministic tests without widening core config. |
| Variant guard | Support `app-router` and `pages-router`; skip `mixed-router` with `variant-mismatch`. Non-Next callers should provide no detection and not run; optional wrapper may return `variant-mismatch` for null detection. | Try to infer route mode inside analyzer. | Detection owns variant semantics; analyzer stays pure and explicit. |
| Route selection | Use sorted `enrichment.roleIndex.get("RouteSegment")`, then resolve IDs against `graph.components`. | File-name scan inside analyzer. | Enrichment is source of route roles and already excludes Pages API routes. |
| Evidence | Use existing `AdapterMetricEvidence`; add route IDs, role tags, counts, thresholds, direct/reachable IDs, and optionally render edge IDs under existing topology shape only if needed. | Add core `RouteCouplingEvidence`. | Generic metric evidence avoids core framework strings and new union variants. |

## Data Flow

```text
detection + graph + enrichment + thresholds
  └─ guardNextVariant(app-router,pages-router)
      ├─ unsupported → diagnostics[variant-mismatch], findings[]
      └─ supported → RouteSegment IDs → renders topology → metrics → exceeded thresholds → findings
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/adapter-next/src/route-coupling.ts` | Create | Pure analyzer, thresholds, topology helpers, deterministic finding/evidence construction. |
| `packages/adapter-next/src/route-coupling.test.ts` | Create | Strict TDD coverage for App/Pages, mixed skip, metrics, evidence, determinism, cycles. |
| `packages/adapter-next/src/index.ts` | Modify | Export analyzer factory, rule id, input, threshold, analyzer types. |
| `packages/core/**` | Unchanged | No framework strings, config, persistence, or evidence union changes. |

## Interfaces / Contracts

```ts
export interface RouteCouplingThresholds {
  maxFanIn: number;
  maxFanOut: number;
  maxDirectChildren: number;
  maxReachableNodes: number;
  maxReachableDepth: number;
}

export interface RouteCouplingInput {
  graph: NextGraphInput;
  detection: NextDetection;
  enrichment: NextGraphEnrichment;
  thresholds?: Partial<RouteCouplingThresholds> | undefined;
  runId: string;
  commitSha: string;
  analysisVersion: number;
}
```

Defaults stay adapter-local, likely `{ maxFanIn: 3, maxFanOut: 8, maxDirectChildren: 6, maxReachableNodes: 18, maxReachableDepth: 4 }`. Severity remains deterministic: one breach `info`, two `warn`, three or more `error`.

## Render Topology Metrics

Build incoming/outgoing maps from sorted `graph.edges` where `kind === "renders"` and both IDs are known components. For each route ID, compute fan-in, fan-out edge count, unique direct children, unique reachable descendants, and maximum acyclic reachable depth. Traversal carries a path set to break cycles and sorts all IDs before evidence/fingerprint construction.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | RED: App Router route breach emits `next/route-coupling`. | Build tiny graph/enrichment fixtures; assert metric evidence only. |
| Unit | RED: Pages Router route breach runs; mixed-router skips. | Use `guardNextVariant` expected diagnostic shape. |
| Unit | RED: below thresholds silent; threshold equality silent. | Boundary tests for every metric. |
| Unit | RED: deterministic output and cycle-safe traversal. | Reverse component/edge order; include render cycle. |
| Typecheck | Adapter exports compile. | `pnpm --filter @rai/adapter-next typecheck`. |
| Regression | Core remains framework-free. | Existing core tests plus no core file changes. |

## Migration / Rollout

No migration required. Analyzer is additive and produces no direct persistence writes; normal pipeline owns storage.

## Risks

- Name-resolved render edges may overstate ownership. Mitigation: evidence labels render topology only, includes referenced node IDs, and never claims imports, calls, modules, or prop flow.
- Route segments without component nodes produce no findings. Mitigation: deterministic silence; enrichment tests already define route tagging boundaries.

## Open Questions

None.
