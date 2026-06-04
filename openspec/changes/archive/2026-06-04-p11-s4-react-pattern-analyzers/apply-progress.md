# Apply Progress: P11-S4 Framework-Neutral Pattern Fact Expansion

## Status

applied

## Workload / PR boundary

- Delivery mode: single fact-only PR.
- Approval: maintainer approved continuing as one PR after forecast exceeded the 400-line review-risk trigger.
- Implementation boundary: additive framework-neutral pattern facts plus parser/graph/catalog tests and catalog fact-kind list update.
- Explicitly avoided: new analyzer/rule id, new finding or evidence variant, CLI/MCP implementation, persistence, snapshots, feedback, memory, docs/status/roadmap updates, canonical spec sync, archive.
- Unrelated/scratch paths remain excluded from intended staging: `.gitignore`, `.pi/`, `progress.md`, `reviews/`, `sdd/`.

## Completed tasks

- Added additive `PatternFact` kinds:
  - `call-binding`
  - `call-argument`
  - `jsx-attribute`
- Added framework-neutral fact interfaces to `packages/core/src/types.ts`.
- Implemented syntax-only extraction in `packages/core/src/parse/pass1.ts`.
- Added strict TDD parser tests for call bindings, call arguments, JSX attributes, bounded unsupported syntax, deterministic argument indexes, and absence of React analyzer/remediation semantics.
- Extended graph-build coverage to verify new facts survive sorted/deduped JSON-safe graph facts.
- Updated React catalog scaffolding fact-kind list and tests to include the new generic facts without adding findings.
- Ran React analyzer regression tests to confirm existing P11 analyzers still pass.

## Files changed

- `packages/core/src/types.ts`
- `packages/core/src/parse/pass1.ts`
- `packages/core/src/parse/pass1.test.ts`
- `packages/core/src/parse/graph-build.test.ts`
- `packages/adapter-react/src/catalog.ts`
- `packages/adapter-react/src/catalog.test.ts`
- `openspec/changes/p11-s4-react-pattern-analyzers/tasks.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/apply-progress.md`

Planning artifacts already present in this change:

- `openspec/changes/p11-s4-react-pattern-analyzers/explore.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/proposal.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/specs/pattern-fact-extraction/spec.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/specs/react-pattern-analyzers/spec.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/specs/react-pattern-catalog/spec.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/design.md`

## TDD Cycle Evidence

| Cycle | Phase | Command / action | Result | Notes |
|------|-------|------------------|--------|-------|
| 1 | RED | Added parser, graph-build, and catalog expectations before implementation. | Tests failed as expected. | Missing `call-binding`, `call-argument`, `jsx-attribute` facts and catalog fact kinds. |
| 1 | RED | `pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts` | Failed: 3 files failed, 5 tests failed, 24 passed. | Establishes RED for new facts and catalog list. |
| 1 | GREEN | Implemented additive fact types, parser extraction, and catalog fact-kind list. | Implementation added no analyzer/rule id/finding/evidence variant. | Core extraction remains syntax-only. |
| 1 | GREEN | `pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts` | Passed: 3 files, 29 tests. | New parser/graph/catalog behavior green. |
| 1 | TRIANGULATE | `pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` | Passed: 4 files, 35 tests. | Existing P11 analyzer behavior still passes. |
| 1 | VERIFY | `pnpm typecheck` | Passed. | Workspace builds and `tsc --noEmit` passed. |
| 1 | VERIFY | `pnpm test && pnpm test:launcher` | Passed: 61 Vitest files / 399 tests plus Go launcher tests. | Full strict TDD test command passed. |
| 1 | VERIFY | `pnpm build && rtk proxy pnpm lint && ./scripts/smoke.sh --build` | Passed. | Build succeeded; core framework-free lint passed; smoke passed 19 checks / 0 failed. |
| 1 | VERIFY | `git diff --check` | Passed. | Whitespace clean. |

## Behavior implemented

### `call-binding`

- Emits for simple identifier bindings initialized by a call expression.
- Fields: `local`, `callee`, `declarationKind`.
- Skips destructuring and unsupported binding patterns.
- Does not resolve symbols, imports, scopes, types, or runtime values.

### `call-argument`

- Emits one fact per call argument.
- Fields: `callee`, `argumentIndex`, `argument`, `argumentKind`.
- Supports bounded kinds: `identifier`, `member`, `literal`, `call`, `unknown`.
- Uses zero-based deterministic indexes.
- Does not evaluate arguments or infer endpoint/framework semantics.

### `jsx-attribute`

- Emits one fact per JSX opening-element attribute.
- Fields: `tag`, `parentTag`, `name`, `value`, `valueKind`.
- Supports bounded value kinds: `absent`, `literal`, `expression`, `spread`, `unknown`.
- Boolean attributes use absent-value form.
- Spread attributes are recorded as bounded spread facts; no expansion is attempted.

## Post-review cleanup

- Fresh implementation review passed with no blockers and noted avoidable formatting churn in `types.ts` / `pass1.ts`.
- Parent rewrote those files from the `HEAD` versions plus targeted P11-S4 changes to reduce review noise while preserving behavior.
- Re-ran focused parser/catalog tests, React analyzer regression tests, LSP diagnostics, and `git diff --check`; all passed.

## Deviations from design

- No `docs/STATUS.md` or `docs/ROADMAP.md` updates were made in this apply slice; leave project status docs for parent closeout after review/verify.
- No canonical spec sync or archive was performed; those belong after verify/review.
- No graph freeze logic change was needed; existing graph fact storage already handles the new primitive-only fact shapes.
- No CLI/MCP implementation changes were needed.

## Remaining tasks

- Run independent review/verify if desired.
- Update `docs/STATUS.md` and `docs/ROADMAP.md` after verification if parent chooses.
- Sync spec deltas into canonical specs after verify passes.
- Write `sync-report.md` and `archive-report.md`.
- Archive the OpenSpec change.
- Prepare PR with explicit staging only, excluding unrelated/scratch files.

## Risks

- Fact volume increases for call-heavy or JSX-attribute-heavy files; facts are compact and primitive-only.
- Complex expressions remain bounded as `unknown` or simple expression summaries; future analyzers must not over-trust these facts as semantic resolution.
- P11-S4 intentionally emits no findings, so user-visible analyzer value arrives in later adapter-owned slices.

## Skill resolution

paths-injected
