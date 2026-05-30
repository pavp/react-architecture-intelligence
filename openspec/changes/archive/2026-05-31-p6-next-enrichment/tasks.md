# Tasks: P6 Next Enrichment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250-350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Next enrichment tests, implementation, exports, docs/status, verification | PR 1 | Single reviewable slice; no chained PRs |

## Phase 1: RED Tests

- [x] 1.1 Create `packages/adapter-next/src/enrich.test.ts` app-router tests for `RouteSegment`, `Layout`, `ClientComponent`, `ServerComponent`, `ServerAction`, `roleIndex`, and enrichment-only layout edges.
- [x] 1.2 Create `packages/adapter-next/src/enrich.test.ts` pages-router tests proving detected `pages/*` route nodes get only `RouteSegment` and no app-only roles.
- [x] 1.3 Create `packages/adapter-next/src/enrich.test.ts` frozen graph test: freeze graph/nodes/edges, capture fingerprints, run enrichment, assert deep equality and unchanged `RepoGraph.edges`.

## Phase 2: GREEN Implementation

- [x] 2.1 Implement `packages/adapter-next/src/enrich.ts` public types: `NextRole`, `NextTag`, `NextGraphInput`, `NextEnrichmentEdge`, `NextGraphEnrichment`, and `EnrichNextInput`.
- [x] 2.2 Implement `enrichNext` as pure adapter-owned logic over `detection`, `files`, and readonly graph arrays; never mutate graph, nodes, edges, modules, or fingerprints.
- [x] 2.3 Add deterministic role tagging from detection signals and top-of-file directives; sort `roleIndex` node IDs and `extraEdges` by stable keys.
- [x] 2.4 Emit any layout wrapping edges only in `NextGraphEnrichment.extraEdges` using adapter kind `next/layout-wraps`; never append to core graph edges.

## Phase 3: Integration and Docs

- [x] 3.1 Export `enrichNext` and enrichment public types from `packages/adapter-next/src/index.ts` using NodeNext-compatible explicit `.js` imports.
- [x] 3.2 Update `docs/superpowers/plans/p6-adapter-next.md` to mark Slice 3 enrichment scope and exit criteria complete after verification.
- [x] 3.3 Update `docs/superpowers/STATUS.md` P6 section with enrichment roles, role index, adapter-only edges, and frozen graph invariant.

## Phase 4: Verification

- [x] 4.1 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; record any lint placeholder behavior in apply/verify notes.
