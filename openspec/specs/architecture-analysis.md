# Capability Spec: Architecture Analysis

**Status**: Active (RFC 2119)  
**Origin**: changes `wire-deferred-mvp-gaps`, `more-analyzers-render-overabstraction`, `wire-hook-topology`, `wire-boundary-violation-conventions` (2026-05-30)
**Scope**: config-driven boundary conflict classification, render/structure analyzers, hook topology, and convention-based boundary violations.

## Purpose

Define durable contracts for deterministic architecture analyzers. Boundary classification, topology findings, and convention violations are CODE-derived from CONFIG data and MUST preserve append-only finding semantics.

## Boundary Rules Contract

`AnalysisContext` MUST expose a `boundaryRules` field containing an array of boundary rules:

```ts
interface BoundaryRule {
  from: string;
  to: string;
  kind?: string;
  reason: string;
}
```

The top-level config MUST support an optional `boundaries` array using the same shape. The pipeline MUST populate `ctx.boundaryRules` from config boundaries in the same order. If config omits boundaries, `ctx.boundaryRules` MUST be an empty array.

The `boundary_rule` database table remains read-only for this capability. This capability MUST NOT write boundary rules to the database.

## Boundary Crossing Classification

`sharedExtraction` MUST classify a qualifying shared component cluster as `architectural-conflict` when any component file pair in the cluster crosses a configured boundary:

- one file matches `rule.from`
- another file matches `rule.to`
- matching uses the analyzer's existing glob matcher

When a crossing is detected, the emitted finding MUST include `evidence.conflict` with the matched rule identity and human reason.

When no crossing is detected, or no boundary rules are configured, the emitted finding MUST remain `opportunity` and `evidence.conflict` MUST be absent.

## Requirement: Current-Data Render Coupling Findings

The system MUST emit `react/render-coupling` findings only from current render topology data: existing `renders` edges and `ComponentNode` identities. Findings MUST cover configured threshold breaches for fan-in, fan-out, direct children, and reachable render depth. Evidence MUST be metric-only and MUST NOT claim import, module, ownership, or boundary coupling.

### Scenario: Render topology threshold breach emits finding

- GIVEN current graph data has a component above a fan-in, fan-out, direct-children, or reachable-depth threshold
- WHEN architecture analysis runs
- THEN a deterministic `react/render-coupling` finding MUST be emitted
- AND evidence MUST contain only the breached render topology metrics

### Scenario: Render topology below threshold emits none

- GIVEN all render topology metrics are below configured thresholds
- WHEN architecture analysis runs
- THEN `react/render-coupling` MUST emit no finding

## Requirement: Current-Data Over-Abstraction Findings

The system MUST emit `react/over-abstraction` findings only from current `ComponentNode` structural counts: prop count, hook count, child component count, composition marker count, and conditional branch count. Evidence MUST be metric-only. Components below all thresholds MUST NOT emit findings.

### Scenario: Structural threshold breach emits finding

- GIVEN a component exceeds one or more structural thresholds
- WHEN architecture analysis runs
- THEN a deterministic `react/over-abstraction` finding MUST be emitted
- AND evidence MUST contain only structural count metrics

### Scenario: Structural counts below thresholds emit none

- GIVEN a component stays below prop, hook, child, composition marker, and branch thresholds
- WHEN architecture analysis runs
- THEN `react/over-abstraction` MUST emit no finding

## Requirement: Hook Graph Construction

Pass-1 MUST extract custom hook declarations named `use[A-Z0-9]...` as `HookNode` rows. The graph builder MUST construct `uses-hook` edges for:

- component consumers: `Component -> Hook` when a component calls a known custom hook
- hook composition: `Hook -> Hook` when a custom hook calls another known custom hook

Name-only resolution is allowed in this capability version. Calls to unknown hooks or built-in hooks with no `HookNode` MUST NOT create edges.

### Scenario: Hook composition creates uses-hook edges

- GIVEN `useCheckout` calls `useCart` and `usePrice`
- WHEN graph construction runs
- THEN the graph MUST include `Hook -> Hook` `uses-hook` edges from `useCheckout` to those known hooks

### Scenario: Component hook consumer creates uses-hook edge

- GIVEN `Page` calls known hook `useCheckout`
- WHEN graph construction runs
- THEN the graph MUST include `Component -> Hook` `uses-hook` edge from `Page` to `useCheckout`

## Requirement: Current-Data Hook Topology Findings

The system MUST emit `react/hook-topology` findings only from current hook graph data: `HookNode` identities and `uses-hook` edges where both source and destination are hooks. Findings MUST cover configured threshold breaches for hook fan-in, fan-out, direct dependencies, and reachable hook depth. Evidence MUST be metric-only and MUST NOT claim convention, ownership, boundary, import, or runtime coupling.

### Scenario: Hook topology threshold breach emits finding

