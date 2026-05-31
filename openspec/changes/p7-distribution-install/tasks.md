# Tasks: P7 Distribution + Install

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 850-1,150 |
| 400-line budget risk | High |
| 800-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 planner/detection → PR2 writers/install CLI → PR3 doctor/docs/archive |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: Resolved by apply prompt — stacked-to-main.
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
800-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Planner + platform detection | PR 1 | Temp-dir RED tests; no writes. |
| 2 | Safe writers + install CLI | PR 2 | Temp `$HOME`; tests with behavior. |
| 3 | Doctor + docs/archive prep | PR 3 | CLI doctor tests, docs/status/roadmap. |

## Phase 1: Planner + Detection

- [x] 1.1 RED: add `packages/cli/src/install/plan.test.ts` and `detect.test.ts` for auto-detect, repeated/comma `--platform`, unknown platform failure, dry-run operations, project-root-not-`src`, temp dirs only.
- [x] 1.2 GREEN: create `install/types.ts`, `platforms.ts`, `detect.ts`, `plan.ts` with pure `InstallPlan`; fail before writes and report supported ids.

## Phase 2: Safe Writers + Instructions

- [ ] 2.1 RED: add `packages/cli/src/install/writers.test.ts` and `templates.test.ts` for JSON merge, TOML section replace, marker block update, broken JSON denial, no real home writes.
- [ ] 2.2 GREEN: create `writers.ts` atomic temp/rename helpers and `templates.ts` bounded RAI routing block with use/not-use guidance.

## Phase 3: `rai install` CLI Wiring

- [ ] 3.1 RED: extend `packages/cli/src/cli.test.ts` for `install --dry-run`, `--yes`, `--no-instructions`, confirmation-required path, explicit platforms, temp `$HOME`/cwd.
- [ ] 3.2 GREEN: modify `packages/cli/src/cli.ts` parser/routing/usage; review `packages/cli/package.json` bin metadata only if MCP command generation needs it.

## Phase 4: `rai doctor`

- [ ] 4.1 RED: add CLI doctor tests for pass/warn/fail JSON/text output, degraded native/config checks, non-zero blocking failures, temp runtime probes.
- [ ] 4.2 GREEN: create `packages/cli/src/doctor.ts`; wire `rai doctor` checks for Node, CLI smoke, `better-sqlite3`, `sqlite-vec`, MCP construction, config parse, permissions.

## Phase 5: Docs, Archive, Verification

- [ ] 5.1 Update `docs/STATUS.md` and `docs/ROADMAP.md` with P7 install/doctor progress and distribution decision.
- [ ] 5.2 After verify, archive specs via SDD archive: merge `openspec/changes/p7-distribution-install/specs/distribution-install/spec.md` into canonical specs.
- [ ] 5.3 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`; fix failures before completion.
