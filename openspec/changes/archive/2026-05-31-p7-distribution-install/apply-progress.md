# Apply Progress: P7 Distribution + Install

## Scope

- Change: `p7-distribution-install`
- Slice: Parts 1–3 / PR1–PR3 — install planner/detection, safe writers, bounded instructions, `rai install`, `rai doctor`, and docs/status/roadmap updates
- Delivery: chained PRs, `stacked-to-main`
- Mode: Strict TDD
- Date: 2026-05-31

## Completed Tasks

- [x] 1.1 RED: added `packages/cli/src/install/plan.test.ts` and `detect.test.ts` covering auto-detect, repeated/comma `--platform`, unknown platform failure, dry-run operations, project-root-not-`src`, and temp dirs only.
- [x] 1.2 GREEN: added pure planner modules in `packages/cli/src/install/` for platform types, targets, detection, override parsing, and plan assembly.
- [x] 2.1 RED: added `packages/cli/src/install/writers.test.ts` and `templates.test.ts` covering JSON MCP merge, TOML section replacement, marker-owned instruction replacement, broken JSON denial, and temp-dir-only writes.
- [x] 2.2 GREEN: added safe install writers with atomic temp/rename behavior and bounded RAI instruction templates.
- [x] 3.1 RED: extended `packages/cli/src/cli.test.ts` for `install --dry-run`, default confirmation-required behavior, `--yes`, `--no-instructions`, explicit platform flags, and temp cwd fixtures.
- [x] 3.2 GREEN: wired `rai install` parser/routing/usage and install execution modes.
- [x] 4.1 RED: added `packages/cli/src/doctor.test.ts` and extended `cli.test.ts` for pass/warn/fail report paths, JSON/text output, degraded native/config checks, non-zero blocking failures, and temp probes.
- [x] 4.2 GREEN: added `packages/cli/src/doctor.ts` and wired `rai doctor` checks for Node, project root, CLI build, native SQLite/vector readiness, MCP config parse, MCP server construction, and config write suitability.
- [x] 5.1 Updated `docs/STATUS.md` and `docs/ROADMAP.md` to mark P7 complete and record the TypeScript CLI / prebuilt-native / Go-wrapper-later / WASM-deferred distribution decision.
- [ ] 5.2 Archive remains intentionally pending for SDD archive phase after verify.
- [x] 5.3 Ran required verification commands for apply Part 3.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `packages/cli/src/install/detect.test.ts`, `packages/cli/src/install/plan.test.ts` | Unit | N/A (new) | ✅ Tests referenced missing `detect.js` / `plan.js`; focused run failed before implementation | ✅ `pnpm test packages/cli/src/install/detect.test.ts packages/cli/src/install/plan.test.ts` passed 10/10 | ✅ 10 cases cover detection, empty fixtures, overrides, unknown platforms, no selection, dry-run operations | ✅ Kept tests temp-dir only; no real home writes |
| 1.2 | `packages/cli/src/install/detect.test.ts`, `packages/cli/src/install/plan.test.ts` | Unit | N/A (new) | ✅ Same RED suite defined public planner/detector contracts first | ✅ Focused suite passed; full verification passed | ✅ Platform detection and planner selection exercised multiple branches | ✅ Split pure modules: `types.ts`, `platforms.ts`, `detect.ts`, `plan.ts` |
| 2.1 | `packages/cli/src/install/writers.test.ts`, `packages/cli/src/install/templates.test.ts` | Unit | N/A (new) | ✅ Tests referenced missing `writers.js` / `templates.js`; focused run failed before implementation | ✅ `pnpm test packages/cli/src/install/writers.test.ts packages/cli/src/install/templates.test.ts` passed 8/8 | ✅ Cases cover JSON preserve+merge, marker replace, TOML section replace, broken JSON no partial write, and all four platform templates | ✅ Temp-dir fixtures only; no real home writes |
| 2.2 | `packages/cli/src/install/writers.test.ts`, `packages/cli/src/install/templates.test.ts` | Unit | N/A (new) | ✅ Same RED suite defined writer/template contracts first | ✅ Focused writer/template suite passed | ✅ Multiple write modes force real branching: JSON, TOML, marker, failure | ✅ Extracted template constants and write result contracts; used atomic temp/rename helper |
| 3.1 | `packages/cli/src/cli.test.ts` | Integration | ✅ `pnpm test packages/cli/src/cli.test.ts packages/cli/src/install/plan.test.ts packages/cli/src/install/detect.test.ts` passed 22/22 before CLI edits | ✅ CLI tests failed while `install` parsed as help and run path returned usage | ✅ `pnpm test packages/cli/src/cli.test.ts` passed 16/16 after wiring | ✅ Cases cover explicit platform flags, dry-run read-only, confirmation-required default, `--yes`, and `--no-instructions` | ✅ Captured stdout and temp cwd; no real home writes |
| 3.2 | `packages/cli/src/cli.test.ts` | Integration | ✅ Same CLI safety net passed before modifying `cli.ts` | ✅ Same RED suite defined install parser/routing/output contract first | ✅ Focused CLI suite and combined part-2 suite passed 24/24 | ✅ Execution modes exercised read-only, blocked write, and confirmed write branches | ✅ Kept parser extension small; fixed exactOptionalPropertyTypes issues |
| 4.1 | `packages/cli/src/doctor.test.ts`, `packages/cli/src/cli.test.ts` | Unit + integration | ✅ RED run preserved existing CLI coverage: 16 existing tests passed while new doctor tests failed | ✅ Focused RED failed: missing `doctor.js`, `doctor` parsed as help, doctor run returned usage | ✅ `pnpm test packages/cli/src/doctor.test.ts packages/cli/src/cli.test.ts` passed 23/23 | ✅ Cases cover pass, warn, fail, JSON, text, invalid config, native failure, CLI non-zero blocking failure | ✅ Tests use temp project/home/config fixtures and injected native probe; no real home writes |
| 4.2 | `packages/cli/src/doctor.test.ts`, `packages/cli/src/cli.test.ts` | Unit + integration | ✅ Same RED run showed pre-existing CLI behavior still green outside new doctor assertions | ✅ Same RED suite defined report/check/CLI contracts first | ✅ Focused doctor suite passed after wiring `doctor` parser/routing/output | ✅ Branches exercise runtime, project root, build presence, native readiness, MCP parse, MCP construction, filesystem suitability | ✅ Extracted deterministic `runDoctor`, `formatDoctorReport`, and injectable probes |
| 5.1 | `docs/STATUS.md`, `docs/ROADMAP.md` | Documentation | ✅ Read existing docs before edits | ✅ Docs still described P6 current state and P7 as next/planned | ✅ Docs now mark P7 complete and P8 next | ✅ Both status and roadmap capture delivered install/doctor scope and distribution decision | ✅ Kept docs scan-friendly with summary bullets and current-state tables |
| 5.3 | Verification commands | Apply verification | ✅ Focused suites green before full verification | ✅ N/A — verification task validates completed implementation | ✅ Required commands passed | ✅ Full suite and static checks exercised repo-wide behavior | ✅ No verification-driven production refactor needed |

