# Design: P6 Next Enrichment

## Technical Approach

Add `enrichNext` inside `@rai/adapter-next` as a pure adapter function over a readonly graph slice, `NextDetection`, and source files. It returns adapter-only metadata: `nodeTags`, `roleIndex`, and `extraEdges`. `@rai/core` remains framework-neutral: no core schema changes, no Next imports, no persistence, and no mutation of `RepoGraph`, graph nodes, graph edges, modules, or fingerprints.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Ownership | Keep enrichment in `packages/adapter-next/src/enrich.ts` and export from adapter `index.ts`. | Add roles to `@rai/core` graph types. | Preserves adapter seam and `packages/core` framework independence. |
| Input shape | Accept `{ graph, detection, files }`, where `graph` is graph-like readonly arrays, not concrete mutable `RepoGraph`. | Accept full mutable `RepoGraph`. | Allows frozen graphs and tests immutability without forcing core-specific ownership. |
| Output shape | Return `Map<string, NextTag[]>`, `Map<NextRole, string[]>`, and `NextEnrichmentEdge[]`. | Mutate nodes or add core edge kinds. | Keeps framework roles and Next-only edges outside structural graph/fingerprint input. |
| Route matching | Match node files against `detection.signals.appRouteFiles` / `pagesRouteFiles`, normalizing graph paths and stripping `app/` or `pages/` prefixes. | Re-scan filesystem or infer from path alone. | Detection is source of truth; avoids duplicate router heuristics. |
| Directives | Parse only first few source lines for exact top-level `'use client'` / `"use server"` directive strings. | Full AST parse or whole-file regex. | Directive semantics are top-of-file; bounded parsing stays cheap and deterministic. |

## Data Flow

```text
NextDetection.signals ─┐
Source files ──────────┼─→ enrichNext ─→ nodeTags Map
Readonly graph ────────┘              ├→ roleIndex Map
                                      └→ extraEdges[]

RepoGraph / fingerprints: read only, unchanged
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/adapter-next/src/enrich.ts` | Create/Modify | Define `enrichNext`, enrichment types, role tagging, deterministic indexes, and adapter-only edges. |
| `packages/adapter-next/src/index.ts` | Modify | Export `enrichNext` and public enrichment types. |
| `packages/adapter-next/src/enrich.test.ts` | Create/Modify | Cover app-router roles, pages-router route-only tags, directive roles, deterministic indexes, extra edges, and frozen graph immutability. |
| `packages/core/src/*` | No change | Core must not import or branch on Next. |

## Interfaces / Contracts

```ts
type NextRole = "RouteSegment" | "Layout" | "ClientComponent" | "ServerComponent" | "ServerAction";

interface NextGraphInput {
  components: readonly ComponentNode[];
  hooks: readonly HookNode[];
  modules: readonly ModuleNode[];
  edges: readonly GraphEdge[];
}

interface NextGraphEnrichment {
  nodeTags: Map<string, NextTag[]>;
  roleIndex: Map<NextRole, string[]>;
  extraEdges: NextEnrichmentEdge[];
}
```

Role rules:

- App `page.*` and route files detected by `appRouteFiles` receive `RouteSegment`.
- App `layout.*` files receive `Layout`.
- App files with top-of-file `use client` receive `ClientComponent`; other App files receive `ServerComponent`.
- App files with top-of-file `use server` also receive `ServerAction`.
- Pages Router files detected by `pagesRouteFiles` receive only `RouteSegment`.
- `roleIndex` arrays and `extraEdges` sort deterministically by role/node/edge keys.
- Layout wrapping edges, if emitted, use adapter edge kind such as `next/layout-wraps` and never enter `RepoGraph.edges`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | App-router route/layout/client/server/server-action roles | Hand-built readonly graph + detection fixture + source files. |
| Unit | Pages-router route-only behavior | Pages detection fixture; assert no App-only roles. |
| Unit | Frozen graph immutability | Freeze graph/nodes/edges, run enrichment, assert deep equality and unchanged edge/fingerprint inputs. |
| Integration | Core framework boundary | Existing or new guard that `packages/core` contains no Next imports/strings used for coupling. |

## Migration / Rollout

No migration required. Enrichment is computed in memory, adapter-owned, and does not alter persisted findings, snapshots, feedback, or core graph storage.

## Open Questions

None.
