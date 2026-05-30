# Proposal: P6 Slice 5 — next/route-coupling

## Intent

Add a Next adapter analyzer that detects route-level render topology coupling without teaching `@rai/core` any Next.js concepts.

## Scope

### In Scope
- Add `next/route-coupling` as an `@rai/adapter-next` analyzer concept.
- Analyze App Router and Pages Router `RouteSegment` nodes from enrichment `roleIndex`.
- Reuse core `renders` topology for fan-in, fan-out, direct children, reachable nodes, and reachable depth.
- Emit metric-only generic adapter evidence; use diagnostic skip for `mixed-router`.

### Out of Scope
- No implementation code in this phase.
- No Next-specific config in `@rai/core`.
- No import/call/prop-flow coupling claims.
- No mixed-router findings until semantics are specified.

## Capabilities

### New Capabilities
- `next-route-coupling`: Adapter-owned route topology analyzer behavior, variant guard, metric evidence, and persistence boundary.

### Modified Capabilities
- None. Existing `next-adapter-enrichment` route roles are reused as-is.

## Approach

Use an adapter-owned metric analyzer mirroring existing deterministic topology patterns. Subjects come from `enrichment.roleIndex.get("RouteSegment")`; edges come from core `RepoGraph.edges` where `kind === "renders"`. Thresholds stay adapter-local through analyzer factory/input options until a real adapter-config seam exists. Findings return through the normal analyzer result path; adapters write no persistence.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/adapter-next/src/route-coupling.ts` | New | Future pure analyzer home. |
| `packages/adapter-next/src/route-coupling.test.ts` | New | Future TDD coverage for variants, metrics, determinism. |
| `packages/adapter-next/src/index.ts` | Modified | Future analyzer export. |
| `openspec/specs/next-route-coupling/spec.md` | New | Spec contract for Slice 5. |
| `packages/core/**` | Unchanged | Core remains framework-agnostic. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Render edges are name-resolved, not import-aware | Med | Evidence must say render topology only. |
| Pages route metrics may be sparse | Med | Test real page components; exclude API routes. |
| Mixed router semantics unclear | High | Emit `variant-mismatch` diagnostic, no findings. |
| Plan mentions `next.routeCoupling` config | Med | Defer user-facing config; keep adapter-local thresholds. |

## Rollback Plan

Drop the new capability spec and future analyzer registration/export. Existing core, enrichment, persistence, and client-boundary-bloat behavior remain unchanged.

## Dependencies

- `next-adapter-enrichment` role tags and deterministic `roleIndex`.
- Core `renders` edges and `AdapterMetricEvidence`.
- P6 variant guard diagnostics.

## Success Criteria

- [ ] Spec defines App Router and Pages Router route-coupling behavior.
- [ ] Spec requires `mixed-router` diagnostic skip with zero findings.
- [ ] Spec requires metric-only generic adapter evidence.
- [ ] Future tasks keep implementation within 800 changed-line review budget or forecast chained slices.
