# Apply Progress: P11-S3 React Controlled/Uncontrolled Prop-Surface Drift

## Status

applied

## Workload / PR boundary

- Delivery mode: single PR.
- Approval: maintainer approved continuing as one PR after forecast exceeded the 400-line review-risk trigger.
- Implementation boundary: one adapter-owned React analyzer plus tests and adapter wiring.
- Explicitly avoided: `packages/core/**`, CLI/MCP implementation, persistence, snapshots, feedback, memory, docs/status/roadmap updates, canonical spec sync, archive.
- Unrelated/scratch paths remain excluded from intended staging: `.gitignore`, `.pi/`, `progress.md`, `reviews/`, `sdd/`.

## Completed tasks

- Added `react/controlled-uncontrolled-prop-surface-drift` analyzer in `@rai/adapter-react`.
- Added strict TDD tests for silent cases, approved pair findings, multi-pair severity, evidence shape, deterministic ordering, frozen input immutability, and analyzer-owned explanation.
- Registered the analyzer in React adapter composition.
- Exported the analyzer and rule id from `packages/adapter-react/src/index.ts`.
- Added adapter composition coverage proving normal analysis emits the finding and preserves the explanation hook.
- Updated `tasks.md` checkboxes for completed apply work.

## Files changed

- `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.ts`
- `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts`
- `packages/adapter-react/src/core-adapter.ts`
- `packages/adapter-react/src/core-adapter.test.ts`
- `packages/adapter-react/src/index.ts`
- `openspec/changes/p11-s3-react-pattern-analyzers/tasks.md`
- `openspec/changes/p11-s3-react-pattern-analyzers/apply-progress.md`

Planning artifacts already present in this change:

- `openspec/changes/p11-s3-react-pattern-analyzers/explore.md`
- `openspec/changes/p11-s3-react-pattern-analyzers/proposal.md`
- `openspec/changes/p11-s3-react-pattern-analyzers/specs/react-pattern-analyzers/spec.md`
- `openspec/changes/p11-s3-react-pattern-analyzers/specs/explainability/spec.md`
- `openspec/changes/p11-s3-react-pattern-analyzers/design.md`

## TDD Cycle Evidence

| Cycle | Phase | Command / action | Result | Notes |
|------|-------|------------------|--------|-------|
| 1 | RED | Added `controlled-uncontrolled-prop-surface-drift.test.ts` and adapter composition expectations before production implementation. | Tests failed before implementation. | Failure was expected missing module: `Failed to load url ./controlled-uncontrolled-prop-surface-drift.js`. |
| 1 | RED | `pnpm test packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | Failed: 2 failed suites, 0 tests collected. | Establishes RED before creating analyzer. |
| 1 | GREEN | Implemented analyzer, evidence, fingerprints, severity, explanation hook, exports, and adapter registration. | Implementation added only under `packages/adapter-react`. | No `packages/core/**` changes. |
| 1 | GREEN | `pnpm test packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | Passed: 2 files, 15 tests. | New analyzer and composition green. |
| 1 | TRIANGULATE | `pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | Passed: 4 files, 35 tests. | Guards existing P11-S1/P11-S2 analyzers plus P11-S3. |
| 1 | REFACTOR/VERIFY | `pnpm typecheck` | Passed. | Runs workspace builds and `tsc --noEmit`. |
| 1 | VERIFY | `pnpm test && pnpm test:launcher` | Passed: 61 Vitest files / 396 tests plus Go launcher tests. | Full strict TDD test command passed. |
| 1 | VERIFY | `pnpm build && rtk proxy pnpm lint` | Passed. | Build succeeded; lint guard passed. |
| 1 | VERIFY | `./scripts/smoke.sh --build` | Passed: 19 checks, 0 failed. | Existing smoke coverage still passes. |
| 1 | VERIFY | `git diff --check` | Passed. | Whitespace clean. |

## Behavior implemented

- Emits one finding per component when `ComponentNode.propNames` contains one or more approved controlled/default pairs:
  - `value/defaultValue`
  - `checked/defaultChecked`
  - `open/defaultOpen`
- Stays silent for single-prop and support-only surfaces.
- Uses `info` for one mixed pair and `warn` for multiple mixed pairs.
- Records optional supporting evidence for handler props:
  - `onChange`
  - `onValueChange`
  - `onCheckedChange`
  - `onOpenChange`
- Records optional supporting evidence for state hooks:
  - `useState`
  - `useReducer`
- Uses `AdapterMetricEvidence` with deterministic roles, metrics, thresholds, and `topology.exceeded` labels.
- Provides adapter-owned human explanation with observed prop pairs, handlers, hooks, counts, threshold, and explicit limits.

## Deviations from design

- No docs/status/roadmap updates were made in this apply slice; leave project status docs for parent closeout/verification.
- No canonical spec sync or archive was performed; those belong after verify/review.
- No CLI/MCP implementation changes were needed because existing adapter composition and explanation hook path carry the analyzer.
- No fixture directory was added; direct unit and composition tests covered the behavior without extra fixture files.

## Remaining tasks

- Run independent review/verify if desired.
- Decide whether parent should update `docs/STATUS.md` and `docs/ROADMAP.md` after review.
- Sync spec deltas into canonical specs after verify passes.
- Write `sync-report.md` and `archive-report.md`.
- Archive the OpenSpec change.
- Prepare PR with explicit staging only, excluding unrelated/scratch files.

## Risks

- Intentional dual-mode components may be surfaced as review signals; severity and wording are intentionally bounded.
- `propNames` only covers observed destructured prop names, not TypeScript interface/type fields.
- Prop-level spans are unavailable; the analyzer grounds findings at component span/file level.
- Implementation line count is reviewable but not tiny; keep PR scoped to this one analyzer family.
