# Next Adapter Enrichment Specification

## Purpose

Define adapter-owned Next.js enrichment over frozen core graphs. Enrichment SHALL add Next role tags, role indexes, and framework-only edges without changing `RepoGraph`, `@rai/core`, or structural fingerprints.

## Requirements

### Requirement: App Router Role Tags

The system MUST tag detected App Router route/page files as `RouteSegment` and layout files as `Layout` in enrichment output.

#### Scenario: App route receives route segment role

- GIVEN Next detection identifies `app/dashboard/page.tsx` or route file as App Router
- WHEN enrichment runs
- THEN enrichment roles MUST include `RouteSegment` for its node

#### Scenario: App layout receives layout role

- GIVEN Next detection identifies `app/dashboard/layout.tsx` as App Router layout
- WHEN enrichment runs
- THEN enrichment roles MUST include `Layout` for its node

### Requirement: App Router Component Execution Roles

The system MUST tag App Router files as `ClientComponent` when a top-level `use client` directive exists; otherwise it MUST tag them as `ServerComponent`. When a top-level `use server` directive exists, the system MUST also tag the file as `ServerAction`.

#### Scenario: Client directive marks client component

- GIVEN an App Router file starts with top-level `use client`
- WHEN enrichment runs
- THEN enrichment roles MUST include `ClientComponent`
- AND MUST NOT include `ServerComponent` for that node

#### Scenario: Missing client directive marks server component

- GIVEN an App Router file has no top-level `use client` directive
- WHEN enrichment runs
- THEN enrichment roles MUST include `ServerComponent`

#### Scenario: Server directive marks server action

- GIVEN an App Router file has a top-level `use server` directive
- WHEN enrichment runs
- THEN enrichment roles MUST include `ServerAction`

### Requirement: Pages Router Route Tags

The system MUST tag detected Pages Router route files as `RouteSegment` only. Pages Router role tagging MUST NOT infer `Layout`, `ClientComponent`, `ServerComponent`, or `ServerAction` roles.

#### Scenario: Pages route receives route-only role

- GIVEN Next detection identifies `pages/account.tsx` as a Pages Router route
- WHEN enrichment runs
- THEN enrichment roles MUST include `RouteSegment`
- AND MUST NOT include App Router-only roles for that node

### Requirement: Role Indexes

The enrichment output MUST expose deterministic `roleIndex` entries for route, layout, client, server, and server-action roles. Each entry MUST contain matching node IDs in stable order.

#### Scenario: Role index contains all role groups

- GIVEN enrichment assigns route, layout, client, server, and server-action roles
- WHEN caller reads `roleIndex`
- THEN each role key MUST contain only node IDs for nodes tagged with that role
- AND node ID order MUST be deterministic

### Requirement: Enrichment-Only Layout Edges

The system MAY emit Next-specific edges that describe layout wrapping route segments, but these edges MUST live only in enrichment output and MUST NOT be inserted into core `RepoGraph` edges.

#### Scenario: Layout wrapping edge stays outside core graph

- GIVEN an App Router layout wraps a route segment
- WHEN enrichment runs
- THEN enrichment output MAY include a layout-to-route wrapping edge
- AND the input `RepoGraph.edges` MUST remain unchanged

### Requirement: Core Graph Immutability

The enrichment process MUST NOT mutate frozen core graph input, core nodes, core edges, or structural fingerprints. Enrichment MUST be deterministic and adapter-owned.

#### Scenario: Frozen graph remains unchanged

- GIVEN a frozen `RepoGraph` and captured structural fingerprints
- WHEN enrichment runs
- THEN the original graph MUST remain deeply equal to its pre-enrichment value
- AND structural fingerprints MUST remain unchanged
