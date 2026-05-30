# Proposal: P6 Client Boundary Bloat

## Intent

Ship the first Next-specific analyzer for App Router projects. It identifies oversized client component boundaries using only deterministic role tags and render topology metrics, keeping `@rai/core` framework-agnostic and adapter persistence-free.

## Scope

### In Scope
- Add `next/client-boundary-bloat` as an adapter-owned analyzer for App Router only.
- Use existing `ClientComponent` enrichment tags plus render fan-out/depth signals from the core graph.
- Emit metric-only evidence with node IDs, spans, counts, thresholds, and role data; no prose findings.
- Add threshold config under `next.clientBoundaryBloat` if the current config seam supports adapter-owned namespaces cleanly.

### Out of Scope
- Changes to `@rai/core` framework knowledge, structural fingerprints, or persistence.
- Pages Router support beyond `variant-mismatch` diagnostics.
- New enrichment roles or behavior changes to `next-adapter-enrichment`.
- `next/route-coupling` and `next/server-action-in-loop`.

## Capabilities

### New Capabilities
- `next-client-boundary-bloat`: App Router analyzer behavior, config thresholds, variant guard behavior, and metric-only evidence contract.

### Modified Capabilities
- None.

## Approach

Implement a pure synchronous analyzer in `packages/adapter-next` that receives detected Next context, enrichment output, and core render graph data. Guard execution with `supportedVariants: ["app-router"]`; pages/mixed variants return existing variant-mismatch diagnostics. For each `ClientComponent`, compute rendered subtree fan-out and reachable depth, compare against configurable defaults, and emit deterministic findings only when thresholds are exceeded.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/adapter-next/src/` | New | Analyzer, config parsing seam, and tests. |
| `openspec/specs/next-client-boundary-bloat/spec.md` | New | Capability spec for analyzer behavior. |
| `docs/superpowers/plans/p6-adapter-next.md` | Modified | Mark Slice 4 complete after implementation. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Thresholds create noisy findings | Med | Defaults stay conservative; tests cover silent-below-threshold behavior. |
| Config namespace leaks into core | Low | Keep adapter config parsing in adapter package; core remains string-free for Next. |
| Evidence drifts into narrative | Low | Spec requires counts/spans/thresholds only; tests assert evidence shape. |

## Rollback Plan

Remove the analyzer registration, config schema additions, tests, and `next-client-boundary-bloat` spec. No persisted adapter state or core schema changes need rollback.

## Dependencies

- Existing `detectNext`, `guardNextVariant`, and `enrichNext` APIs from P6 slices 1-3.
- Existing core render edges and analyzer diagnostic isolation.

## Success Criteria

- [ ] Oversized App Router client boundary fixture emits `next/client-boundary-bloat`.
- [ ] Below-threshold fixture emits no finding.
- [ ] Pages Router input emits `variant-mismatch`, not a finding.
- [ ] Evidence contains metrics only: spans, counts, thresholds, node IDs, roles.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
