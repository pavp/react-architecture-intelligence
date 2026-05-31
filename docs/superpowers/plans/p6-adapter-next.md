# P6 — Next.js Adapter — Implementation Plan

**Status:** Complete — Slice 6 complete
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

### Slice 2 — Variant guard diagnostics ✅ DONE

**Goal:** prevent analyzers from silently running on unsupported Next variants.

**Tasks:**

- [x] Extend adapter execution with `supportedVariants` metadata outside core analyzer branching.
- [x] Emit `variant-mismatch` diagnostics when detected variant is unsupported.
- [x] Ensure mismatch creates no finding, feedback, weight, snapshot, or proof rows.
- [x] Add tests for app-only analyzer on pages-router and mixed-router.

**Exit criteria:**

- [x] Unsupported variant produces exact diagnostic shape.
- [x] Silent fallback is impossible.
- [x] Diagnostics remain separate from findings and memory.
- [x] build/test/typecheck clean.

---

### Slice 3 — Next enrichment over frozen graph ✅ DONE

**Goal:** tag core graph nodes with Next roles without mutating core graph structures.

**Tasks:**

- [x] Implement enrichment tags: `RouteSegment`, `Layout`, `ClientComponent`, `ServerComponent`, `ServerAction`.
- [x] Build role index for route segments and layouts.
- [x] Add framework edges only in enrichment output, not in core `RepoGraph`.
- [x] Prove frozen input graph cannot be mutated by enrichment.

**Exit criteria:**

- [x] App-router fixtures get route/layout/client/server tags.
- [x] Pages-router fixtures get route tags.
- [x] Core graph nodes and structural fingerprints remain unchanged.
- [x] build/test/typecheck clean.

---

### Slice 4 — `next/client-boundary-bloat` ✅ DONE

**Goal:** ship first Next-specific analyzer over enrichment.

**Tasks:**

- [x] Add analyzer using `ClientComponent` tags and render fan-out/depth signals.
- [x] Support app-router only.
- [x] Emit metric-only evidence with spans and counts; no prose.
- [x] Add adapter-local thresholds through `createClientBoundaryBloatAnalyzer({ thresholds })`.

**Exit criteria:**

- [x] Analyzer fires on an oversized client boundary fixture.
- [x] Analyzer is silent below thresholds.
- [x] Pages-router produces variant-mismatch diagnostic.
- [x] build/test/typecheck clean.

---

### Slice 5 — `next/route-coupling` ✅ DONE

**Goal:** prove framework lenses can compose core topology.

**Tasks:**

- [x] Add analyzer using route role index plus existing render edges.
- [x] Support app-router and pages-router.
- [x] Emit metric-only evidence for route fan-in/fan-out/depth.
- [x] Keep adapter-local thresholds through `createRouteCouplingAnalyzer({ thresholds })` until CLI adapter config wiring exists.

**Exit criteria:**

- [x] Analyzer fires on route coupling fixture.
- [x] Plain React repo has no Next analyzer findings; unsupported non-Next input returns a diagnostic skip.
- [x] build/test/typecheck clean.

---

### Slice 6 — CLI adapter loading + docs ✅ DONE

**Goal:** make CLI analysis load installed adapters without core knowing about them.

**Tasks:**

- [x] Update CLI composition to detect and register `@rai/adapter-next` when present.
- [x] Preserve MCP tool contracts; adapter findings flow through existing `analyze_repo` result shape.
- [x] Update `docs/superpowers/STATUS.md`, `docs/gaps.md`, and relevant OpenSpec docs.

**Exit criteria:**

- [x] `rai analyze` on a Next fixture returns Next analyzer counts/diagnostics.
- [x] Core framework-free guard stays green.
- [x] build/test/typecheck clean; specs synced.

---

## P6 overall exit criteria

- [x] `@rai/adapter-next` detects app-router, pages-router, mixed-router, and non-Next repos.
- [x] Variant mismatch diagnostic is loud, structured, and separate from findings.
- [x] Next analyzers fire on Next subtrees, not plain React.
- [x] Same shared component keeps the same structural fingerprint through plain React and Next lenses.
- [x] Adapters introduce no independent persistence.
- [x] `packages/core` contains no Next-specific imports, strings, path conventions, or branching.
- [x] build/test/typecheck clean; specs synced; each PR ≤400 lines or chained.
