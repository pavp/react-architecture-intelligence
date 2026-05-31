# RAI Status

This is the canonical project status after P7. Historical status in
`docs/superpowers/STATUS.md` remains useful for archaeology, but new sessions should start here.

## Current state

| Area | Status |
|------|--------|
| Branch | `feat/rai-mvp-p0-p3` now legacy integration; `main` is target trunk/default branch after P8 policy migration. |
| Repo | `https://github.com/pavp/react-architecture-intelligence` |
| Product state | P0–P8 complete; P8-S1 local launcher prototype, P8-S2 release dry-run shape, P8-S3a repository workflow/tag/naming policy, P8-S3c governance automation, P8-S3b safe publish gates, and P8 release activation verified/archived |
| Next phase | P9 explainability |
| Core boundary | `@rai/core` remains framework-agnostic |
| Next adapter | `@rai/adapter-next` loads through CLI composition, not core imports |
| MCP | `analyze_repo`, findings, diagnostics, `explain_finding`, `get_node`, drift/query/refactor tools active |

## Latest verified baseline

Latest full verification after P7:

```bash
pnpm test       # 50 files / 316 tests
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

Latest MCP compatibility fix:

- Commit `fdb7f7f fix(mcp): avoid tuple schema for get node`
- Reason: OpenCode rejected tuple JSON Schema for `rai_get_node.byteRange`.
- Fix: MCP input now uses `{ start, end }`; internal `getNode` still receives `[start, end]`.

## Completed phases

| Phase | Status | Summary |
|-------|--------|---------|
| P0–P3 | Complete | MVP parse → fingerprint → memory → core analyzers → MCP thin slice. |
| P4 | Complete | Breadth + temporal: snapshots, drift, graph tools, backfill, lazy type resolver, more analyzers. |
| P5 | Complete | Codemod proposal/apply safety pipeline, proof persistence, real git workspace adapter. |
| P6 | Complete | Next adapter: detection, variant guard, enrichment, client-boundary-bloat, route-coupling, CLI adapter loading. |
| P7 | Complete | Distribution + install: `rai install`, platform auto-detect, safe config/instruction writes, `rai doctor`, and near-term TypeScript CLI distribution decision. |

## P7 distribution + install

P7 adds adoption tooling without changing the `@rai/core` boundary:

- `rai install` supports `opencode`, `claude-code`, `codex`, and `copilot` with auto-detect or `--platform` overrides.
- Installer supports `--dry-run`, `--yes`, and `--no-instructions`; writes require explicit consent unless dry-run is used.
- JSON MCP configs merge `mcp.rai` while preserving unknown keys; TOML replaces only `[mcp_servers.rai]`.
- Instruction files use `<!-- RAI:BEGIN -->` / `<!-- RAI:END -->` marker ownership and preserve user content outside markers.
- `rai doctor` reports runtime, project root, CLI build, native SQLite/vector readiness, MCP config validity, MCP server construction, and config write suitability.
- Distribution decision: keep near-term CLI in TypeScript, plan prebuilt native bindings next, defer Go wrapper and WASM SQLite/vector to later distribution work.

## P6 real-project smoke

Target: `/Users/macbook/Documents/github/scaffold-nextjs-app`

Result through RAI MCP:

- 21 active opportunities
- 0 conflicts
- 0 suppressed
- 0 engine diagnostics
- severity split: 1 error, 6 warn, 14 info
- top direct duplication: `react/shared-extraction` in `common-grid` family

This validated:

- CLI analysis on a real Next app
- MCP server startup in OpenCode
- `analyze_repo`
- `explain_finding`
- `get_node`
- Next adapter loading without core framework coupling

## Current roadmap

See [`docs/ROADMAP.md`](./ROADMAP.md).

Immediate next work: start P9 explainability. Real publish still requires explicit maintainer tag authorization; Homebrew/Scoop install becomes available only after the first successful vX.Y.Z release makes Homebrew/Scoop install available through generated tap formula and bucket manifest commits.

## P8 single-binary distribution

P8-S1 adds a local Go launcher prototype without changing analyzer truth:

- `cmd/rai` is the Go entrypoint; `internal/launcher` resolves dev/archive engine assets and delegates to `node packages/cli/dist/index.js`.
- Delegated commands preserve argv, stdout/stderr passthrough, MCP stdout cleanliness, and child exit codes.
- `rai version` is Go-owned and reports launcher/engine/runtime/platform metadata.
- Archive mode validates `lib/rai/metadata.json` asset schema and platform before starting the TypeScript engine.
- Local scripts: `pnpm build:launcher`, `pnpm test:launcher`, and `scripts/smoke-launcher.sh`.
- P8-S2 adds dry-run release shape only: `.goreleaser.yaml`, `pnpm release:check`, `pnpm release:prepare`, `scripts/install-rai.sh`, and `docs/release-maintainer-checklist.md`.
- P8-S3a adds `docs/repository-workflow.md` plus read-only release checks for `main` trunk/default branch target, retirement of legacy `feat/rai-mvp-p0-p3` after P8, branch naming, Conventional Commit commit/PR titles, PR template use, stable `vX.Y.Z` tags, optional `vX.Y.Z-rc.N` tags, immutable published tags, rollback through new patch/prerelease tags, and manual maintainer gates.
- P8-S3c adds commitlint conventional defaults, flexible scopes, `pnpm lint:pr-title`, and PR-title CI on `pull_request` `opened`, `edited`, `synchronize`, and `reopened` events.
- GoReleaser/manual `vX.Y.Z` tags remain release authority; `semantic-release`, branch/default/tag mutation, and mandatory local hooks remain out of scope.
- P8-S3b replaces GoReleaser Homebrew/Scoop placeholders with real channel repo names `pavp/homebrew-tap` and `pavp/scoop-bucket`, adds read-only publish readiness validation, and adds a manual `workflow_dispatch` release preflight that runs GoReleaser snapshot with `--skip=publish`.
- GoReleaser publishing is enabled in config but guarded by release workflow tag regex, `origin/main` ancestry, exact secrets, `pnpm release:check`, tests, typecheck, build, release prepare, and dry-run preflight.
- Channel repos `pavp/homebrew-tap` and `pavp/scoop-bucket` are initialized with `main` and README only; first Formula/bucket manifest generation remains pending first successful real release.
- Remaining publish blocker: explicit post-verify maintainer authorization to create a manual `vX.Y.Z`/`vX.Y.Z-rc.N` tag. Apply created no tag or release.

## Active guardrails

- Code is source of truth.
- Config tunes behavior.
- Findings are immutable/append-only.
- Memory changes only through explicit feedback tools.
- LLMs narrate; they must not invent findings or write implicit feedback.
- `packages/core` must stay framework-agnostic.
- Adapter code belongs outside core.
- Keep changes reviewable; split work above 400 changed lines unless user accepts exception.

## Useful commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
git status --short
```