## Test Summary

- Total tests written: 26 new/updated P7-focused cases across Parts 1–3
- Total tests passing: 316 full suite
- Layers used: Unit (planner/detector/writer/template/doctor checks), Integration (`rai install` and `rai doctor` CLI flows), E2E (none)
- Approval tests: None — no refactoring tasks
- Pure functions created: `parsePlatformOverrides`, `buildInstallPlan`, `detectInstallPlatforms`, target/operation helpers, `instructionMarkerBlock`, marker/TOML/JSON render helpers, `runDoctor`, `formatDoctorReport`, doctor check helpers

## Implementation Notes

- Platform ids supported: `opencode`, `claude-code`, `codex`, `copilot`.
- Detection uses injected `projectRoot`, `homeDir`, and `configDir`; tests never touch real home.
- Explicit platform overrides support repeated and comma-separated values at planner level.
- Planner models MCP config and instruction operations; Part 2 applies those operations through safe writers and `rai install`.
- MCP command uses `rai mcp <projectRoot>` and never targets `/src`.
- JSON writer merges `mcp.rai` while preserving unrelated config keys and existing MCP server entries.
- TOML writer replaces only `[mcp_servers.rai]` and preserves unrelated settings/sections.
- Instruction writer owns only `<!-- RAI:BEGIN -->` / `<!-- RAI:END -->` block and preserves user content outside markers.
- `rai install` prints a plan for dry-run and confirmation-required paths; writes require `--yes` unless `--dry-run` is set.
- `--no-instructions` suppresses instruction operations during planning and confirmed writes.
- `rai doctor` is read-only except deterministic temp/native/MCP construction probes and reports human-readable text by default or JSON with `--json`.
- Doctor exits non-zero only for blocking `fail` checks; warning-only degraded states return zero with remediation.

## Deviations from Design

- `rai doctor` native probe verifies current native readiness through MCP/session construction, which opens in-memory SQLite and loads `sqlite-vec`; it does not directly expose `vec_version()` in CLI output. This keeps the check read-only and avoids adding core exports during this slice.
- Archive remains intentionally unperformed because prompt reserved verify/archive for later phase.

## Verification

- Part 3 RED evidence: `pnpm test packages/cli/src/doctor.test.ts packages/cli/src/cli.test.ts` failed because `doctor.js` was missing and `doctor` parsed as help; existing CLI tests still passed 16/16
- Focused GREEN: `pnpm test packages/cli/src/doctor.test.ts packages/cli/src/cli.test.ts` — pass, 23/23
- Final `pnpm test` — pass, 50 files / 316 tests
- Final `pnpm typecheck` — pass
- Final `pnpm build` — pass
- Final `pnpm lint` — pass
- Final `git diff --check` — pass

## Remaining Tasks

- [ ] 5.2: SDD archive after verify phase.

## Workload / PR Boundary

- Mode: stacked PR slice
- Current work unit: PR3 `rai doctor` + docs/status/roadmap updates
- Boundary: doctor checks, CLI help/routing, docs and OpenSpec progress; excludes SDD archive
- Estimated review budget impact: within 800-line review budget for assigned stacked slice
