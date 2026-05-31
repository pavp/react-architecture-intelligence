# Tasks: P9 Explainability

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520-720 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR with work-unit commits |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Active review budget: 800 changed lines. Forecast stays under budget; no size exception required.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core explanation helpers | PR 1 | Tests first; exports included. |
| 2 | MCP + CLI explanation UX | PR 1 | Tests with behavior changes. |
| 3 | README onboarding | PR 1 | Keep quick-path focused. |

## Phase 1: Core Explainability Helpers

- [x] 1.1 RED: Add `packages/core/src/explainability/glossary.test.ts` for known terms, unknown/raw fallback, and concise definitions.
- [x] 1.2 GREEN: Create `packages/core/src/explainability/glossary.ts` with deterministic term definitions and fallback lookup.
- [x] 1.3 RED: Add `packages/core/src/explainability/explain.test.ts` for summary, why-it-matters, inspect-first, limits, grounding fields, and no invented intent.
- [x] 1.4 GREEN: Create `packages/core/src/explainability/explain.ts`; add presentation-only types in `packages/core/src/types.ts`.
- [x] 1.5 RED: Add `packages/core/src/explainability/file-refs.test.ts` for primary spans, nested evidence refs, and no-match paths.
- [x] 1.6 GREEN: Create `packages/core/src/explainability/file-refs.ts`; export helpers from `packages/core/src/index.ts`.
- [x] 1.7 REFACTOR: Deduplicate fixtures and keep helpers pure, deterministic, and framework-independent.

## Phase 2: MCP Explain Finding

- [x] 2.1 RED: Update `packages/core/src/mcp/tools.test.ts` to expect additive `explanation` plus unchanged raw finding/evidence/memory fields.
- [x] 2.2 GREEN: Modify `packages/core/src/mcp/tools.ts` so `Session.explainFinding` returns bounded explanation envelope beside raw data.
- [x] 2.3 RED/GREEN: Update `packages/core/src/mcp/server.test.ts` and `packages/core/src/mcp/server.ts` wording for deterministic explanation plus raw evidence.

## Phase 3: CLI `rai explain <file>`

- [x] 3.1 RED: Add `packages/cli/src/cli.test.ts` cases for parser/help, file hits, no hits, human output, and no feedback/memory writes.
- [x] 3.2 GREEN: Modify `packages/cli/src/cli.ts` to run analysis, filter via file refs, and render summaries, glossary terms, inspect-first, limits, fingerprints, and spans.
- [x] 3.3 REFACTOR: Align CLI output with core wording; keep JSON behavior only if it matches existing CLI flag conventions.

## Phase 4: README Onboarding

- [x] 4.1 RED: Add docs-focused assertion if existing test style supports README command snippets; otherwise note manual README review in implementation checklist.
- [x] 4.2 GREEN: Create `README.md` with purpose, install, `rai doctor`, `rai analyze`, `rai explain <file>`, finding-reading guide, glossary, limitations, and next steps.
- [x] 4.3 REFACTOR: Keep README quick-path first and defer deep architecture detail.

## Phase 5: Verification

- [x] 5.1 Run focused Vitest suites for core MCP and CLI changes.
- [x] 5.2 Run `pnpm test && pnpm test:launcher`, then `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`.
- [x] 5.3 Update `docs/STATUS.md` and `docs/ROADMAP.md` only after implementation verifies P9 status.
