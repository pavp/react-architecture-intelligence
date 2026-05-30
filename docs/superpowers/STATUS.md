# RAI — Build Status & Resume Guide

**Last updated:** 2026-05-30
**Branch:** `feat/rai-mvp-p0-p3` (not yet merged to `main`)
**State:** ✅ **P0–P3 MVP complete; P4 temporal, breadth, Band C graph tools, backfill, Pass-2, hook topology, conventions, and P5 codemod apply complete; CI/PR workflow active.**

---

## TL;DR

The MVP vertical slice is done, temporal drift is active, `rai backfill` can populate historical snapshots, `query_architecture` is available, Band C `get_node` / `raw_graph_query` are bounded read-only escape hatches, lazy Pass-2 is wired, hook topology is analyzed, convention violations are configurable, `propose_refactor` is proposal-only, `apply_refactor` is gated through the verification pipeline, codemod proof artifacts are append-only, and GitHub PRs run CI.

```
typecheck:  0 errors (strict: noUncheckedIndexedAccess + exactOptionalPropertyTypes)
tests:      200 passing / 30 files (Vitest)
build:      both packages compile; schema.sql copied to dist
CLI smoke:  rai analyze fixtures/duplication/buttons → { opportunity: 1, warn: 1 }
            rai mcp fixtures/duplication/buttons    → stdio handshake + 4 tools listed
github:     https://github.com/pavp/react-architecture-intelligence
ci:         .github/workflows/ci.yml runs pnpm build/test/typecheck on PRs
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
| Analyzers | `core/src/analyzers/` | contract + registry + `shared-extraction`, `render-coupling`, `over-abstraction`, `hook-topology`, `boundary-violation` |
| Engine | `core/src/engine/pipeline.ts` | `analyzeRepo`: graph→analyze→persist→overlay, with per-analyzer crash diagnostics |
| Golden | `fixtures/`, `engine/golden.test.ts` | corpus + rebuild/determinism-replay |
| MCP | `core/src/mcp/` | Band-A/B/C tools session + stdio server, including `get_drift`, `query_architecture`, `get_node`, and `raw_graph_query` |
| CLI | `cli/src/{index,cli}.ts` | `rai analyze [dir]`, `rai backfill [dir] --from <sha> --to <sha> --db <path>`, `rai mcp [dir]`; reuses core `readSources` |

## Verified invariants (P3 exit criteria)
- ✅ Findings/feedback are **append-only** (no UPDATE/DELETE on those tables anywhere)
- ✅ Pure logic has **no `Date.now`/`Math.random`** (analyzers, reducer, overlay, fingerprint) — `asOf` is the only time source
- ✅ `explain_finding` returns **evidence + groundingFields, no prose field** (LLM can't launder opinion in)
- ✅ **Zero framework coupling in `@rai/core`** (no next/tanstack/remix/expo imports) — adapter seam clean for P6

---

## How to run / verify

```bash
pnpm install            # IMPORTANT: wires workspace symlinks (@rai/core ← cli) + builds better-sqlite3
pnpm test               # 142 passing
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

### KI-1 — Non-component functions collapse to one empty fingerprint → false positive ✅ FIXED

**Found:** 2026-05-30, first real-repo run via MCP against `scaffold-nextjs-app/src` (477 files).
**Fixed:** 2026-05-30, change `fix-ki1-component-detector` on branch `feat/rai-mvp-p0-p3`.

The MVP run produced **2 findings**. One is a true positive, one was a false positive (now fixed):

| Finding | Verdict | Detail |
|---------|---------|--------|
| `common-grid` containers (cosine 0.82) | ✅ TRUE positive | `Bottom/Main/RightContainer` are byte-identical: `({children}: PropsWithChildren) => <Box className={container}>{children}</Box>`. Extract one base — correct call. |
| API route handlers (cosine 1.0, 9 fns / 4 files) | ✅ FIXED | `GET`/`POST`/`PUT`/`DELETE` Next route handlers no longer admitted as components. `returnsJsx` guard in `pass1` rejects them at the source. |

**Root cause (was):** `pass1` treated any `^[A-Z]`-named function as a React component without requiring JSX. Route handlers (`GET`, `POST`, …) are `(req) => Response` — capitalized with 0 props/hooks/JSX/markers/conditionals → identical empty fingerprint → bogus cosine-1.0 cluster.

**Fix applied (Option B — `returnsJsx` necessary condition):** Added `returnsJsx: boolean` to `RenderFacts`. The existing `JSXOpeningElement` visitor now sets `returnsJsx = true`. Guard `if (!facts.returnsJsx) return;` added inside `walkComponent` (the single admission chokepoint covering both `FunctionDeclaration` and `VariableDeclaration`/arrow/memo/forwardRef paths). Route handlers never enter the graph. forwardRef/memo wrappers are unaffected — the flat walk descends into their inner arrow and finds the JSX.

**Caveat on the design:** this is a structural-fingerprint blind spot, not a bug in the memory/MCP layers — those worked end-to-end on the real repo. The thesis holds; the *component detector* is now correctly gated.

---

## Next steps (post-MVP — separate plans)

These are explicitly **post-MVP** per the design's §7 phasing. Each should get its own
`docs/superpowers/plans/` doc via the writing-plans skill, then subagent-driven execution.

