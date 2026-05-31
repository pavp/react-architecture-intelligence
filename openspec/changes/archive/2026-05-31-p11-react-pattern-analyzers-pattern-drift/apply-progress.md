# Apply Progress: P11 React Pattern Analyzers + Pattern Drift

Date: 2026-05-31
Change: `p11-react-pattern-analyzers-pattern-drift`
Mode: strict TDD
Delivery: single apply with maintainer-approved `size-exception`; kept to P11-S1 only.

## Completed tasks

- Work Unit 0 preflight completed.
  - Initial `git status --short` showed pre-existing unrelated `.gitignore` modification, `.pi/`, `p11/`, `progress.md`, and untracked OpenSpec change files.
  - `.gitignore` and `.pi/` were not modified by this apply.
- Work Unit 1 completed.
  - Added React adapter analyzer infrastructure in `packages/adapter-react`.
  - Added `react/compound-component-api-drift` analyzer grounded only in `RepoGraph.patternFacts`.
  - Analyzer emits one finding per root for missing declarations only; unused-only declarations are not emitted in S1.
  - Reused `AdapterMetricEvidence`; no new core evidence union variant.
  - Added deterministic ordering, evidence/claim-bound, frozen graph, and core-adapter tests.
  - Added minimal divergent compound primitive fixture.
- Work Unit 2 completed.
  - CLI adapter loading now composes Next and React adapters independently.
  - Missing optional adapters remain no-op.
  - Unexpected adapter import failures emit deterministic `adapter-load-skipped` diagnostics per adapter.
  - CLI/MCP analysis parity covered for React findings through `buildCliMcpServer(...).session.analyzeRepo(...)`.
  - Added `@rai/adapter-react` workspace dependency and lockfile entry.
- Final verification commands completed.

## TDD Cycle Evidence

| Cycle | RED evidence | GREEN evidence | TRIANGULATE / REFACTOR evidence |
|---|---|---|---|
| React adapter analyzer | Added `packages/adapter-react/src/compound-component-api-drift.test.ts` and `core-adapter.test.ts`, then ran `pnpm test -- packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/core-adapter.test.ts`; failed with 4 assertion failures because stub analyzer returned no findings. | Implemented fact indexing, missing declaration findings, evidence, fingerprints, core adapter factory, exports, and fixture. Reran the same command; 59 files / 360 tests passed. | Added deterministic/evidence/frozen graph assertions in the analyzer test file. Refactored helpers for fact sorting, role construction, topology, and fingerprints. Full `pnpm test` later passed 59 files / 364 tests. Note: deterministic/frozen assertions were introduced during the initial RED file, but only missing-finding assertions failed against the stub; no separate per-edge RED run was captured for every triangulation assertion. |
| CLI adapter composition | Added independent Next/React loader expectations and package dependency expectation in `packages/cli/src/adapters.test.ts`, then ran `pnpm test -- packages/cli/src/adapters.test.ts`; failed with 6 assertion failures because React was not composed and package dependency was absent. | Implemented adapter descriptors, independent diagnostics/no-op loading, React package dependency, lockfile update, and test/runtime aliases. Reran `pnpm test -- packages/cli/src/adapters.test.ts`; 59 files / 363 tests passed. | Added CLI/MCP parity test in `packages/cli/src/cli.test.ts`; `pnpm test -- packages/cli/src/adapters.test.ts packages/cli/src/cli.test.ts` passed 59 files / 364 tests. Kept loader abstraction limited to two descriptors. |

## Files changed by this apply

