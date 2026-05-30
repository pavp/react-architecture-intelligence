# Claude Code Handoff

Use this file as the starting context for Claude Code sessions in this repo.

## Current State

| Area | Status |
|------|--------|
| Main working branch | `feat/rai-mvp-p0-p3` |
| GitHub repo | `https://github.com/pavp/react-architecture-intelligence` |
| CI | `.github/workflows/ci.yml` runs `pnpm build`, `pnpm test`, `pnpm typecheck` |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` |
| MVP | P0-P3 complete |
| Latest completed slice | C4a / first P4 analyzer slice: render coupling + over-abstraction |

Recent baseline on `feat/rai-mvp-p0-p3`:

```bash
pnpm build
pnpm test       # 142 tests expected
pnpm typecheck
```

## Working Rules

- Use Conventional Commits.
- Never add `Co-Authored-By` or AI attribution.
- Keep changes small and reviewable.
- If a planned PR is likely over 400 changed lines, split it.
- Prefer feature-branch-chain for large integrated work.
- Use squash merge unless user explicitly changes preference.
- Every PR must link an approved issue and have exactly one `type:*` label.
- Do not touch unrelated local files unless user explicitly asks.

Known unrelated local files may exist in the user's worktree:

- `.gitignore`
- `.gga`
- `.mcp.json`

## Architecture Guardrails

- Code is source of truth.
- Config tunes behavior.
- Findings are immutable/append-only.
- Memory changes only through explicit feedback tools.
- LLMs narrate; they must not invent findings or write implicit feedback.
- `packages/core` must stay framework-agnostic.
- New analyzers should be pure synchronous functions over `AnalysisContext` unless a design says otherwise.
- Analyzer failures should use existing diagnostic isolation, not custom try/catch per analyzer.

## Completed Work To Trust

- `wire-deferred-mvp-gaps`: boundary config to `architectural-conflict`, severity clamp, `lastReason`.
- `close-session-feedback`: `close_session` prompts explicit human decisions; no inferred T4 writes.
- `analyzer-fault-containment`: thrown analyzer errors become stable diagnostics; later analyzers still run.
- `more-analyzers-render-overabstraction`: `react/render-coupling` and `react/over-abstraction` analyzers, default registry, MCP wiring, specs archived.
- GitHub repo + CI + PR template are active.
- Roadmap docs are current after PR #10.

## Important Files

| File | Purpose |
|------|---------|
| `docs/superpowers/STATUS.md` | Current status and resume guide |
| `docs/gaps.md` | Known gaps and recommended resolution order |
| `docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md` | Full design spec |
| `openspec/specs/architecture-analysis.md` | Active analyzer/domain behavior spec |
| `openspec/specs/analysis-pipeline.md` | Active analyzer execution/diagnostic spec |
| `openspec/specs/mcp-tools.md` | Active MCP behavior spec |
| `packages/core/src/engine/pipeline.ts` | Analysis execution pipeline |
| `packages/core/src/analyzers/registry.ts` | Default analyzer order |
| `packages/core/src/mcp/tools.ts` | MCP session tools |

## Recommended Next Step

Create formal P4 plan:

```text
docs/superpowers/plans/p4-breadth-temporal.md
```

Plan should cover remaining P4 work in reviewable slices:

1. Drift cold-start decision: no-backfill vs backfill CLI vs graceful no-history response.
2. Snapshot population on analysis runs.
3. `get_drift` MCP tool over persisted snapshots.
4. `query_architecture` MCP tool for bounded graph questions.
5. Lazy ts-morph Pass-2 for `typeOf()` as a separate slice.
6. Remaining analyzer scope decisions: hook topology, boundary violation / convention analyzer.

Recommended first implementation after plan:

```text
snapshot population + get_drift
```

Reason: schema/fingerprint groundwork already exists, and temporal value is core P4 scope.

## GitHub Workflow

For new work:

1. Create or reuse approved issue.
2. Create branch from `feat/rai-mvp-p0-p3`.
3. Implement and run local verification.
4. Push branch and open PR using template.
5. Wait for CI pass.
6. Squash merge when approved.

Useful commands:

```bash
git status --short
pnpm build
pnpm test
pnpm typecheck
gh pr list --repo pavp/react-architecture-intelligence
```
