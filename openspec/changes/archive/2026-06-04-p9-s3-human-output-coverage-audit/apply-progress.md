# Apply Progress: P9-S3a Current Analyzer Human Explanation Coverage

## Status

Applied in strict TDD mode.

Resolved delivery path: `exception-ok`, `single-pr`. Implementation exceeded the active 1200-line budget after apply, and the user approved a larger size exception before review/verify continued. Scope stayed out of broad doctor/install/backfill/CLI error UX.

## Completed tasks

- Added RED tests for current analyzer human explanation coverage before implementation:
  - core known evidence summaries and bounded fallback;
  - MCP `explain_finding` raw-field preservation;
  - `react/compound-component-api-drift` analyzer-owned explanation;
  - `next/client-boundary-bloat` and `next/route-coupling` analyzer-owned explanations;
  - Next adapter composition preserving `Analyzer.explain` hooks;
  - CLI `rai explain` rendering a Next adapter-owned summary.
- Improved core fallback explanations for known core evidence kinds:
  - `shared-extraction`;
  - `render-coupling`;
  - `over-abstraction`;
  - `hook-topology`;
  - `boundary-violation`.
- Preserved explicit raw fallback for unknown evidence and adapter metrics without hooks.
- Added adapter-owned human explanations for:
  - `react/compound-component-api-drift`;
  - `next/client-boundary-bloat`;
  - `next/route-coupling`.
- Updated Next `core-adapter.ts` to propagate adapter-owned `explain` hooks through CLI/MCP composition.
- Updated CLI and MCP tests to prove explanation text improves while raw evidence/fingerprint/memory contracts remain stable.
- Updated `docs/STATUS.md` and `docs/ROADMAP.md` after validation to record P9-S3 completion and defer broad command-copy audit.

## Files changed

- `packages/core/src/explainability/explain.ts`
- `packages/core/src/explainability/explain.test.ts`
- `packages/core/src/mcp/tools.test.ts`
- `packages/adapter-react/src/compound-component-api-drift.ts`
- `packages/adapter-react/src/compound-component-api-drift.test.ts`
- `packages/adapter-next/src/client-boundary-bloat.ts`
- `packages/adapter-next/src/client-boundary-bloat.test.ts`
- `packages/adapter-next/src/route-coupling.ts`
- `packages/adapter-next/src/route-coupling.test.ts`
- `packages/adapter-next/src/core-adapter.ts`
- `packages/adapter-next/src/core-adapter.test.ts`
- `packages/cli/src/cli.test.ts`
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `openspec/changes/p9-s3-human-output-coverage-audit/apply-progress.md`

Known unrelated/scratch files were not modified by this apply pass: `.gitignore`, `.pi/`, `progress.md`, `reviews/`, `sdd/`.

## TDD Cycle Evidence

| Cycle | Phase | Evidence | Result |
|---|---|---|---|
| 1 | RED | Added failing focused tests across `explain.test.ts`, `tools.test.ts`, React adapter tests, Next adapter tests, Next composition tests, and CLI explain tests. Ran focused command. | Failed as expected: 13 failures from generic summaries, missing adapter-owned hooks, missing Next hook propagation, and old CLI expectations. |
| 2 | GREEN | Implemented core known-evidence wording, raw fallback, compound explanation hook, Next explanation functions, and Next hook propagation. | Focused tests reduced to expectation mismatches, then passed after aligning tests with bounded negative-claim wording and deterministic formatting. |
| 3 | TRIANGULATE | Ran all focused P9-S3a tests together. | Passed: 8 files / 119 tests. |
| 4 | VERIFY | Ran full validation commands. | Passed: `pnpm test && pnpm test:launcher`, `pnpm typecheck`, `pnpm build`, `rtk proxy pnpm lint`, `./scripts/smoke.sh --build`, and `git diff --check`. |
| 5 | REVIEW FIX | Strengthened raw-contract tests after fresh review found self-comparison/ghost-loop gaps; added pre-explain snapshots, `rai explain --json` raw-shape assertions, and route-coupling composition coverage. Updated workload docs after review found stale size records. | Passed: focused contract tests, LSP diagnostics, full tests/launcher, typecheck, build, lint, smoke, and `git diff --check`. |

## Commands run

| Command | Exit | Summary |
|---|---:|---|
| `pnpm test packages/core/src/explainability/explain.test.ts packages/core/src/mcp/tools.test.ts packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-next/src/client-boundary-bloat.test.ts packages/adapter-next/src/route-coupling.test.ts packages/adapter-next/src/core-adapter.test.ts packages/cli/src/cli.test.ts` | 1 | RED: expected failures for generic wording and missing adapter-owned explanations. |
| Same focused command | 0 | GREEN/TRIANGULATE: 8 files / 119 tests passed. |
| `pnpm typecheck` | 0 | Workspace build and TypeScript no-emit checks passed. |
| `pnpm test && pnpm test:launcher` | 0 | Full Vitest pass: 60 files / 386 tests; Go launcher tests passed. |
| `pnpm build` | 0 | Workspace build passed. |
| `rtk proxy pnpm lint` | 0 | Core framework-free guard passed. |
| `./scripts/smoke.sh --build` | 0 | Smoke passed: 19 checks, including container/presenter human summary. |
| `git diff --check` | 0 | No whitespace errors. |
| `pnpm test packages/core/src/mcp/tools.test.ts packages/adapter-next/src/core-adapter.test.ts packages/cli/src/cli.test.ts` | 0 | Review-fix contract tests passed: 3 files / 79 tests. |
| LSP diagnostics on changed contract-test files | 0 | No diagnostics after review fix. |
| `git diff --check` | 0 | Review-fix whitespace check passed. |
| `pnpm test && pnpm test:launcher` | 0 | Review-fix full Vitest pass: 60 files / 386 tests; Go launcher tests passed. |
| `pnpm typecheck` | 0 | Review-fix TypeScript checks passed. |
| `pnpm build` | 0 | Review-fix workspace build passed. |
| `rtk proxy pnpm lint` | 0 | Review-fix core framework-free guard passed. |
| `./scripts/smoke.sh --build` | 0 | Review-fix smoke passed: 19 checks. |
| `git diff --check` | 0 | Review-fix final whitespace check passed. |

## Deviations from design

- No broad `doctor`, `install`, `backfill`, CLI usage/error, MCP tool description, or README UX pass was implemented.
- No raw evidence schemas, fingerprint generation, MCP raw fields, diagnostics shapes, DB persistence, snapshots, feedback behavior, analyzer truth, or finding generation changed.
- Next direct analyzer objects remain raw analyzer objects; adapter-owned explanation functions are exported and attached by `createNextCoreAnalyzers()` through the core `Analyzer.explain` hook.
- Explanation text uses deterministic, targeted wording. Tests avoid over-locking every full paragraph except where exact templates were part of the design.

## Remaining tasks

- Fresh review/verify by parent workflow.
- Sync/archive OpenSpec if verify passes.
- Prepare PR only after review; do not include unrelated/scratch files.

## Workload / PR boundary

- Resolved delivery path: `exception-ok`, `single-pr`.
- Source/test/docs diff excluding unrelated scratch files is about 4,267 additions + 1,786 deletions, or about 2,960 additions + 479 deletions ignoring whitespace.
- OpenSpec artifacts add about 1,316 lines before sync/archive reports.
- This exceeds the active 1200-line budget and the 400-line guard. User approved an explicit larger size exception for this slice.
