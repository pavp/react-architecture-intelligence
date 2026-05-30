# Design: P6 Client Boundary Bloat

## Technical Approach

Add `next/client-boundary-bloat` as an adapter-owned, pure synchronous analyzer in `@rai/adapter-next`. It consumes frozen core graph data plus `NextDetection` and `NextGraphEnrichment`, gates execution through `guardNextVariant({ supportedVariants: ["app-router"] })`, and returns findings/diagnostics only. Thresholds stay adapter-local for this slice via an analyzer factory; core config schema stays framework-independent.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Adapter ownership | Create analyzer in `packages/adapter-next/src/client-boundary-bloat.ts` | Add rule to `@rai/core` | Preserves adapter → core dependency direction and keeps Next strings out of core analyzer registry. |
| Config seam | `createClientBoundaryBloatAnalyzer({ thresholds? })` with local defaults | Add `next.clientBoundaryBloat` to core `RaiConfig` | Current schema is core-owned and strict; adapter-local factory avoids leaking Next namespace into core. CLI config integration can map user config later. |
| Evidence contract | Add generic core `AdapterMetricEvidence` with `kind: "adapter-metric"`, `adapterId`, `ruleId`, subject, metrics, thresholds, roles, topology | Add Next-specific evidence union member to core; cast evidence unsafely in adapter | Generic evidence enables typed adapter findings without core importing Next or embedding Next-specific strings. |
| Metrics | Direct render edge count, unique direct children, reachable node count, reachable depth | Reuse `react/render-coupling` directly | Boundary rule needs App Router role tags and client-boundary subject; reuse algorithm shape, not rule semantics. |
| Variant guard | Analyzer result wrapper returns `{ findings, diagnostics }` | Throw analyzer error; silent skip | Existing guard already emits structured `variant-mismatch`; diagnostics remain separate from findings and persistence. |

## Data Flow

    detectNext(rootDir) ──→ enrichNext(graph,detection,files)
            │                         │
            └──→ clientBoundaryBloat analyzer ──→ { findings, diagnostics }
                                      │
                         guardNextVariant(app-router only)

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/adapter-next/src/client-boundary-bloat.ts` | Create | Analyzer factory, defaults, metric traversal, deterministic findings, diagnostic wrapper. |
| `packages/adapter-next/src/client-boundary-bloat.test.ts` | Create | Strict TDD tests for oversized, below-threshold, pages/mixed variant mismatch, evidence keys, deterministic sort. |
| `packages/adapter-next/src/index.ts` | Modify | Export analyzer factory, result/config/evidence-facing types. |
| `packages/core/src/types.ts` | Modify | Add generic `AdapterMetricEvidence` to `Evidence` union; no Next strings. |
| `packages/core/src/mcp/tools.ts` | Modify | Teach `spanFromEvidence` to resolve `adapter-metric.subject.span`. |
| `packages/core/src/index.ts` | Modify | Export generic analyzer types if adapter needs `Analyzer`/`AnalysisContext` from package root. |
| `docs/superpowers/plans/p6-adapter-next.md` | Modify after implementation | Mark Slice 4 complete when tests/build/typecheck pass. |

## Interfaces / Contracts

```ts
export interface ClientBoundaryBloatThresholds {
  maxFanOut: number;
  maxDirectChildren: number;
  maxReachableNodes: number;
  maxReachableDepth: number;
}

export interface ClientBoundaryBloatInput {
  graph: NextGraphInput;
  detection: NextDetection;
  enrichment: NextGraphEnrichment;
  thresholds?: Partial<ClientBoundaryBloatThresholds>;
  runId: string;
  commitSha: string;
  analysisVersion: number;
}

export interface NextAdapterAnalyzerResult {
  findings: Finding[];
  diagnostics: AnalysisDiagnostic[];
}
```

Core generic evidence shape:

```ts
interface AdapterMetricEvidence {
  kind: "adapter-metric";
  adapterId: string;
  ruleId: string;
  subject: { id: string; name: string; file: string; span: Span; fingerprint: string };
  roles: { role: string; variant: string; file: string }[];
  metrics: Record<string, number>;
  thresholds: Record<string, number>;
  topology: { directChildIds: string[]; reachableNodeIds: string[]; exceeded: string[] };
}
```

Default thresholds: `{ maxFanOut: 10, maxDirectChildren: 8, maxReachableNodes: 20, maxReachableDepth: 4 }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Metric breaches and silence at thresholds | Build small in-memory `ComponentNode`/`GraphEdge` fixtures and enrichment maps. |
| Unit | Variant behavior | Pages and mixed detections return one `variant-mismatch` diagnostic and zero findings. |
| Unit | Evidence contract | Assert metric-only keys; no `message`, `description`, `recommendation`, or prose fields. |
| Integration | Typed core evidence | `types.test.ts` accepts `AdapterMetricEvidence`; MCP span lookup handles it. |

## Migration / Rollout

No migration required. Analyzer is exported but not auto-loaded by CLI until P6 Slice 6.

## Open Questions

None.
