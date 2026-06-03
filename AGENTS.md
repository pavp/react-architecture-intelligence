# OpenCode Handoff

OpenCode should use `CLAUDE.md` as the canonical repo handoff. This file exists because OpenCode and other agents commonly look for `AGENTS.md` first.

## Read First

1. Read `CLAUDE.md`.
2. Read `docs/STATUS.md` for current state.
3. Read `docs/ROADMAP.md` before choosing next roadmap work.
4. Treat `docs/superpowers/`, `docs/gaps.md`, and `docs/future-ideas.md` as legacy/historical inputs unless the canonical docs link to them.

## Local Rules

- Main working branch: `main`.
- GitHub repo: `https://github.com/pavp/react-architecture-intelligence`.
- Use squash merge unless user says otherwise.
- All app changes must land through a PR before reaching `main`; do not commit directly to `main`.
- Keep exactly one `type:*` label on PRs when labels are used.
- Keep PRs reviewable; split work above 400 changed lines.
- Do not add `Co-Authored-By` or AI attribution.
- Do not touch unrelated local files unless user explicitly asks.

Known unrelated local files may exist:

- `.gitignore`
- `.gga`
- `.mcp.json`

## Next Recommended Work

Start P9 — Explainability. First slice should improve human-readable findings, glossary terms, `rai explain` UX, and README onboarding without changing core facts.
