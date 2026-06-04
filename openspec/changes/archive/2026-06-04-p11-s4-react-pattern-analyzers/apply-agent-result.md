status: complete

red_evidence:
- Loaded `/Users/macbook/.config/opencode/skills/work-unit-commits/SKILL.md` before work.
- Strict TDD active from `openspec/config.yaml`; no external strict-TDD support file found.
- Wrote RED tests first in:
  - `packages/core/src/parse/pass1.test.ts`
  - `packages/core/src/parse/graph-build.test.ts`
  - `packages/adapter-react/src/catalog.test.ts`
- RED command: `pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts`
- RED result: failed as expected before implementation — 3 files failed, 5 tests failed, 24 passed. Failures were missing `call-binding`, `call-argument`, `jsx-attribute`, and updated catalog fact kinds.

green_evidence:
- Implemented additive, framework-neutral pattern facts:
  - `call-binding`
  - `call-argument`
  - `jsx-attribute`
- Implementation changed no analyzer/rule id/finding/evidence variant/MCP/persistence/snapshot/feedback behavior.
- Focused GREEN command: `pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts`
- Focused GREEN result: passed, 3 files / 29 tests.
- Triangulation command: `pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts`
- Triangulation result: passed, 4 files / 35 tests.

files_changed:
- `packages/core/src/types.ts`
- `packages/core/src/parse/pass1.ts`
- `packages/core/src/parse/pass1.test.ts`
- `packages/core/src/parse/graph-build.test.ts`
- `packages/adapter-react/src/catalog.ts`
- `packages/adapter-react/src/catalog.test.ts`
- `openspec/changes/p11-s4-react-pattern-analyzers/tasks.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/apply-progress.md`
- `openspec/changes/p11-s4-react-pattern-analyzers/apply-agent-result.md`

tests_run:
- `pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts` — RED failed before implementation, then GREEN passed 3 files / 29 tests.
- `pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts` — passed 4 files / 35 tests.
- `pnpm typecheck` — passed.
- `pnpm test && pnpm test:launcher` — passed 61 Vitest files / 399 tests plus Go launcher tests.
- `pnpm build && rtk proxy pnpm lint && ./scripts/smoke.sh --build` — passed; smoke: 19 passed / 0 failed.
- `git diff --check` — passed.

blockers:
- None.

risks:
- Fact volume increases for call-heavy and JSX-heavy files, but facts are compact primitive-only records.
- Complex expressions are intentionally bounded as simple summaries or `unknown`; future analyzers must not treat these facts as symbol/type/runtime resolution.
- P11-S4 is fact-only, so no new user-visible React finding is emitted until a later adapter-owned analyzer slice.

next_recommended:
- Run independent review/verify if desired.
- Parent can update `docs/STATUS.md` and `docs/ROADMAP.md` after verification.
- Then sync canonical specs, write sync/archive reports, archive the OpenSpec change, and prepare PR with explicit staging only.
- Continue excluding `.gitignore`, `.pi/`, `progress.md`, `reviews/`, and `sdd/` from staging.

skill_resolution: paths-injected

memory:
- Engram memory tools were unavailable in this subagent toolset; progress persisted in OpenSpec files instead.
