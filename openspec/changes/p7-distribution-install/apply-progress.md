# Apply Progress: P7 Distribution + Install

## Scope

- Change: `p7-distribution-install`
- Slice: Parts 1–2 / PR1–PR2 — install planner/detection plus safe writers, bounded instructions, and `rai install` CLI wiring
- Delivery: chained PRs, `stacked-to-main`
- Mode: Strict TDD
- Date: 2026-05-31

## Completed Tasks

- [x] 1.1 RED: added `packages/cli/src/install/plan.test.ts` and `detect.test.ts` covering auto-detect, repeated/comma `--platform`, unknown platform failure, dry-run operations, project-root-not-`src`, and temp dirs only.
- [x] 1.2 GREEN: added pure planner modules in `packages/cli/src/install/` for platform types, targets, detection, override parsing, and plan assembly.
- [x] 2.1 RED: added `packages/cli/src/install/writers.test.ts` and `templates.test.ts` covering JSON MCP merge, TOML section replacement, marker-owned instruction replacement, broken JSON denial, and temp-dir-only writes.
- [x] 2.2 GREEN: added safe install writers with atomic temp/rename behavior and bounded RAI instruction templates.
- [x] 3.1 RED: extended `packages/cli/src/cli.test.ts` for `install --dry-run`, default confirmation-required behavior, `--yes`, `--no-instructions`, explicit platform flags, and temp cwd fixtures.
- [x] 3.2 GREEN: wired `rai install` parser/routing/usage and install execution modes without implementing `rai doctor`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `packages/cli/src/install/detect.test.ts`, `packages/cli/src/install/plan.test.ts` | Unit | N/A (new) | ✅ Tests referenced missing `detect.js` / `plan.js`; focused run failed before implementation | ✅ `pnpm test packages/cli/src/install/detect.test.ts packages/cli/src/install/plan.test.ts` passed 10/10 | ✅ 10 cases cover detection, empty fixtures, overrides, unknown platforms, no selection, dry-run operations | ✅ Kept tests temp-dir only; no real home writes |
| 1.2 | `packages/cli/src/install/detect.test.ts`, `packages/cli/src/install/plan.test.ts` | Unit | N/A (new) | ✅ Same RED suite defined public planner/detector contracts first | ✅ Focused suite passed; full verification passed | ✅ Platform detection and planner selection exercised multiple branches | ✅ Split pure modules: `types.ts`, `platforms.ts`, `detect.ts`, `plan.ts` |
| 2.1 | `packages/cli/src/install/writers.test.ts`, `packages/cli/src/install/templates.test.ts` | Unit | N/A (new) | ✅ Tests referenced missing `writers.js` / `templates.js`; focused run failed before implementation | ✅ `pnpm test packages/cli/src/install/writers.test.ts packages/cli/src/install/templates.test.ts` passed 8/8 | ✅ Cases cover JSON preserve+merge, marker replace, TOML section replace, broken JSON no partial write, and all four platform templates | ✅ Temp-dir fixtures only; no real home writes |
| 2.2 | `packages/cli/src/install/writers.test.ts`, `packages/cli/src/install/templates.test.ts` | Unit | N/A (new) | ✅ Same RED suite defined writer/template contracts first | ✅ Focused writer/template suite passed | ✅ Multiple write modes force real branching: JSON, TOML, marker, failure | ✅ Extracted template constants and write result contracts; used atomic temp/rename helper |
| 3.1 | `packages/cli/src/cli.test.ts` | Integration | ✅ `pnpm test packages/cli/src/cli.test.ts packages/cli/src/install/plan.test.ts packages/cli/src/install/detect.test.ts` passed 22/22 before CLI edits | ✅ CLI tests failed while `install` parsed as help and run path returned usage | ✅ `pnpm test packages/cli/src/cli.test.ts` passed 16/16 after wiring | ✅ Cases cover explicit platform flags, dry-run read-only, confirmation-required default, `--yes`, and `--no-instructions` | ✅ Captured stdout and temp cwd; no real home writes |
| 3.2 | `packages/cli/src/cli.test.ts` | Integration | ✅ Same CLI safety net passed before modifying `cli.ts` | ✅ Same RED suite defined install parser/routing/output contract first | ✅ Focused CLI suite and combined part-2 suite passed 24/24 | ✅ Execution modes exercised read-only, blocked write, and confirmed write branches | ✅ Kept parser extension small; fixed exactOptionalPropertyTypes issues |

## Test Summary

- Total tests written: 22 new/updated install-focused cases across Parts 1–2
- Total tests passing: 309 full suite
- Layers used: Unit (18 install writer/planner/template cases), Integration (4 CLI install cases), E2E (none)
- Approval tests: None — no refactoring tasks
- Pure functions created: `parsePlatformOverrides`, `buildInstallPlan`, `detectInstallPlatforms`, target/operation helpers, `instructionMarkerBlock`, marker/TOML/JSON render helpers

## Implementation Notes

- Platform ids supported: `opencode`, `claude-code`, `codex`, `copilot`.
- Detection uses injected `projectRoot`, `homeDir`, and `configDir`; tests never touch real home.
- Explicit platform overrides support repeated and comma-separated values at planner level.
- Planner models MCP config and instruction operations; Part 2 now applies those operations through safe writers and `rai install`.
- MCP command uses `rai mcp <projectRoot>` and never targets `/src`.
- JSON writer merges `mcp.rai` while preserving unrelated config keys and existing MCP server entries.
- TOML writer replaces only `[mcp_servers.rai]` and preserves unrelated settings/sections.
- Instruction writer owns only `<!-- RAI:BEGIN -->` / `<!-- RAI:END -->` block and preserves user content outside markers.
- `rai install` prints a plan for dry-run and confirmation-required paths; writes require `--yes` unless `--dry-run` is set.
- `--no-instructions` suppresses instruction operations during planning and confirmed writes.

## Deviations from Design

- None for assigned Part 2 slice. `rai doctor` remains intentionally unimplemented.

## Verification

- Focused safety net before Part 2 edits: `pnpm test packages/cli/src/cli.test.ts packages/cli/src/install/plan.test.ts packages/cli/src/install/detect.test.ts` — pass, 22/22
- Part 2 RED evidence: missing `writers.js` / `templates.js`; `install` parsed as help before CLI wiring
- Focused GREEN: `pnpm test packages/cli/src/install/writers.test.ts packages/cli/src/install/templates.test.ts packages/cli/src/cli.test.ts` — pass, 24/24
- Final `pnpm test` — pass, 49 files / 309 tests
- Final `pnpm typecheck` — pass
- Final `pnpm build` — pass
- Final `pnpm lint` — pass
- Final `git diff --check` — pass

## Remaining Tasks

- [ ] 4.1–4.2: `rai doctor`.
- [ ] 5.1–5.3: docs/archive/verification updates for later slices.

## Workload / PR Boundary

- Mode: stacked PR slice
- Current work unit: PR2 safe writers + install CLI wiring
- Boundary: safe file writers, bounded instruction templates, and `rai install`; excludes `rai doctor`, docs/status, archive
- Estimated review budget impact: within 800-line review budget for assigned stacked slice
