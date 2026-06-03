# Apply Progress: P9-S2 Human-Readable Explanations

## Status

Applied in strict TDD mode.

## Completed tasks

- Added optional analyzer-owned `explain(finding)` hook to the analyzer contract.
- Added `AnalyzerRegistry.get(ruleId)` for explanation dispatch.
- Updated `Session.explainFinding` to use analyzer-owned explanations when available and fall back to generic core explainability otherwise.
- Added `react/container-presenter-role-drift` human explanation in `@rai/adapter-react`.
- Updated smoke coverage to assert the new human summary through the CLI.
- Updated canonical explainability spec and status/roadmap docs.

## Files changed

- `packages/core/src/analyzers/analyzer.ts`
- `packages/core/src/analyzers/registry.ts`
- `packages/core/src/mcp/tools.ts`
- `packages/core/src/mcp/tools.test.ts`
- `packages/adapter-react/src/container-presenter-role-drift.ts`
- `packages/adapter-react/src/container-presenter-role-drift.test.ts`
- `scripts/smoke.sh`
- `openspec/specs/explainability/spec.md`
- `openspec/changes/p9-s2-human-readable-explanations/`
- `docs/STATUS.md`
- `docs/ROADMAP.md`

## TDD Cycle Evidence

| Cycle | Phase | Evidence | Result |
|---|---|---|---|
| 1 | RED | Added adapter test expecting plain human explanation for `react/container-presenter-role-drift`. | Failed as expected: `analyzer.explain` returned `undefined`. |
| 2 | GREEN | Added optional analyzer explanation hook, registry lookup, session dispatch, and adapter-owned explanation. | Focused tests passed: `packages/core/src/mcp/tools.test.ts` and `packages/adapter-react/src/container-presenter-role-drift.test.ts`, 61 tests. |
| 3 | TRIANGULATE | Added smoke assertion for human summary in `scripts/smoke.sh`; ran typecheck and smoke. | `pnpm typecheck` passed; `./scripts/smoke.sh --build` passed, 19 checks. |
| 4 | VERIFY | Ran full tests, launcher tests, build, lint, diff checks, and LSP diagnostics. | Passed: Vitest 60 files / 380 tests, Go launcher tests, typecheck, build, `rtk proxy pnpm lint`, `git diff --check`, LSP diagnostics. |

## Commands run

| Command | Exit | Summary |
|---|---:|---|
| `pnpm test packages/core/src/mcp/tools.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts` | 1 | RED: adapter explanation absent. |
| `pnpm test packages/core/src/mcp/tools.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts` | 0 | GREEN: 2 files / 61 tests. |
| `pnpm typecheck` | 0 | TypeScript checks passed. |
| `./scripts/smoke.sh --build` | 0 | Smoke passed, including human summary assertion; 19 passed, 0 failed. |
| `pnpm test && pnpm test:launcher` | 0 | Full Vitest pass: 60 files / 380 tests; Go launcher tests passed. |
| `pnpm build` | 0 | Workspace build passed. |
| `rtk proxy pnpm lint` | 0 | Core framework-free lint passed. |
| `git diff --check` | 0 | No whitespace errors. |
| LSP diagnostics on changed TS/shell files | 0 | No diagnostics. |

## Deviations

- No raw evidence, fingerprint, memory, snapshot, or feedback contracts changed.
- No React-specific rule ids, role names, or presentation strings were added to `packages/core/**`; core only owns the generic extension seam.
- `rai analyze` remains a machine/count envelope; the human-quality rule applies to human-facing presentation such as `rai explain` and `explain_finding.explanation`.

## Remaining tasks

- Fresh review.
- Verify report.
- Archive/sync P9-S2 change if review passes.
