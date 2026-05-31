# OpenCode Handoff

OpenCode should use `CLAUDE.md` as the canonical repo handoff. This file exists because OpenCode and other agents commonly look for `AGENTS.md` first.

## Read First

1. Read `CLAUDE.md`.
2. Read `docs/STATUS.md` for current state.
3. Read `docs/ROADMAP.md` before choosing next roadmap work.
4. Treat `docs/superpowers/`, `docs/gaps.md`, and `docs/future-ideas.md` as legacy/historical inputs unless the canonical docs link to them.

## Local Rules

- Main working branch: `feat/rai-mvp-p0-p3`.
- GitHub repo: `https://github.com/pavp/react-architecture-intelligence`.
- Use squash merge unless user says otherwise.
- Every PR must link an approved issue and have exactly one `type:*` label.
- Keep PRs reviewable; split work above 400 changed lines.
- Do not add `Co-Authored-By` or AI attribution.
- Do not touch unrelated local files unless user explicitly asks.

Known unrelated local files may exist:

- `.gitignore`
- `.gga`
- `.mcp.json`

## Next Recommended Work

Start P7 — Distribution + install. First slice should design native dependency strategy, `rai install`, platform auto-detect, and `rai doctor`.
