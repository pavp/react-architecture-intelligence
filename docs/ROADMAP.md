# RAI Roadmap

This is the canonical roadmap after P7. Older roadmap notes in `docs/superpowers/`,
`docs/gaps.md`, and `docs/future-ideas.md` are historical inputs unless this file links
them as active work.

## Current priority order

| Phase | Name | What it adds |
|-------|------|--------------|
| P7 | Distribution + install | Complete: `rai install`, platform auto-detect, MCP config, agent instructions, `rai doctor`, and native dependency / Go CLI distribution decision. |
| P8 | Single-binary distribution | In progress: P8-S1 local Go launcher prototype, P8-S2 dry-run release shape, and P8-S3a repository workflow/tag/naming policy implemented; P8-S3b real publish activation remains maintainer-gated. |
| P9 | Explainability | Human output, glossary for evidence terms, improved `explain_finding`, and `rai explain <file>`. |
| P10 | React Pattern Intelligence Foundation | Builds the fact layer for broad React pattern detection: imports, exports, calls, hooks, JSX structure, static members, file roles, and a pattern catalog. |
| P11 | React Pattern Analyzers + Pattern Drift | Detects concrete repo-derived patterns and divergences: compound components, container/presenter, controlled/uncontrolled, provider/context, forms, data fetching, design-system usage, overlays, and API conventions. |
| P12 | CI/PR integration | Brings RAI into review: `rai check --diff`, GitHub PR comments, and net-new findings only. |
| P13 | Calibration | Reduces noise per repo: `rai calibrate`, threshold suggestions from feedback, and no automatic config changes. |
| P14 | Deeper graph | Expands structural intelligence: `passes` edges, prop drilling, import/call topology, and `exportKind` use in analyzers/codemods. |
| P15 | Team memory | Shares decisions across developers: committable/importable T4/T5 feedback and “already decided” UX. |
| P16 | Safe code proposals | Lets RAI propose patch previews for high-evidence mechanical refactors, with explicit apply, preflight hashes, verification, and rollback. |
| P17 | Always-fresh analysis | Keeps findings current without manual `rai analyze`: watch mode, hooks, and incremental local analysis. |
| P18 | Architecture reporting | Adds leadership/reporting views: sprint digest, architecture changelog, and onboarding reports. |
| P19 | Go Runtime / Engine Parity | Evaluates migrating runtime/storage/intelligence pieces to Go only behind golden parity, so results stay identical before any engine replacement. |
| P20 | Advanced intelligence | Explores longer-term ideas: learned embeddings, consequence-aware prioritization, and cross-repo architectural memory. |

## P7 scope notes — complete

P7 is first because adoption friction blocks all later value.

Delivered capabilities:

- `rai install` defaults to auto-detecting supported platforms.
- Initial supported platforms: `opencode`, `claude-code`, `codex`, `copilot`.
- `--platform` overrides auto-detect.
- `--dry-run`, `--yes`, and `--no-instructions` control safety and output.
- Installer writes MCP config plus bounded RAI routing instructions.
- Existing files are preserved; generated blocks use markers.
- `rai doctor` checks native dependencies, SQLite/vector support, MCP config, paths, and build/runtime health.
- Distribution decision keeps near-term TypeScript CLI, plans prebuilt native bindings next, defers Go wrapper, and defers WASM SQLite/vector until vector support is viable.

## P8 scope notes

P8 targets the remaining distribution pain: using RAI without Node/native build friction.

Planned capabilities:

- Evaluate a Go CLI wrapper as the single-binary distribution path. P8-S1 local prototype is implemented under `cmd/rai` and `internal/launcher`.
- Define boundary between Go CLI, TypeScript engine, and MCP stdio server. Current boundary keeps the TypeScript engine as source of truth and reserves launcher diagnostics for stderr.
- Prototype command pass-through for `install`, `doctor`, `analyze`, and `mcp`. Current launcher preserves argv, stdout/stderr passthrough, and child exit codes.
- Compare packaging options: embedded Node/runtime, sidecar Node server, or subprocess to installed JS engine.
- Define dry-run release shape with disabled publish, portable archive layout, validation script, install-script placeholder, and maintainer checklist.
- Define repository workflow policy: `main` trunk/default branch target, short-lived work-unit branches, branch naming, Conventional Commit commit/PR titles, PR template use, legacy `feat/rai-mvp-p0-p3` retirement after P8, PR gates, release tag policy, rollback policy, and manual mutation gates.
- Decide production path and limitations before replacing current TypeScript CLI distribution.

Next P8 slice: P8-S3b real publish activation only after maintainer-created repositories, tokens, permissions, protected `main`/tags, and support policy exist. Real publishing remains blocked. GoReleaser/manual `vX.Y.Z` tags remain release authority; `semantic-release` is not added in P8. Future P8-S3c may add commitlint and PR-title CI workflow enforcement; local hooks stay optional later.

Rule: Go may wrap distribution, but RAI facts and analyzer behavior stay governed by the existing engine contracts unless a future design changes them.

## P9 scope notes

P9 makes RAI outputs usable by developers who are not familiar with internal terms.

Planned capabilities:

- Human output mode alongside JSON.
- Glossary for `cosine`, `propOverlap`, `hookOverlap`, `sharedSurface`, `groundingFields`, `span`, and `diagnostic`.
- Grounded summaries that explain what RAI found, why it matters, what to inspect first, and what not to assume.
- `rai explain <file>` for memory/finding inspection without an agent session.

Rule: core facts stay structured; UX explains facts without inventing intent.

## P10 scope notes

P10 is foundation only. It does not try to detect every pattern in one slice.

Planned capabilities:

- Pattern fact extraction for imports, exports, calls, JSX children, hook usage, static members, and file roles.
- Pattern catalog design for known React patterns and repo-derived patterns.
- Fixtures for examples such as Modal/Popover compound UI primitives.
- Explainable evidence that future analyzers can consume.

## Future-scope guardrails

- RAI can propose patches only when evidence is structural and transformation is mechanical.
- RAI should not auto-apply patches; apply must be explicit and verified.
- RAI should derive team patterns from code/config/feedback, not generic best-practice vibes.
- CI should report net-new findings, not punish old debt.
- Go CLI changes distribution; Go engine changes truth. Do not migrate intelligence/storage modules to Go without golden parity for RepoGraph, spans, fingerprints, findings, DB rows, and MCP JSON.
