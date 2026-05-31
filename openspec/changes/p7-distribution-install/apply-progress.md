# Apply Progress: P7 Distribution + Install

## Scope

- Change: `p7-distribution-install`
- Slice: Part 1 / PR1 — install planner + platform detection + dry-run operations
- Delivery: chained PRs, `stacked-to-main`
- Mode: Strict TDD
- Date: 2026-05-31

## Completed Tasks

- [x] 1.1 RED: added `packages/cli/src/install/plan.test.ts` and `detect.test.ts` covering auto-detect, repeated/comma `--platform`, unknown platform failure, dry-run operations, project-root-not-`src`, and temp dirs only.
- [x] 1.2 GREEN: added pure planner modules in `packages/cli/src/install/` for platform types, targets, detection, override parsing, and plan assembly.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `packages/cli/src/install/detect.test.ts`, `packages/cli/src/install/plan.test.ts` | Unit | N/A (new) | ✅ Tests referenced missing `detect.js` / `plan.js`; focused run failed before implementation | ✅ `pnpm test packages/cli/src/install/detect.test.ts packages/cli/src/install/plan.test.ts` passed 10/10 | ✅ 10 cases cover detection, empty fixtures, overrides, unknown platforms, no selection, dry-run operations | ✅ Kept tests temp-dir only; no real home writes |
| 1.2 | `packages/cli/src/install/detect.test.ts`, `packages/cli/src/install/plan.test.ts` | Unit | N/A (new) | ✅ Same RED suite defined public planner/detector contracts first | ✅ Focused suite passed; full verification passed | ✅ Platform detection and planner selection exercised multiple branches | ✅ Split pure modules: `types.ts`, `platforms.ts`, `detect.ts`, `plan.ts` |

## Test Summary

- Total tests written: 10
- Total tests passing: 297 full suite
- Layers used: Unit (10 new), Integration (existing suite unchanged), E2E (none)
- Approval tests: None — no refactoring tasks
- Pure functions created: `parsePlatformOverrides`, `buildInstallPlan`, `detectInstallPlatforms`, target/operation helpers

## Implementation Notes

- Platform ids supported: `opencode`, `claude-code`, `codex`, `copilot`.
- Detection uses injected `projectRoot`, `homeDir`, and `configDir`; tests never touch real home.
- Explicit platform overrides support repeated and comma-separated values at planner level.
- Planner models MCP config and instruction operations only; no writer or CLI command wiring added.
- MCP command uses `rai mcp <projectRoot>` and never targets `/src`.

## Deviations from Design

- None for assigned slice. Writer modules, install CLI routing, templates, and doctor remain intentionally unimplemented.

## Verification

- `pnpm test` — pass, 47 files / 297 tests
- `pnpm typecheck` — pass
- `pnpm build` — pass
- `pnpm lint` — pass
- `git diff --check` — pass

## Remaining Tasks

- [ ] 2.1 RED: safe writer and instruction template tests.
- [ ] 2.2 GREEN: safe writer and bounded instruction template implementation.
- [ ] 3.1–3.2: `rai install` CLI wiring.
- [ ] 4.1–4.2: `rai doctor`.
- [ ] 5.1–5.3: docs/archive/verification updates for later slices.

## Workload / PR Boundary

- Mode: stacked PR slice
- Current work unit: PR1 planner/detection
- Boundary: pure planning modules and tests only; no filesystem writes or CLI command wiring
- Estimated review budget impact: small, within 800-line review budget