- `fixtures/react/compound-primitives/divergent.tsx`
- `packages/adapter-react/src/compound-component-api-drift.ts`
- `packages/adapter-react/src/compound-component-api-drift.test.ts`
- `packages/adapter-react/src/core-adapter.ts`
- `packages/adapter-react/src/core-adapter.test.ts`
- `packages/adapter-react/src/index.ts`
- `packages/cli/package.json`
- `packages/cli/src/adapters.ts`
- `packages/cli/src/adapters.test.ts`
- `packages/cli/src/cli.test.ts`
- `packages/cli/tsconfig.json`
- `pnpm-lock.yaml`
- `vitest.config.ts`
- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/tasks.md`
- `openspec/changes/p11-react-pattern-analyzers-pattern-drift/apply-progress.md`

## Commands run

| Command | Result |
|---|---|
| `git status --short && test -f .pi/gentle-ai/support/strict-tdd.md && echo STRICT_TDD_SUPPORT_PRESENT || true && find packages/adapter-react/src packages/cli/src fixtures/react/compound-primitives -maxdepth 2 -type f \\| sort` | Completed. No strict-TDD support file was present. Recorded pre-existing `.gitignore` and `.pi/` state. |
| `pnpm test -- packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | RED: failed 4 assertions against stub analyzer. |
| `pnpm test -- packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | GREEN: passed, 59 files / 360 tests. Vitest still collected the repo test suite despite focused path args. |
| `pnpm test -- packages/cli/src/adapters.test.ts` | RED: failed 6 assertions for missing React composition/dependency. |
| `pnpm test -- packages/cli/src/adapters.test.ts` | GREEN: passed, 59 files / 363 tests. |
| `pnpm test -- packages/cli/src/adapters.test.ts packages/cli/src/cli.test.ts` | Passed, 59 files / 364 tests. |
| `pnpm typecheck` | Passed. Builds all packages first, then `tsc --noEmit`. |
| `pnpm test` | Passed, 59 files / 364 tests. |
| `pnpm test:launcher` | Passed, Go launcher tests. |
| `pnpm build` | Passed. |
| `pnpm lint` | Passed. |
| `git diff --check` | Passed with no output. |

## Post-review optional hardening

Fresh review after apply found no blockers and two optional follow-ups. Both were addressed before verify:

- Added fixture-level healthy parser/analyze coverage in `packages/adapter-react/src/core-adapter.test.ts`.
  - The test reads `fixtures/react/compound-primitives/modal.tsx` and `popover.tsx`.
  - It asserts the parser produces expected `member-assignment` and `jsx` pattern facts.
  - It asserts `react/compound-component-api-drift` emits no findings for healthy fixture source.
- Strengthened SDD evidence for the triangulation concern without claiming retroactive RED.
  - The original apply did not capture a separate RED run for every triangulation edge.
  - This is now recorded as an accepted strict-TDD documentation deviation.
  - Additional post-review validation command: `pnpm test -- packages/adapter-react/src/core-adapter.test.ts` passed, 59 files / 365 tests.

## Deviations from design / task plan

- No `packages/core` source changes were made.
- No new MCP pattern/drift tool was added.
- No automatic memory/config/snapshot writes were added to React adapter logic.
- `vitest.config.ts` gained aliases for `@rai/adapter-next` and `@rai/adapter-react` so CLI tests load workspace source during Vitest instead of stale ignored `dist` output; production CLI still depends on built workspace packages.
- Existing `packages/cli/src/cli.test.ts` type issues surfaced during edits and were fixed narrowly with status narrowing and safe `Buffer.from` conversion.
- Docs/status roadmap updates and snapshot/get_drift parity tests were not completed in this apply to keep the slice narrow.
- Memory tools were not available in this subagent surface; parent persistence is needed for Engram if desired.

## Remaining tasks

- Optional PR3 follow-up: snapshot/get_drift parity coverage for persisted React findings.
- Optional PR3 follow-up: `rai explain <file>`/file-ref parity test for React adapter evidence.
- Docs follow-up if desired: update `docs/STATUS.md` and `docs/ROADMAP.md` to record completed P11-S1 and deferred P11 families.
- OpenSpec archive/verify phase after parent review.

## Workload / PR boundary

- Delivery path: single apply under maintainer-approved `size-exception`.
- Boundary actually delivered: adapter-react analyzer + CLI/MCP composition + focused tests + OpenSpec progress.
- Scope intentionally excluded deferred P11 families: provider/context, controlled/uncontrolled, forms, data fetching, design-system usage, overlays beyond compound fixture evidence, container/presenter, and broad API conventions.
- Budget status: implementation stayed under the active 800-line budget; final diff should be reviewed as one exception-sized P11-S1 change.