### P4 — Breadth + temporal (highest value next)
- ~~**Fix KI-1 (component detector too loose)**~~ — ✅ Done in `fix-ki1-component-detector`. JSX-return guard added to `pass1`; route handlers no longer admitted as components.
- ~~Wire `boundary_rule` → `architectural-conflict` in shared-extraction~~ — ✅ Done in `wire-deferred-mvp-gaps`.
- ~~Wire config severity clamp in overlay~~ — ✅ Done in `wire-deferred-mvp-gaps`.
- ~~Analyzer crash containment~~ — ✅ Done in `analyzer-fault-containment`; hard sync-CPU timeout remains out of scope until worker isolation exists.
- ~~Close-session feedback capture~~ — ✅ Done in `close-session-feedback`; only explicit human `decisions[]` write T4.
- ~~First analyzer slice: render coupling + over-abstraction~~ — ✅ Done in `more-analyzers-render-overabstraction`.
- ~~Formal P4 plan~~ — ✅ Done in `docs/superpowers/plans/p4-breadth-temporal.md`.
- ~~`snapshot` population + `get_drift`~~ — ✅ Done in `p4-snapshot-get-drift`.
- ~~`rai backfill` CLI~~ — ✅ Done; dirty guard, inclusive commit range, per-commit report, already-snapshotted skip, and branch/HEAD restore.
- ~~`query_architecture` MCP tool~~ — ✅ Done; bounded questions over latest analyzed `RepoGraph`.
- ~~Band C MCP tools~~ — ✅ Done; `get_node` and allowlisted `raw_graph_query` over latest analyzed `RepoGraph`.
- ~~Lazy ts-morph Pass-2~~ — ✅ Done; `ctx.types.typeOf(span)` returns stable `TypeInfo` lazily.
- ~~`react/hook-topology` analyzer + `uses-hook` edges~~ — ✅ Done; metric-only hook fan-in/fan-out/depth.
- ~~`react/boundary-violation` / conventions~~ — ✅ Done; config forbids `renders` / `uses-hook` edges.
- **Still next:** deferred edge work (`passes`, import/call analyzers) only when needed, or P6 variant-guard planning.

### P5 — Codemod apply (dangerous — sequenced last, gated)
- ✅ Formal P5 plan exists: [`docs/superpowers/plans/p5-codemod-apply.md`](plans/p5-codemod-apply.md).
- ✅ Slice 1 complete: shared-extraction evidence now carries `exportKind`, and a pure no-write proposal builder classifies export/span/variance/source-file risk.
- ✅ Slice 2 complete: `propose_refactor` MCP tool returns deterministic proposal-only output for current active findings and refuses unknown/suppressed/conflict/unsupported findings.
- ✅ Slice 3 complete: `mayExecuteCodemod` binds only current active opportunity findings and refuses absent, stale, suppressed, and conflict/non-opportunity findings.
- ✅ Slice 4 complete: `previewSharedExtractionPatch` re-runs Pass 1, refuses stale spans/unsafe variance, and returns deterministic in-memory patch + rollback preview without workspace writes.
- ✅ Slice 5a complete: `runApplyRefactorPipeline` proves dirty guard, typecheck/test/git-clean order, rollback on failure, and commit after verification via an injected workspace adapter.
- ✅ Slice 5b1 complete: `createGitWorkspace` implements dirty detection, `git apply`, configured verification commands, touched-file clean check, rollback, and commit in isolated temp-repo tests.
- ✅ Slice 5b1.5 complete: dry-run output now emits valid `diff --git` patch and rollback patch accepted by `git apply`.
- ✅ Slice 5b2 complete: `apply_refactor` MCP tool runs capability gate → dry-run → verification pipeline → git workspace adapter.
- ✅ Slice 6 complete: `codemod_proof` stores append-only patch, verification output, rollback patch, fingerprint, status, commit SHA, and timestamp.
- `propose_refactor` (proposal-only) → `apply_refactor` with the §4.6 capability-token gate (current+active+opportunity finding) → DRY-RUN → TYPECHECK → TESTS → GIT-clean → commit + reversal patch. NO `--force`.
- Append-only codemod proof artifacts (patch + verification output + rollback patch + originating fingerprint)
- **P5 complete. Next:** Start P6 Slice 1: `@rai/adapter-next` scaffold + detection.

### P6 — First framework adapter (prove the seam)
- ✅ Formal P6 plan exists: [`docs/superpowers/plans/p6-adapter-next.md`](plans/p6-adapter-next.md).
- ✅ Variant guard design resolved: `app-router`, `pages-router`, `mixed-router`, and structured `variant-mismatch` diagnostics.
- ✅ Slice 1 complete: `@rai/adapter-next` package scaffold + deterministic Next variant detection + core framework-free lint guard.
- ✅ Slice 2 complete: `guardNextVariant` emits structured `variant-mismatch` diagnostics without running unsupported analyzers.
- `@rai/adapter-next`: detect + enrich (RSC/client/route tags, frozen-input append-only) + 2–3 Next analyzers + variant-guard diagnostics + nominal/positional-only fp extension
- CI lint: `grep framework-name packages/core == 0`
- **Adapter storage rule**: adapters may NOT introduce independent persistence — all truth stays core-owned

### Repo/release engineering (§9 of the design — not yet set up)
- ✅ GitHub remote exists under `pavp/react-architecture-intelligence`.
- ✅ CI workflow exists for PR build/test/typecheck.
- ✅ PR template exists.
- Still missing: commitlint, husky, PR-title validation, release workflow, CONTRIBUTING, RELEASING, and publishing strategy. Monorepo release tooling can wait until P6; locked single-version remains fine through P5.

---

## Pointers
- **Design spec:** `docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md` (9 sections + 2 appendices; Appendix A = invariant index)
- **Implementation plan (P0–P3):** `docs/superpowers/plans/2026-05-29-rai-mvp-p0-p3.md` (24 tasks — all done)
- **To finish this branch:** tests pass → use `superpowers:finishing-a-development-branch` (merge to main / open PR / keep). There is no `main` remote yet, so "merge locally" or "keep as-is" are the realistic options.
