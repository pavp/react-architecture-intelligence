# Tasks: P11-S4 Framework-Neutral Pattern Fact Expansion

## Status

planned

## Review workload forecast

Estimated changed lines: 600-1040.

- Active budget: 1200 changed lines.
- 400-line review-risk trigger: likely exceeded.
- Chained PRs recommended: no, if P11-S4 remains fact-only.
- Chained PRs required/recommended: yes, if a new analyzer/rule id is added.

## Phase 0 — Scope guard

- [x] Confirm P9-S3, P11-S1, P11-S2, and P11-S3 are merged to `main`.
- [x] Create branch `feat/p11-s4-react-pattern-analyzers`.
- [x] Preserve unrelated/scratch files outside staging:
  - `.gitignore`
  - `.pi/`
  - `progress.md`
  - `reviews/`
  - `sdd/`
- [x] Create `explore.md` recommending fact-only P11-S4.
- [x] Create `proposal.md`.
- [x] Create spec deltas.
- [x] Create `design.md`.
- [x] Confirm delivery strategy before apply because forecast exceeds 400 changed lines.

## Phase 1 — RED tests

Strict TDD is active. Add tests that fail before implementation.

### Parser tests

Modify `packages/core/src/parse/pass1.test.ts`.

- [x] RED: extracts `call-binding` for simple identifier initialized by a call expression.
- [x] RED: omits or bounds unsupported/destructured call bindings without semantic inference.
- [x] RED: extracts `call-argument` for identifier arguments.
- [x] RED: extracts `call-argument` for literal arguments.
- [x] RED: extracts deterministic zero-based argument indexes.
- [x] RED: extracts `jsx-attribute` for string literal attributes.
- [x] RED: extracts `jsx-attribute` for expression attributes.
- [x] RED: extracts `jsx-attribute` for boolean/absent attributes.
- [x] RED: extracts bounded `jsx-attribute` facts for spread attributes without expansion.
- [x] RED: serialized core facts contain no React analyzer/rule/remediation semantics.

### Graph/catalog tests

- [x] RED: graph build preserves/sorts/dedupes new facts if current coverage is insufficient.
- [x] RED: graph/facts remain frozen and JSON-safe if current coverage is insufficient.
- [x] RED: React catalog fact-kind list includes the new generic facts if the list is comprehensive.

## Phase 2 — GREEN implementation

- [x] Update `packages/core/src/types.ts` with additive fact interfaces and union members.
- [x] Update `packages/core/src/parse/pass1.ts` to extract `call-binding` facts.
- [x] Update `packages/core/src/parse/pass1.ts` to extract `call-argument` facts.
- [x] Update `packages/core/src/parse/pass1.ts` to extract `jsx-attribute` facts.
- [x] Keep extraction syntax-only and framework-neutral.
- [x] Update `packages/core/src/parse/graph-build.test.ts` or graph freeze logic only if tests require it.
- [x] Update `packages/adapter-react/src/catalog.ts` and `catalog.test.ts` if catalog fact-kind list remains comprehensive.
- [x] Do not add new findings or React analyzer files.

## Phase 3 — TRIANGULATE / regression guards

- [x] Run focused parser/catalog tests:

```bash
pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts
```

- [x] Run React analyzer regression tests:

```bash
pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts
```

- [x] Confirm no new rule ids/findings are introduced by P11-S4.

## Phase 4 — Docs and OpenSpec apply notes

- [x] Update `docs/STATUS.md` only after implementation and verification evidence are available.
- [x] Update `docs/ROADMAP.md` only after implementation and verification evidence are available.
- [x] Write `openspec/changes/p11-s4-react-pattern-analyzers/apply-progress.md` with RED/GREEN/TRIANGULATE/REFACTOR evidence.
- [x] Do not sync canonical specs until verify passes.

## Phase 5 — Full verification

Run:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
rtk proxy pnpm lint
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
- [x] Move change to `openspec/changes/archive/YYYY-MM-DD-p11-s4-react-pattern-analyzers/`.
- [ ] Stage only relevant files; exclude scratch/unrelated files.
- [ ] Commit with conventional commit message.
- [ ] Push branch and open PR with exactly one `type:*` label.
- [ ] Merge only after checks pass and user approves any required bypass.

## Stop gates

Stop and ask before continuing if any occur:

- New analyzer or rule id becomes necessary in P11-S4.
- React-specific semantics enter `packages/core`.
- New `Evidence` union member or raw finding shape change is needed.
- Fingerprint, persistence, snapshot, feedback, or MCP raw contract change is needed.
- Type checker, symbol resolver, import resolver, or runtime value evaluation becomes necessary.
- JSX spread expansion semantics become necessary.
- Forecast exceeds 1200 changed lines.
- Need to touch known unrelated/scratch paths: `.gitignore`, `.pi/`, `progress.md`, `reviews/`, `sdd/`.
