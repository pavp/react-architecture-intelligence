# next-route-coupling Specification

## Purpose

Define adapter-owned Next.js route coupling analysis over route-owned render topology while keeping `@rai/core` framework-agnostic and persistence core-owned.

## Requirements

### Requirement: Supported Router Analysis

The analyzer MUST run for App Router and Pages Router projects. It MUST evaluate only nodes tagged as `RouteSegment` by Next enrichment.

#### Scenario: App Router route analysis runs

- GIVEN an App Router project with `RouteSegment` entries in enrichment `roleIndex`
- WHEN the analyzer runs
- THEN it MUST evaluate those route segment nodes for route coupling

#### Scenario: Pages Router route analysis runs

- GIVEN a Pages Router project with `RouteSegment` entries in enrichment `roleIndex`
- WHEN the analyzer runs
- THEN it MUST evaluate those route segment nodes for route coupling

### Requirement: Route-Owned Render Scope

The analyzer MUST scope coupling to route-owned components by combining the `RouteSegment` role/index with render topology reachable from each route segment. It MUST use render topology metrics such as fan-in, fan-out, direct children, reachable nodes, and reachable depth.

#### Scenario: Route ownership comes from role index and topology

- GIVEN a route segment with reachable render descendants
- WHEN route coupling metrics are calculated
- THEN only topology owned by that route segment MUST contribute to its metrics
- AND unrelated component subgraphs MUST NOT contribute

### Requirement: Finding Contract

The analyzer MUST emit findings only for oversized or over-coupled routes. Findings MUST use adapter-owned rule id `next/route-coupling`, deterministic severity, route node identity, exceeded metrics, and thresholds.

#### Scenario: Over-coupled route emits finding

- GIVEN a route segment whose metrics exceed configured route coupling thresholds
- WHEN the analyzer runs
- THEN it MUST return a finding with rule id `next/route-coupling`
- AND severity MUST be deterministic for the same inputs

#### Scenario: Route below thresholds is silent

- GIVEN route segment metrics at or below route coupling thresholds
- WHEN the analyzer runs
- THEN it MUST return no `next/route-coupling` finding for that route

### Requirement: Unsupported Variant Diagnostics

The analyzer MUST treat mixed-router and non-Next projects as unsupported variants. Unsupported variants MUST return diagnostic skips, not findings.

#### Scenario: Mixed router emits diagnostic skip

- GIVEN a mixed App Router and Pages Router project
- WHEN the analyzer runs
- THEN it MUST return a diagnostic skip for unsupported variant
- AND it MUST return no `next/route-coupling` findings

#### Scenario: Non-Next project emits diagnostic skip

- GIVEN a project not detected as Next.js
- WHEN the analyzer runs
- THEN it MUST return a diagnostic skip for unsupported variant
- AND it MUST return no `next/route-coupling` findings

### Requirement: Metric Evidence Boundary

Finding evidence MUST be metric/topology-based. It MUST include route IDs, spans when available, role data, topology counts, exceeded thresholds, and referenced render edges. It MUST NOT claim import, module, call, or prop-flow coupling when only render edges were used.

#### Scenario: Evidence names render topology only

- GIVEN a finding produced from render edges
- WHEN evidence is inspected
- THEN evidence MUST identify render topology metrics and thresholds
- AND it MUST NOT describe import-level or module-level coupling

### Requirement: Pure Analyzer Boundary

The analyzer MUST be pure and MUST NOT write persistence, T3, T4, or T5 directly. It MUST return findings and diagnostics through the normal analyzer result path.

#### Scenario: Analyzer has no direct writes

- GIVEN route coupling findings or diagnostics
- WHEN the analyzer completes
- THEN all outputs MUST be present in its return value
- AND no persistence, T3, T4, or T5 writes MUST be performed by the analyzer

### Requirement: Framework-Agnostic Core

Route coupling behavior MUST remain in the Next adapter. `@rai/core` MUST NOT add Next.js concepts, route-coupling config, rule IDs, roles, or variant semantics for this capability.

#### Scenario: Core remains Next-free

- GIVEN route coupling analysis is added
- WHEN core package contracts are inspected
- THEN `@rai/core` MUST remain framework-agnostic
- AND Next-specific behavior MUST be adapter-owned
