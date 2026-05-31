# Tasks: P10 React Pattern Intelligence Foundation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520-700 |
| Review budget lines | 800 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; commit by work unit |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core generic facts + React catalog scaffold | PR 1 | Keep tests with each RED/GREEN slice; monitor diff under 800 lines |

## Phase 1: RED — Core Fact Contracts

- [x] 1.1 Add failing table tests in `packages/core/src/parse/pass1.test.ts` for import, export, call, JSX, hook-like call, member assignment, and file-role seed facts.
- [x] 1.2 Add failing boundary assertions in `packages/core/src/parse/pass1.test.ts` that core fact contracts and outputs contain no React catalog names, pattern labels, or intent claims.
- [x] 1.3 Add failing graph tests in `packages/core/src/parse/graph-build.test.ts` for sorted, deduped, JSON-safe, frozen `patternFacts` on `RepoGraph`.

## Phase 2: GREEN — Core Fact Extraction

- [x] 2.1 Add framework-neutral `PatternFact` types in `packages/core/src/types.ts` with `id`, `kind`, `file`, `span`, and stable string fields only.
- [x] 2.2 Implement minimal extraction in `packages/core/src/parse/pass1.ts`; preserve observed syntax only for aliases, namespace imports, re-exports, calls, JSX parent/child tags, hook-like names, and member assignments.
- [x] 2.3 Carry facts through `packages/core/src/parse/graph-build.ts` and `packages/core/src/graph/repograph.ts`; sort, dedupe, freeze, and expose via graph.
- [x] 2.4 Export needed fact contracts from `packages/core/src/index.ts`; run `/opt/homebrew/bin/pnpm test` and keep only P10 RED failures turning GREEN.

## Phase 3: RED/GREEN — React Catalog Scaffold

- [x] 3.1 Add failing tests in `packages/adapter-react/src/catalog.test.ts` proving catalog imports only `@rai/core` contracts, references generic fact kinds, and emits no findings or writes.
- [x] 3.2 Create `packages/adapter-react/package.json`, `tsconfig.json`, and `src/catalog.ts` with compound primitive catalog scaffolding outside `packages/core`.
- [x] 3.3 Add `fixtures/react/compound-primitives/*` Modal/Popover examples covering static members, namespace imports, dot-member JSX, children, aliases, and re-exports.

## Phase 4: REFACTOR / Verification

- [x] 4.1 Refactor fact helpers for deterministic IDs, spans, sorting, and dedupe without adding semantic or React-specific inference.
- [x] 4.2 Run `/opt/homebrew/bin/pnpm test`, then `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; update task checkboxes with results.
- [x] 4.3 If changed lines exceed 800 or single PR becomes unsafe, stop before apply completion and request size/chain decision.