- GIVEN current hook graph data has a hook above a fan-in, fan-out, direct-dependency, or reachable-depth threshold
- WHEN architecture analysis runs
- THEN a deterministic `react/hook-topology` finding MUST be emitted
- AND evidence MUST contain only breached hook topology metrics

### Scenario: Component-to-hook consumers do not inflate hook-to-hook fan-in

- GIVEN a component calls a hook
- WHEN `react/hook-topology` computes hook-to-hook fan-in
- THEN the component consumer edge MUST NOT count as hook fan-in

### Scenario: Hook topology below threshold emits none

- GIVEN all hook topology metrics are below configured thresholds
- WHEN architecture analysis runs
- THEN `react/hook-topology` MUST emit no finding

## Requirement: Convention-Based Boundary Violation Findings

The config MUST support `conventions[]` entries that forbid currently constructed graph edges. This capability version supports only `edgeKind: "renders"` and `edgeKind: "uses-hook"`. Unsupported edge kinds such as `imports`, `calls`, and `passes` MUST be rejected by config validation until those edges are constructed.

Each convention MUST include stable `id`, `edgeKind`, `from` selector, `to` selector, `reason`, optional `severity`, and `policy: "forbid"`. Selectors MAY match node `kind`, `name`, `file`, and `exportKind`; `name` and `file` selectors use the existing minimal glob semantics.

`react/boundary-violation` MUST emit `architectural-conflict` findings for forbidden matching edges. Evidence MUST identify the convention and the exact graph edge. Findings MUST NOT claim prop-flow, import, runtime call, or unstored ownership facts.

### Scenario: Forbidden render edge emits conflict

- GIVEN a convention forbids `renders` edges from `features/**` components to `ui/**` components
- WHEN the current graph contains such an edge
- THEN `react/boundary-violation` MUST emit an `architectural-conflict`
- AND evidence MUST include convention id, reason, edge kind, source node, and destination node

### Scenario: Forbidden hook edge emits conflict

- GIVEN a convention forbids `uses-hook` edges from `useCheckout` to `useCart`
- WHEN the current graph contains that hook edge
- THEN `react/boundary-violation` MUST emit an `architectural-conflict`

### Scenario: Unsupported edge kinds are rejected

- GIVEN config declares a convention for an edge kind that is not constructed
- WHEN config resolution runs
- THEN validation MUST fail rather than silently creating a no-op convention

## Requirement: Analyzer Scope Invariants

The render and over-abstraction analyzers MUST NOT introduce hook-topology naming, parser enrichment, ts-morph or type-aware logic, or import coupling claims. `react/hook-topology` MUST remain metric-only. `react/boundary-violation` MUST only evaluate configured conventions over existing graph edges.

### Scenario: Out-of-scope data remains unused

- GIVEN current analysis has render, component structure, and hook graph facts
- WHEN these analyzers run
- THEN render findings MUST depend only on render edges and `ComponentNode` identities
- AND over-abstraction findings MUST depend only on `ComponentNode` structural facts
- AND hook-topology findings MUST depend only on hook graph facts
- AND boundary-violation findings MUST depend only on configured conventions and existing graph edges
- AND rule names and evidence MUST NOT imply out-of-scope capabilities

## Integrity Invariants

- Finding type is derived from CODE plus CONFIG data.
- Finding type is not LLM-writable.
- Boundary data is version-controlled CONFIG tier for this capability.
- Persisted findings remain append-only.

## Scenarios Covered

| Scenario | Expected result |
|----------|-----------------|
| Config has boundaries | `ctx.boundaryRules` contains same elements in same order |
| Config has no boundaries | `ctx.boundaryRules` is `[]` |
| Shared cluster crosses boundary | finding type is `architectural-conflict`; `evidence.conflict` exists |
| Shared cluster does not cross boundary | finding type is `opportunity`; `evidence.conflict` is absent |
| No boundaries configured | finding type remains `opportunity` |
| Hook composes another known hook | `uses-hook` edge exists |
| Hook topology exceeds threshold | metric-only `react/hook-topology` finding exists |
| Configured convention forbids existing edge | `react/boundary-violation` architectural conflict exists |

## References

- Implementation: `packages/core/src/analyzers/analyzer.ts`, `packages/core/src/engine/pipeline.ts`, `packages/core/src/analyzers/shared-extraction.ts`, `packages/core/src/analyzers/hook-topology.ts`, `packages/core/src/analyzers/boundary-violation.ts`, `packages/core/src/parse/pass1.ts`, `packages/core/src/parse/graph-build.ts`
- Tests: `packages/core/src/analyzers/shared-extraction.test.ts`, `packages/core/src/analyzers/hook-topology.test.ts`, `packages/core/src/analyzers/boundary-violation.test.ts`, `packages/core/src/parse/pass1.test.ts`, `packages/core/src/parse/graph-build.test.ts`, `packages/core/src/engine/pipeline.test.ts`
- Source changes: `wire-deferred-mvp-gaps`, `more-analyzers-render-overabstraction`, `wire-hook-topology`, `wire-boundary-violation-conventions`
