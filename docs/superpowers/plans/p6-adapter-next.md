# P6 — Next.js Adapter — Implementation Plan

**Status:** In progress — Slice 1 complete
**Branch base:** `feat/rai-mvp-p0-p3`
**Created:** 2026-05-31
**Design source:** [`docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md`](../specs/2026-05-29-react-architecture-intelligence-mcp-design.md) §6, §7.2
**Gaps source:** [`docs/gaps.md`](../../gaps.md) §2.3, §3.4

P6 proves the adapter seam with one framework: Next.js. The adapter must add framework knowledge through registration and enrichment while keeping `@rai/core` framework-agnostic.

---

## Scope summary

P6 delivers four capabilities:

1. **Adapter package** — `@rai/adapter-next` depends on core; core never imports Next-specific code.
2. **Detection + variant guard** — detect Next roots and app/pages router variants, then loudly skip unsupported analyzer/variant combinations.
3. **Enrichment** — append-only tags/edges/role index over frozen `RepoGraph` for route segments, layouts, client components, and server actions.
4. **Next analyzers** — 2-3 pure analyzers proving framework value without adapter-owned persistence.

Out of scope: multiple adapters at once, adapter conflict override UI, framework codemods, independent adapter databases, and cross-boundary analyzers unless explicitly opted in later.

---

## Architecture guardrails

- `@rai/core` stays framework-agnostic. CI must reject Next strings in `packages/core`.
- Adapters depend on core; core never imports adapters.
- Enrichment is additive metadata. Adapters must not mutate core graph nodes or structural fingerprints.
- Adapter analyzers are pure synchronous analyzers over a pre-filtered adapter view.
- Adapter findings, feedback, snapshots, and codemod proof artifacts use core-owned persistence only.
- Structural fingerprint remains core-owned. Next may refine only nominal/positional layers.
- Variant mismatch is a diagnostic, not silent fallback and not a finding.

---

## Decisions resolved before implementation

### D1 — Next variant model

Variant enum:

```ts
type NextVariant = "app-router" | "pages-router" | "mixed-router";
```

Detection rules:

- `app-router`: `app/` exists with at least one `page.{js,jsx,ts,tsx}` or `layout.{js,jsx,ts,tsx}`.
- `pages-router`: `pages/` exists with at least one route file, excluding `pages/api/**` from React route classification.
- `mixed-router`: both app-router and pages-router signals exist under the same claimed root.

`mixed-router` is explicit, not guessed. An analyzer may support it only if designed for both trees; otherwise it emits variant mismatch.

### D2 — Adapter root ownership

P6 starts with one claimed root: the repo root when Next is detected through `package.json` dependency (`next`) or `next.config.*`. Monorepo path-scoped ownership is designed but not implemented in the first slice.

Future monorepo behavior: each detected package root gets its own adapter context. Shared `packages/ui` remains core-only unless an analyzer opts into `crossBoundary`.

### D3 — Variant mismatch diagnostic shape

Variant mismatch is analysis metadata, not a finding:

```ts
{
  kind: "variant-mismatch",
  adapterId: "next",
  analyzerId: "next/client-boundary-bloat",
  detectedVariant: "pages-router",
  supportedVariants: ["app-router"],
  rootDir: ".",
  message: "next/client-boundary-bloat supports app-router, detected pages-router"
}
```

It must be returned with analysis diagnostics and never write T3/T4/T5.

### D4 — First analyzer set

Ship two analyzers first:

- `next/client-boundary-bloat` — app-router only; warns when a high fan-out subtree is under a client component boundary.
- `next/route-coupling` — app-router and pages-router; reuses core render topology through a route-role lens.

`next/server-action-in-loop` stays a later slice because it needs deeper statement-pattern detection.

---

## Slices

Each slice is a reviewable work unit. If a slice approaches 400 changed lines, split it into a chained PR.

### Slice 1 — Adapter package scaffold + detection ✅ DONE

**Goal:** add `@rai/adapter-next` with pure detection and no core imports from adapter.

**Tasks:**

- [x] Add `packages/adapter-next` package, TS config, tests, and package export.
- [x] Implement `detectNext(rootDir)` over `package.json`, `next.config.*`, `app/`, and `pages/` signals.
- [x] Return `{ adapterId: "next", rootDir, variant, signals }` or `null`.
- [x] Add tests for app-router, pages-router, mixed-router, and non-Next repo.
- [x] Add CI/test guard that `packages/core` contains no Next framework imports or path conventions.

