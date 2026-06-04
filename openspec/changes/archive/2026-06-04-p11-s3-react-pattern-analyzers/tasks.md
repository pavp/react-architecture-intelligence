# Tasks: P11-S3 React Controlled/Uncontrolled Prop-Surface Drift

## Status

planned

## Review workload forecast

Estimated changed lines: 700-1000.

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

This is under the active 1200-line budget but above the 400-line review-risk trigger. Maintainer approved continuing as a single PR before apply.

## Phase 0 — Scope guard

- [x] Confirm P9-S3 is merged to `main`.
- [x] Create branch `feat/p11-s3-react-pattern-analyzers`.
- [x] Preserve unrelated/scratch files outside staging:
  - `.gitignore`
  - `.pi/`
  - `progress.md`
  - `reviews/`
  - `sdd/`
- [x] Create `explore.md` recommending controlled/uncontrolled prop-surface drift.
- [x] Create `proposal.md`.
- [x] Create spec deltas.
- [x] Create `design.md`.
- [x] Confirm delivery strategy before apply because forecast exceeds 400 changed lines.

## Phase 1 — RED tests

Strict TDD is active. Add tests that fail before implementation.

### Analyzer unit tests

Create `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts`.

- [x] RED: component with only `value` emits no finding.
- [x] RED: component with only `defaultValue` emits no finding.
- [x] RED: component with handler props but no mixed pair emits no finding.
- [x] RED: component with state hooks but no mixed pair emits no finding.
- [x] RED: component with `value` and `defaultValue` emits one `react/controlled-uncontrolled-prop-surface-drift` finding.
- [x] RED: component with `checked` and `defaultChecked` emits one finding.
- [x] RED: component with `open` and `defaultOpen` emits one finding.
- [x] RED: component with multiple mixed pairs escalates to `warn` and has deterministic pair order.
- [x] RED: finding evidence includes subject, roles, metrics, threshold, exceeded pair labels, file, and span.
- [x] RED: handler props and state hooks appear only as supporting evidence.
- [x] RED: repeated identical input returns equivalent finding fields and evidence order.
- [x] RED: reversed component/prop/hook input returns equivalent finding fields and evidence order.
- [x] RED: analyzer does not mutate frozen graph input.
- [x] RED: analyzer-owned explanation is evidence-first, plain-language, and bounded.

### Adapter composition tests

Modify `packages/adapter-react/src/core-adapter.test.ts`.

- [x] RED: React adapter analyzer list includes `react/controlled-uncontrolled-prop-surface-drift`.
- [x] RED: composed analyzer emits the new finding for a minimal graph/input.
- [x] RED: composed analyzer's explanation hook returns adapter-owned wording.

## Phase 2 — GREEN implementation

- [x] Add `packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.ts`.
- [x] Implement deterministic approved-pair detection from `ComponentNode.propNames`.
- [x] Add stable supporting evidence for handler props and state hooks.
- [x] Build `AdapterMetricEvidence` roles, metrics, thresholds, and exceeded labels.
- [x] Build stable finding ids and fingerprints.
- [x] Implement severity policy: one pair `info`, multiple pairs `warn`.
- [x] Implement analyzer-owned `explain` hook.
- [x] Export rule id/analyzer from `packages/adapter-react/src/index.ts` if consistent with existing exports.
- [x] Register analyzer in `packages/adapter-react/src/core-adapter.ts`.
- [x] Keep `packages/core/**` unchanged unless a stop gate is explicitly approved.

## Phase 3 — TRIANGULATE / behavior guards

- [x] Add or extend tests for all approved pair slots: value, checked, open.
- [x] Add deterministic ordering coverage for mixed pair labels, roles, and findings.
- [x] Add bounded-claims assertions for message/explanation text.
- [x] Run focused tests:

```bash
pnpm test packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts
```

## Phase 4 — Docs and OpenSpec apply notes

- [x] Update `docs/STATUS.md` only after implementation and verification evidence are available.
- [x] Update `docs/ROADMAP.md` only after implementation and verification evidence are available.
- [x] Write `openspec/changes/p11-s3-react-pattern-analyzers/apply-progress.md` with RED/GREEN/TRIANGULATE/REFACTOR evidence.
- [x] Do not sync canonical specs until verify passes.

## Phase 5 — Full verification

Run:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
./scripts/smoke.sh --build
git diff --check
```

Record results in `verify-report.md`.

## Phase 6 — Review, sync, archive, PR

- [x] Run fresh review before PR.
- [x] Fix blockers only.
- [x] Sync spec deltas into canonical specs after verify passes.
- [x] Write `sync-report.md`.
- [x] Write `archive-report.md`.
- [x] Move change to `openspec/changes/archive/YYYY-MM-DD-p11-s3-react-pattern-analyzers/`.
- [ ] Stage only relevant files; exclude scratch/unrelated files.
- [ ] Commit with conventional commit message.
- [ ] Push branch and open PR with exactly one `type:*` label.
- [ ] Merge only after checks pass and user approves any required bypass.

## Stop gates

Stop and ask before continuing if any occur:

- Implementation requires JSX attribute extraction.
- Implementation requires TypeScript interface/type prop extraction.
- Implementation requires runtime value inference.
- Implementation requires React semantics in `@rai/core`.
- Finding wording starts claiming bug, wrong architecture, runtime warnings, author intent, root cause, user impact, or required remediation.
- Estimated changed lines approach or exceed the active review budget.
- Tests reveal CLI/MCP raw contract changes.
