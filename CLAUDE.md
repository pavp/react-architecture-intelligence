# Claude Code Handoff

Use this file as the starting context for Claude Code sessions in this repo.

## Current State

| Area | Status |
|------|--------|
| Main working branch | `feat/rai-mvp-p0-p3` |
| GitHub repo | `https://github.com/pavp/react-architecture-intelligence` |
| CI | `.github/workflows/ci.yml` runs `pnpm build`, `pnpm test`, `pnpm typecheck` |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` |
| Product state | P0-P6 complete |
| Current roadmap | `docs/ROADMAP.md` |
| Current status | `docs/STATUS.md` |
| Next phase | P7 — Distribution + install |

Recent verified baseline on `feat/rai-mvp-p0-p3`:

```bash
pnpm test       # 45 files / 286 tests expected after P6
pnpm typecheck
pnpm build
pnpm lint
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

- P0-P3 MVP: parse, fingerprint, memory, core analyzers, MCP.
- P4 breadth + temporal: snapshots, drift, graph tools, backfill, lazy type resolver, more analyzers.
- P5 codemod apply: proposal/apply safety pipeline, proof persistence, git workspace adapter.
- P6 Next adapter: detection, variant guard, enrichment, client-boundary-bloat, route-coupling, CLI adapter loading.
- MCP OpenCode compatibility fix: `get_node.byteRange` uses object schema at MCP boundary.

## Important Files

| File | Purpose |
|------|---------|
| `docs/STATUS.md` | Canonical current status and resume guide |
| `docs/ROADMAP.md` | Canonical post-P6 roadmap |
| `docs/gaps.md` | Legacy audit of gaps; not canonical roadmap |
| `docs/future-ideas.md` | Legacy idea bank; promote ideas to ROADMAP before implementation |
| `docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md` | Full design spec |
| `openspec/specs/architecture-analysis.md` | Active analyzer/domain behavior spec |
| `openspec/specs/analysis-pipeline.md` | Active analyzer execution/diagnostic spec |
| `openspec/specs/mcp-tools.md` | Active MCP behavior spec |
| `packages/core/src/engine/pipeline.ts` | Analysis execution pipeline |
| `packages/core/src/analyzers/registry.ts` | Default analyzer order |
| `packages/core/src/mcp/tools.ts` | MCP session tools |

## Recommended Next Step

Start P7 — Distribution + install.

First slice should design:

1. Native dependency strategy: prebuilt bindings vs Go CLI wrapper vs WASM SQLite.
2. `rai install` with auto-detect for `opencode`, `claude-code`, `codex`, and `copilot`.
3. Safe MCP config + agent instruction writes with markers.
4. `rai doctor` for environment, MCP, and runtime checks.

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
