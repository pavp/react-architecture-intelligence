# RAI — Build Status & Resume Guide

**Last updated:** 2026-05-30
**Branch:** `feat/rai-mvp-p0-p3` (not yet merged to `main`)
**State:** ✅ **P0–P3 MVP complete and green.**

---

## TL;DR

The MVP vertical slice is done, tested, builds, and runs end-to-end from the compiled CLI.

```
typecheck:  0 errors (strict: noUncheckedIndexedAccess + exactOptionalPropertyTypes)
tests:      101 passing / 23 files (Vitest)
build:      both packages compile; schema.sql copied to dist
CLI smoke:  rai analyze fixtures/duplication/buttons → { opportunity: 1, warn: 1 }
            rai mcp fixtures/duplication/buttons    → stdio handshake + 4 tools listed
```

The thesis is proven: a deterministic engine produces structured findings, persists them
append-only, and **a human rejection survives re-analysis and suppresses the finding next run**
(see `packages/core/src/engine/pipeline.test.ts` → "a recorded rejection suppresses…").

---

## What's built (P0–P3, all 24 plan tasks)

| Area | Files | What |
|------|-------|------|
| Scaffold | root, `packages/{core,cli}` | pnpm monorepo, TS ESM/NodeNext, Vitest |
| Types | `core/src/types.ts` | Span, Fingerprint, Finding, memory types |
| Config | `core/src/config/` | zod tier-2 schema + resolve (thresholds) |
| Parse | `core/src/parse/pass1.ts` | **oxc** structural Pass-1 (components/props/hooks/facts) |
| Graph | `core/src/graph/`, `parse/graph-build.ts` | RepoGraph (nodes + renders edges), content-hash |
| Fingerprint | `core/src/fingerprint/` | structural (5-component) / layered / reconcile table / drift |
| DB | `core/src/db/` | SQLite (T1–T5 + snapshot) + **better-sqlite3 + sqlite-vec** |
| Memory | `core/src/memory/` | T3 append-only findings · T4 feedback (anti-self-loop+phantom guard) · pure reducer · overlay · MemoryReader |
| Similarity | `core/src/similarity/` | deterministic feature-hash embedding + cosine clustering |
| Analyzers | `core/src/analyzers/` | contract + registry + **shared-extraction killer rule** (boolean-AND) |
| Engine | `core/src/engine/pipeline.ts` | `analyzeRepo`: graph→analyze→persist→overlay |
| Golden | `fixtures/`, `engine/golden.test.ts` | corpus + rebuild/determinism-replay |
| MCP | `core/src/mcp/` | Band-A tools session + stdio server |
| CLI | `cli/src/{index,cli}.ts` | `rai analyze [dir]` (prints §5.2 counts) / `rai mcp [dir]` (serves stdio); reuses core `readSources` |

