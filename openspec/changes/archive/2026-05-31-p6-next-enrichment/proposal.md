# Proposal: P6 Next Enrichment

## Intent

Formalize P6 Slice 3 as an adapter-owned enrichment layer that adds Next.js roles over a frozen `RepoGraph` while preserving `@rai/core` framework neutrality, graph immutability, and structural fingerprint stability.

## Scope

### In Scope
- Add Next role tags for route segments, layouts, client components, server components, and server actions.
- Build a role index for route segments and layouts for later Next analyzers.
- Emit Next-only enrichment edges outside the core `RepoGraph`.
- Prove enrichment does not mutate frozen graph input or structural fingerprints.

### Out of Scope
- No core graph schema changes or core framework branching.
- No adapter-owned persistence, snapshots, findings, feedback, or proof tables.
- No Next analyzer implementation beyond enrichment consumers.
- No structural fingerprint mutation; nominal/positional refinement remains future work.

## Capabilities

### New Capabilities
- `next-adapter-enrichment`: Adapter-owned Next.js enrichment over frozen core graphs, including role tags, role index, extra framework edges, and immutability guarantees.

### Modified Capabilities
- None

## Approach

Implement `enrichNext` in `@rai/adapter-next` as a pure function over `NextDetection`, source files, and read-only core graph slices. Derive route/layout roles from detection signals, derive client/server/server-action roles from top-of-file directives, return all tags/edges/indexes in enrichment output only, and test frozen-input immutability.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/adapter-next/src/enrich.ts` | New/Modified | Enrichment types, tags, role index, extra edges. |
| `packages/adapter-next/src/enrich.test.ts` | New/Modified | App-router, pages-router, and frozen graph tests. |
| `packages/adapter-next/src/index.ts` | Modified | Export enrichment API and types. |
| `docs/superpowers/plans/p6-adapter-next.md` | Modified | Mark or refine Slice 3 status and exit criteria. |
| `docs/superpowers/STATUS.md` | Modified | Update P6 status after verification. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Enrichment accidentally mutates core graph | Med | Freeze fixtures and assert original graph equality after enrichment. |
| Next roles leak into `@rai/core` | Low | Keep all Next types/strings inside adapter package and retain core coupling guard. |
| Extra edges alter structural fingerprints | Med | Return adapter edges separately and test core graph edges/fingerprints unchanged. |

## Rollback Plan

Revert the `p6-next-enrichment` change files and adapter enrichment exports. Since no persistence or core schema changes are introduced, rollback is code-only and leaves stored analysis data untouched.

## Dependencies

- P6 Slice 1 Next detection and Slice 2 variant guard APIs.
- Existing `@rai/core` graph node and edge types as read-only inputs.

## Success Criteria

- [ ] App-router fixtures receive route, layout, client/server, and server-action tags where applicable.
- [ ] Pages-router fixtures receive route tags without app-only server/client tagging.
- [ ] Role index exposes route segment and layout node IDs deterministically.
- [ ] Next extra edges exist only in enrichment output, not in `RepoGraph`.
- [ ] Frozen input graph and structural fingerprints remain unchanged.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
