# Claude Code Handoff

Use this file as the stable entry point for agent sessions in this repo. Do not treat it as the current roadmap snapshot.

## Start Here

1. Read `docs/STATUS.md` for current project state and latest verified baseline.
2. Read `docs/ROADMAP.md` before choosing next roadmap work.
3. Read active OpenSpec changes when working inside an SDD phase.
4. Treat Engram as the source for recent session memory and SDD progress.

## Stable Project Facts

| Area | Value |
|------|-------|
| Main working branch | `main` |
| GitHub repo | `https://github.com/pavp/react-architecture-intelligence` |
| Canonical status | `docs/STATUS.md` |
| Canonical roadmap | `docs/ROADMAP.md` |
| Canonical OpenSpec specs | `openspec/specs/` |

## Working Rules

- Use Conventional Commits.
- Never add `Co-Authored-By` or AI attribution.
- Keep changes small and reviewable.
- Split planned PRs above 400 changed lines unless the maintainer accepts a size exception.
- Prefer feature-branch-chain for large integrated work.
- Use squash merge unless the user explicitly changes preference.
- Every PR must link an approved issue and have exactly one `type:*` label.
- Do not touch unrelated local files unless the user explicitly asks.

Known unrelated local files may exist in the user's worktree:

- `.gitignore`
- `.gga`
- `.mcp.json`

## Architecture Guardrails

- Code is source of truth.
- Config tunes behavior.
- Findings are immutable and append-only.
- Memory changes only through explicit feedback tools.
- LLMs narrate; they must not invent findings or write implicit feedback.
- `packages/core` must stay framework-agnostic.
- Adapter code belongs outside core.
- New analyzers should be pure synchronous functions over `AnalysisContext` unless a design says otherwise.
- Analyzer failures should use existing diagnostic isolation, not custom try/catch per analyzer.

## Current Capability Summary

Use `docs/STATUS.md` for exact current state. At a high level, RAI already includes:

- Parse, fingerprint, memory, core analyzers, MCP tools, and CLI flows.
- Breadth + temporal analysis: snapshots, drift, graph tools, backfill, lazy type resolver, and more analyzers.
- Codemod proposal/apply safety pipeline with proof persistence and git workspace adapter.
- Next adapter detection, variant guard, enrichment, and adapter loading outside core.
- Distribution/install tooling and ongoing portable launcher distribution work.

## Important Files

| File | Purpose |
|------|---------|
| `docs/STATUS.md` | Current state, latest verified baseline, and resume guide |
| `docs/ROADMAP.md` | Current priority order and phase scope |
| `openspec/specs/architecture-analysis.md` | Analyzer/domain behavior spec |
| `openspec/specs/analysis-pipeline.md` | Analyzer execution/diagnostic spec |
| `openspec/specs/mcp-tools.md` | MCP behavior spec |
| `packages/core/src/engine/pipeline.ts` | Analysis execution pipeline |
| `packages/core/src/analyzers/registry.ts` | Default analyzer order |
| `packages/core/src/mcp/tools.ts` | MCP session tools |

## Useful Commands

```bash
git status --short
pnpm build
pnpm test
pnpm typecheck
pnpm lint
gh pr list --repo pavp/react-architecture-intelligence
```

## Rule for This File

Keep `CLAUDE.md` stable. Do not duplicate live roadmap status here; update `docs/STATUS.md` and `docs/ROADMAP.md` instead.