## Verified invariants (P3 exit criteria)
- ✅ Findings/feedback are **append-only** (no UPDATE/DELETE on those tables anywhere)
- ✅ Pure logic has **no `Date.now`/`Math.random`** (analyzers, reducer, overlay, fingerprint) — `asOf` is the only time source
- ✅ `explain_finding` returns **evidence + groundingFields, no prose field** (LLM can't launder opinion in)
- ✅ **Zero framework coupling in `@rai/core`** (no next/tanstack/remix/expo imports) — adapter seam clean for P6

---

## How to run / verify

```bash
pnpm install            # IMPORTANT: wires workspace symlinks (@rai/core ← cli) + builds better-sqlite3
pnpm test               # 101 passing
pnpm typecheck          # clean
pnpm build              # both packages → dist/ (+ schema.sql copy)
node packages/cli/dist/index.js analyze fixtures/duplication/buttons   # → { opportunity: 1, warn: 1 }
node packages/cli/dist/index.js mcp    fixtures/duplication/buttons    # → MCP stdio server (Band-A tools)
```

### Environment gotchas (already solved, but know them)
1. **better-sqlite3 native build** — `package.json` has `pnpm.onlyBuiltDependencies: ["better-sqlite3"]`; a fresh `pnpm install` builds the native binding automatically. If a CI image skips build scripts, run `node node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/node_modules/.bin/prebuild-install -r node`.
2. **Workspace symlink** — if you see `Cannot find module '@rai/core'` from the CLI, run `pnpm install` (links `cli/node_modules/@rai/core → ../../core`), then `pnpm build` (core needs a `dist/`).
3. **Per-package test path** — `pnpm --filter @rai/core test src/<file>.test.ts` works because `packages/core/vitest.config.ts` exists.
4. **fixtures path** — golden fixtures are under `fixtures/duplication/` NOT `fixtures/shared/`. A `shared/` path is (correctly) skipped by the default excludeGlob `**/shared/**`.

---

## Two lessons baked into the code (don't regress)
- **oxc 0.30.x AST** ≠ ESTree: `parseSync(source,{sourceFilename})`, `program` is a JSON **string** (`JSON.parse`), params are `FormalParameters.items[].pattern`, object-pattern members are `BindingProperty`. Exported components are under `Export{Named,Default}Declaration.declaration` — pass1 unwraps these (a critical bug the original plan test missed).
- **Threshold calibration**: `minCosine` default is **0.75** (not the spec's 0.90) and `minPropOverlap` **0.40** — calibrated to the MVP feature-hash embedding (similar ≈0.81, unrelated ≈0.01). Documented in `config/schema.ts`. **Re-derive both when a learned embedding replaces the feature-hash one.**

---

## Known issues found in the field

### KI-1 — Non-component functions collapse to one empty fingerprint → false positive (HIGH)
**Found:** 2026-05-30, first real-repo run via MCP against `scaffold-nextjs-app/src` (477 files).

The MVP run produced **2 findings**. One is a true positive, one is a false positive:

| Finding | Verdict | Detail |
|---------|---------|--------|
| `common-grid` containers (cosine 0.82) | ✅ TRUE positive | `Bottom/Main/RightContainer` are byte-identical: `({children}: PropsWithChildren) => <Box className={container}>{children}</Box>`. Extract one base — correct call. |
| API route handlers (cosine 1.0, 9 fns / 4 files) | ❌ FALSE positive | `GET`/`POST`/`PUT`/`DELETE` Next route handlers flagged as duplicate components. Their bodies are completely different (a 1-line settings GET vs a 30-line todos GET with query parsing). |

**Root cause (reproduced, not guessed):** `pass1` treats any `^[A-Z]`-named function as a React component (`pass1.ts:10` `COMPONENT_NAME = /^[A-Z]/`, used at `:58`/`:63`). It does **not** require the function to return JSX. Next route handlers (`GET`, `POST`, …) are `(req) => Response` functions — capitalized, but with **0 props, 0 hooks, 0 JSX children, 0 markers, 0 conditionals**. The structural fingerprint (§2.3) hashes exactly those 5 empty sets, so every such function collapses to the **same** fingerprint:

```
front-end-settings GET → props=[] hooks=[] children=[] markers=[] cond=0 → fp=4b77a12c…
todos GET              → props=[] hooks=[] children=[] markers=[] cond=0 → fp=4b77a12c…  (identical)
todos POST             → props=[] hooks=[] children=[] markers=[] cond=0 → fp=4b77a12c…  (identical)
```

`shared-extraction` then groups N identical empty fingerprints into one bogus opportunity at cosine 1.0. `minFpCardinality` does **not** guard against this — it's consumed for the opportunity's own fingerprint (`shared-extraction.ts:51`), not as an "is this shape substantial enough to be signal" filter.

**Fix options (preferred = B):**
- **A. Cardinality floor in the analyzer** — drop clusters whose structural shape is empty (the 5 sets sum to 0 elements). Smallest change; lives in `shared-extraction`. Treats the symptom.
- **B. JSX-return guard in `pass1` (the real cure)** — a function that returns no JSX is not a React component, so `pass1` should not emit it as one. `collectRenderFacts` already visits `JSXOpeningElement` (for children); add a `returnsJsx` flag set on any `JSXElement`/`JSXFragment` visit and skip components where it's false. Removes the false node at the source; route handlers never enter the graph.
- **C. excludeGlob `**/route.{ts,tsx}` / `**/api/**`** — a config patch, not a fix. Hides Next handlers but leaves the underlying "capitalized non-component" gap for any other framework.

**Repro:** `node` against `dist/parse/pass1.js` + `dist/fingerprint/structural.js` over the two `todos`/`front-end-settings` route files → both yield `fp=4b77a12c…`. (Ad-hoc script; fold into a test fixture when fixing — TDD with these two handlers as the failing case.)

**Caveat on the design:** this is a structural-fingerprint blind spot, not a bug in the memory/MCP layers — those worked end-to-end on the real repo. The thesis holds; the *component detector* is too loose.

---

## Next steps (not started — separate plans)

These are explicitly **post-MVP** per the design's §7 phasing. Each should get its own
`docs/superpowers/plans/` doc via the writing-plans skill, then subagent-driven execution.

### P4 — Breadth + temporal (highest value next)
- **Fix KI-1 (component detector too loose)** — add a JSX-return guard to `pass1` so non-component capitalized functions (Next route handlers, plain factories) don't collapse to one empty fingerprint and emit false positives. See *Known issues → KI-1* above. Smallest credible first task of P4; has a real reproducing fixture (`scaffold-nextjs-app` route handlers).
- More analyzers: `coupling`, `hook-topology`, `over-abstraction`, `boundary-violation` (all pure, into the registry)
- `snapshot` table population + `get_drift` MCP tool (pure SQL set-algebra over snapshots — §3.5/§5)
- `query_architecture` MCP tool (enumerated graph questions, bounded-depth recursive CTEs)
- **Analyzer fault containment**: per-analyzer timeout + crash isolation (one analyzer panic ≠ run failure)
- Wire the deferred bits: `boundary_rule` → `architectural-conflict` finding type in shared-extraction; lazy ts-morph Pass-2 in `typeOf()` (currently returns null); config severity-clamp in overlay (currently identity)

### P5 — Codemod apply (dangerous — sequenced last, gated)
- `propose_refactor` (proposal-only) → `apply_refactor` with the §4.6 capability-token gate (current+active+opportunity finding) → DRY-RUN → TYPECHECK → TESTS → GIT-clean → commit + reversal patch. NO `--force`.
- Append-only codemod proof artifacts (patch + verification output + rollback patch + originating fingerprint)

### P6 — First framework adapter (prove the seam)
- `@rai/adapter-next`: detect + enrich (RSC/client/route tags, frozen-input append-only) + 2–3 Next analyzers + variant-guard diagnostics + nominal/positional-only fp extension
- CI lint: `grep framework-name packages/core == 0`
- **Adapter storage rule**: adapters may NOT introduce independent persistence — all truth stays core-owned

### Repo/release engineering (§9 of the design — not yet set up)
- Adopt storywright's setup: commitlint + husky + semantic-release + the 3 workflows (ci/pr-title/release) + PR template + CONTRIBUTING/RELEASING. Monorepo: per-package release (semantic-release-monorepo or changesets) lands with P6; locked single-version is fine through P5.
- No GitHub remote yet. `@rai/*` npm scope is a placeholder — swap to the real scope before first publish.

---

## Pointers
- **Design spec:** `docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md` (9 sections + 2 appendices; Appendix A = invariant index)
- **Implementation plan (P0–P3):** `docs/superpowers/plans/2026-05-29-rai-mvp-p0-p3.md` (24 tasks — all done)
- **To finish this branch:** tests pass → use `superpowers:finishing-a-development-branch` (merge to main / open PR / keep). There is no `main` remote yet, so "merge locally" or "keep as-is" are the realistic options.
