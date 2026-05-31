# RAI Roadmap

This is the canonical roadmap after P10. Older roadmap notes in `docs/superpowers/`,
`docs/gaps.md`, and `docs/future-ideas.md` are historical inputs unless this file links
them as active work.

## Current priority order

| Phase | Name | What it adds |
|-------|------|--------------|
| P7 | Distribution + install | Complete: `rai install`, platform auto-detect, MCP config, agent instructions, `rai doctor`, and native dependency / Go CLI distribution decision. |
| P8 | Single-binary distribution | Complete: P8-S1 local Go launcher prototype, P8-S2 release shape, P8-S3a repository workflow/tag/naming policy, P8-S3c governance automation, P8-S3b safe publish gates, release activation, and first installable `v0.1.3` release. |
| P9 | Explainability | Complete: deterministic human output, glossary for evidence terms, additive `explain_finding`, `rai explain <file>`, and README onboarding. |
| P10 | React Pattern Intelligence Foundation | Complete: generic pattern fact extraction for imports, exports, calls, hooks, JSX structure, static members, file roles, and a React catalog scaffold outside core. |
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
- Add P8-S3c governance automation: commitlint conventional defaults, flexible scopes, `pnpm lint:pr-title`, and PR-title CI without semantic-release, real publish activation, branch/default/tag mutation, or mandatory local hooks.
- Add safe publish gates and activation for real channel repository names, exact secrets, manual release preflight, support matrix, and rollback policy without creating tags or publishing artifacts during apply.
- Decide production path and limitations before replacing current TypeScript CLI distribution.

P8 is verified and archived. `v0.1.3` is the first successful installable release. GitHub Release assets, Homebrew formula, and Scoop manifest were generated through GoReleaser; Homebrew install and `rai doctor . --json` passed locally. GoReleaser/manual `vX.Y.Z` tags remain release authority; explicit maintainer authorization is still required before future tag creation. `semantic-release` is not added in P8. P8-S3c commitlint and PR-title CI workflow enforcement are implemented; local hooks stay optional.

Rule: Go may wrap distribution, but RAI facts and analyzer behavior stay governed by the existing engine contracts unless a future design changes them.

## P9 scope notes — complete

P9 makes RAI outputs usable by developers who are not familiar with internal terms.

Delivered capabilities:

- Human-readable explain output alongside JSON where CLI conventions allow it.
- Glossary for `cosine`, `propOverlap`, `hookOverlap`, `sharedSurface`, `groundingFields`, `span`, `diagnostic`, and related graph/topology terms.
- Grounded summaries that explain what RAI found, why it matters, what to inspect first, and what not to assume.
- `rai explain <file>` for finding inspection without an agent session.
- README quick start that explains what RAI does, install path, first commands, how to read findings, current limitations, and next step.

Rule: core facts stay structured; UX explains facts without inventing intent.

## P10 scope notes — complete

P10 is foundation only. It does not try to detect every pattern in one slice.

Delivered capabilities:

- Pattern fact extraction for imports, exports, calls, JSX children, hook usage, static members, and file roles.
- React pattern catalog scaffold outside `packages/core`.
- Fixtures for Modal/Popover compound UI primitives.
- Explainable syntax evidence that future analyzers can consume without emitting findings yet.

Rule: P10 facts are syntax observations only. They must not infer React intent, pattern labels, root cause, or remediation.

## Future-scope guardrails

- RAI can propose patches only when evidence is structural and transformation is mechanical.
- RAI should not auto-apply patches; apply must be explicit and verified.
- RAI should derive team patterns from code/config/feedback, not generic best-practice vibes.
- CI should report net-new findings, not punish old debt.
- Go CLI changes distribution; Go engine changes truth. Do not migrate intelligence/storage modules to Go without golden parity for RepoGraph, spans, fingerprints, findings, DB rows, and MCP JSON.