**Exit criteria:**

- [x] Next variants are detected deterministically.
- [x] Non-Next repos return `null`.
- [x] Core remains free of Next-specific code.
- [x] build/test/typecheck clean.

---

### Slice 2 — Variant guard diagnostics

**Goal:** prevent analyzers from silently running on unsupported Next variants.

**Tasks:**

- [ ] Extend analyzer registration or adapter execution with `supportedVariants` metadata outside core analyzer branching.
- [ ] Emit `variant-mismatch` diagnostics when detected variant is unsupported.
- [ ] Ensure mismatch creates no finding, feedback, weight, snapshot, or proof rows.
- [ ] Add tests for app-only analyzer on pages-router and mixed-router.

**Exit criteria:**

- [ ] Unsupported variant produces exact diagnostic shape.
- [ ] Silent fallback is impossible.
- [ ] Diagnostics remain separate from findings and memory.
- [ ] build/test/typecheck clean.

---

### Slice 3 — Next enrichment over frozen graph

**Goal:** tag core graph nodes with Next roles without mutating core graph structures.

**Tasks:**

- [ ] Implement enrichment tags: `RouteSegment`, `Layout`, `ClientComponent`, `ServerComponent`, `ServerAction`.
- [ ] Build role index for route segments and layouts.
- [ ] Add framework edges only in enrichment output, not in core `RepoGraph`.
- [ ] Prove frozen input graph cannot be mutated by enrichment.

**Exit criteria:**

- [ ] App-router fixtures get route/layout/client/server tags.
- [ ] Pages-router fixtures get route tags.
- [ ] Core graph nodes and structural fingerprints remain unchanged.
- [ ] build/test/typecheck clean.

---

### Slice 4 — `next/client-boundary-bloat`

**Goal:** ship first Next-specific analyzer over enrichment.

**Tasks:**

- [ ] Add analyzer using `ClientComponent` tags and render fan-out/depth signals.
- [ ] Support app-router only.
- [ ] Emit metric-only evidence with spans and counts; no prose.
- [ ] Add threshold config under `next.clientBoundaryBloat`.

**Exit criteria:**

- [ ] Analyzer fires on an oversized client boundary fixture.
- [ ] Analyzer is silent below thresholds.
- [ ] Pages-router produces variant-mismatch diagnostic.
- [ ] build/test/typecheck clean.

---

### Slice 5 — `next/route-coupling`

**Goal:** prove framework lenses can compose core topology.

**Tasks:**

- [ ] Add analyzer using route role index plus existing render edges.
- [ ] Support app-router and pages-router.
- [ ] Emit metric-only evidence for route fan-in/fan-out/depth.
- [ ] Add threshold config under `next.routeCoupling`.

**Exit criteria:**

- [ ] Analyzer fires on route coupling fixture.
- [ ] Plain React repo has no Next analyzer findings.
- [ ] build/test/typecheck clean.

---

### Slice 6 — CLI adapter loading + docs

**Goal:** make CLI analysis load installed adapters without core knowing about them.

**Tasks:**

- [ ] Update CLI composition to detect and register `@rai/adapter-next` when present.
- [ ] Preserve MCP tool contracts; adapter findings flow through existing `analyze_repo` result shape.
- [ ] Update `docs/superpowers/STATUS.md`, `docs/gaps.md`, and relevant OpenSpec docs.

**Exit criteria:**

- [ ] `rai analyze` on a Next fixture returns Next analyzer counts/diagnostics.
- [ ] `grep framework-name packages/core == 0` stays green.
- [ ] build/test/typecheck clean; specs synced.

---

## P6 overall exit criteria

- [ ] `@rai/adapter-next` detects app-router, pages-router, mixed-router, and non-Next repos.
- [ ] Variant mismatch diagnostic is loud, structured, and separate from findings.
- [ ] Next analyzers fire on Next subtrees, not plain React.
- [ ] Same shared component keeps the same structural fingerprint through plain React and Next lenses.
- [ ] Adapters introduce no independent persistence.
- [ ] `packages/core` contains no Next-specific imports, strings, path conventions, or branching.
- [ ] build/test/typecheck clean; specs synced; each PR ≤400 lines or chained.
