## Exploration: P6 Slice 5 — next/route-coupling

### Current State

`@rai/adapter-next` already owns Next detection, variant guard diagnostics, enrichment, and the first adapter analyzer (`next/client-boundary-bloat`). `@rai/core` exposes framework-agnostic graph topology (`renders`, `uses-hook`) plus generic `AdapterMetricEvidence`, so route coupling can stay entirely inside `@rai/adapter-next` while reusing core render edges.

Next enrichment currently tags App Router `page.*` files as `RouteSegment`, `layout.*` files as `Layout`, Pages Router route files as `RouteSegment`, and exposes deterministic `roleIndex`. Existing render topology is name-based from core Pass-1, so route coupling can measure route nodes through current `renders` edges without adding imports/calls/passes edges.

### Affected Areas

- `packages/adapter-next/src/route-coupling.ts` — new pure analyzer should live here; no implementation in explore phase.
- `packages/adapter-next/src/route-coupling.test.ts` — strict TDD target for App Router, Pages Router, plain React/no-route silence, deterministic evidence, and unsupported mixed-router diagnostic.
- `packages/adapter-next/src/index.ts` — export analyzer factory/types after implementation.
- `packages/adapter-next/src/enrich.ts` — existing `RouteSegment` role index is enough; avoid changing unless tests reveal route identity gaps.
- `packages/adapter-next/src/client-boundary-bloat.ts` — best implementation template for guard, thresholds, deterministic sorting, finding shape, and `AdapterMetricEvidence`.
- `packages/core/src/types.ts` — generic `AdapterMetricEvidence` already supports metric evidence; do not add Next-specific evidence or roles here.
- `packages/core/src/config/schema.ts` — do not add `next.routeCoupling` to core config unless a later adapter-config seam exists; core must remain framework-agnostic.
- `openspec/specs/next-adapter-enrichment/spec.md` — route roles and role index are source contracts to reuse.
- `docs/superpowers/plans/p6-adapter-next.md` — Slice 5 source of scope: App Router + Pages Router, render topology through route-role lens.

### Approaches

1. **Adapter-owned route metric analyzer** — Add `createRouteCouplingAnalyzer()` in `@rai/adapter-next`; guard for `app-router` and `pages-router`; inspect only `RouteSegment` IDs from enrichment; compute fan-in, fan-out, direct children, reachable nodes, and reachable depth from core `renders` edges; emit `AdapterMetricEvidence`.
   - Pros: preserves core agnosticism, reuses proven Slice 4 analyzer pattern, supports both route variants, keeps evidence metric-only.
   - Cons: metrics inherit core render-edge limitations; no import/call route coupling yet.
   - Effort: Medium

2. **Core render-coupling reuse wrapper** — Run or mirror `react/render-coupling` then filter findings to `RouteSegment` nodes.
   - Pros: less metric logic duplication.
   - Cons: core analyzer uses `AnalysisContext` and core `RaiConfig`, does not emit adapter roles/evidence, and would make adapter behavior depend on core rule details.
   - Effort: Medium

3. **Enrichment-first route graph** — Extend enrichment with route-specific edges and analyze those edges.
   - Pros: stronger route model later for layouts, nested segments, and monorepos.
   - Cons: bigger scope, likely exceeds Slice 5 intent, risks changing enrichment contracts and review size.
   - Effort: High

### Recommendation

Use Approach 1. Implement a new adapter-owned analyzer that mirrors the deterministic topology helpers from `client-boundary-bloat` / `render-coupling`, but scopes subjects to `enrichment.roleIndex.get("RouteSegment")`. Support `app-router` and `pages-router`; treat `mixed-router` as `variant-mismatch` until a mixed-route semantics spec exists. Keep thresholds adapter-local through factory/input options for now; defer user-facing `next.routeCoupling` config until Slice 6 or a dedicated adapter-config seam, because adding Next keys to `packages/core/src/config/schema.ts` violates the P6 guardrail.

### Risks

- Route files without JSX are not component nodes after the KI-1 fix, so non-UI handlers will not be route-coupling subjects; this is correct but must be tested/documented.
- Pages Router route metrics may be sparse because `_app`, `_document`, and `pages/api/**` are excluded by detection; tests should cover only real page route files.
- Current core `renders` edges resolve by first component name match, so duplicate names can skew topology; do not claim import-level or module-level coupling.
- `mixed-router` support is ambiguous. Running across both route trees without semantics could produce misleading findings; diagnostic skip is safer for this slice.
- The plan says “threshold config under `next.routeCoupling`”, but no adapter config seam exists yet. Core config must not learn Next-specific shape.

### Ready for Proposal

Yes. Proposal should scope Slice 5 to `@rai/adapter-next` only, define `next/route-coupling` metric evidence over `RouteSegment` subjects, require App Router + Pages Router support, require `mixed-router` variant mismatch, and explicitly defer adapter config plumbing beyond factory/input thresholds.
