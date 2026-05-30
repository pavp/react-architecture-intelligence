# Continue From Claude Code

Use this prompt in Claude Code from the repository root.

```text
Actúa como Gentle AI SDD orchestrator para react-architecture-intelligence.

Read first:
- CLAUDE.md
- AGENTS.md
- docs/superpowers/STATUS.md
- docs/gaps.md

Mode:
- Continue automatically unless there is a real doubt, blocker, scope risk, conflict, or decision point.
- Artifact store: hybrid (`openspec/changes/...` + Engram if available).
- Use strict TDD for implementation work.
- Keep changes small and reviewable; split anything likely above 400 changed lines.
- Use squash merge unless I explicitly say otherwise.
- Never add `Co-Authored-By` or AI attribution.
- Do not touch unrelated `.gitignore`, `.gga`, or `.mcp.json` changes.

Current branch:
- Work from `feat/rai-mvp-p0-p3`.

Goal:
- Start next roadmap step: create formal P4 plan at `docs/superpowers/plans/p4-breadth-temporal.md`.
- The plan should cover remaining P4 work: drift cold-start decision, snapshot population, `get_drift`, `query_architecture`, lazy ts-morph Pass-2, and remaining analyzer scope decisions.
- After plan, recommend first implementation slice: snapshot population + `get_drift`.

Before writing code:
- Check current git status.
- Confirm latest docs and specs.
- Create/reuse an approved GitHub issue before opening any PR.

Verification expectations:
- For docs-only work: run `git diff --check` and rely on GitHub Actions CI.
- For implementation: run `pnpm build`, `pnpm test`, and `pnpm typecheck`.
```
