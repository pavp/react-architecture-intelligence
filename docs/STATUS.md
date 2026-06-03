# RAI Status

This is the canonical project status after P9-S2 and P11-S2. Historical status in
`docs/superpowers/STATUS.md` remains useful for archaeology, but new sessions should start here.

## Current state

| Area | Status |
|------|--------|
| Branch | `main` is trunk/default; legacy `feat/rai-mvp-p0-p3` was deleted after the first successful release. |
| Repo | `https://github.com/pavp/react-architecture-intelligence` |
| Product state | P0–P10 complete plus P9-S2, P11-S1, and P11-S2; first installable release `v0.1.3` published through GitHub Release, Homebrew tap, and Scoop bucket. |
| Next phase | P9-S3 Human Output Coverage Audit, then P11-S3 React pattern analyzers |
| Core boundary | `@rai/core` remains framework-agnostic |
| Next adapter | `@rai/adapter-next` loads through CLI composition, not core imports |
| MCP | `analyze_repo`, findings, diagnostics, additive explainability in `explain_finding`, `get_node`, drift/query/refactor tools active |

## Latest verified baseline

Latest release verification after P8:

```bash
pnpm release:check
pnpm test       # 52 files / 326 tests
pnpm typecheck
pnpm build
pnpm lint
git diff --check
gh release view v0.1.3 --repo pavp/react-architecture-intelligence
brew fetch pavp/tap/rai
brew install pavp/tap/rai
rai doctor . --json
```

Latest published release:

- `v0.1.3`: first successful installable release; GitHub Release published with darwin/linux/windows amd64/arm64 archives plus `checksums.txt`.
- Homebrew formula: `pavp/homebrew-tap/Formula/rai.rb` references `0.1.3` and passed `brew fetch pavp/tap/rai`.
- Scoop manifest: `pavp/scoop-bucket/rai.json` references `0.1.3`.
- Failed immutable tags retained for audit: `v0.1.0`, `v0.1.1`, `v0.1.2`.

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
| P8 | Complete | Single-binary distribution: Go launcher prototype, release shape/governance, safe publish gates, and first installable `v0.1.3` release. |
| P9 | Complete | Explainability: deterministic explanation envelope, glossary, additive MCP `explain_finding`, `rai explain <file>`, README onboarding, and analyzer-owned human explanation hooks for high-quality adapter explanations. |
| P10 | Complete | React Pattern Intelligence Foundation: generic syntax facts, React catalog scaffold outside core, compound primitive fixtures, and OpenSpec specs. |
| P11-S1 | Complete | First React pattern analyzer slice: `react/compound-component-api-drift` in `@rai/adapter-react`, CLI/MCP adapter composition, drift terminology, and OpenSpec specs `react-pattern-analyzers`, `pattern-drift`, `cli-adapter-loading`. |
| P11-S2 | Complete | Container/presenter role-name divergence slice: `react/container-presenter-role-drift` in `@rai/adapter-react`, grounded in existing component names, file paths, direct render edges, and high-signal presenter hook calls. |

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

Immediate next work: start P9-S3 Human Output Coverage Audit to upgrade remaining human-facing RAI outputs while preserving machine-facing JSON/MCP contracts. After P9-S3, continue P11-S3, the next React pattern analyzer family (for example provider/context or controlled/uncontrolled). Release publishing remains manual: create a new `vX.Y.Z`/`vX.Y.Z-rc.N` tag from `main` only after checks and maintainer approval.

## P11 React Pattern Analyzers + Pattern Drift

P11 now has two concrete React pattern analyzer slices on top of P10 pattern facts, without changing the `@rai/core` boundary.

### P11-S2 Container/Presenter Role Divergence

P11-S2 adds the second adapter-owned React analyzer:

- `@rai/adapter-react` now also ships `react/container-presenter-role-drift`.
- The analyzer reports only observed current-source container/presenter role-name and syntax divergence: a container-like component directly renders a presenter-like component, and the presenter-like component has high-signal hook evidence.
- Evidence is grounded in existing graph facts: component names, file/path role seeds, direct `renders` edges, presenter `hookCalls`, hook-call spans when available, and stable SHA fingerprints.
- Finding language remains bounded to observed role-name/syntax divergence. It does not claim wrong architecture, team intent, root cause, historical change, or required remediation.
- Implementation stays in `packages/adapter-react`; `@rai/core` remains framework-agnostic and no provider/context, controlled/uncontrolled, forms, data-fetching, design-system, overlay, or broad API-convention findings are emitted.

Latest P11-S2 verification:

```bash
pnpm test       # 60 files / 380 tests
pnpm test:launcher
pnpm typecheck
pnpm build
rtk proxy pnpm lint
./scripts/smoke.sh --build  # includes human-readable react/container-presenter-role-drift CLI smoke
git diff --check
```

### P11-S1 Compound Component API Drift

P11-S1 delivers the first concrete React pattern analyzer on top of P10 pattern facts, without changing the `@rai/core` boundary:

- `@rai/adapter-react` ships `react/compound-component-api-drift`, which detects compound-component API divergence from grounded `RepoGraph.patternFacts` syntax evidence.
- The analyzer is pure and deterministic: it reads pattern facts, sorts/freezes evidence, uses stable SHA fingerprints, and performs no fs/network/memory/config/clock/random/LLM writes.
- CLI/MCP composition loads the React adapter through the same registry factory as the Next adapter, so `analyze_repo`, findings, and diagnostics see the React findings without core framework coupling and without a new MCP drift tool.
- Drift terminology stays distinct: current-source findings use repo-local divergence wording; historical change wording stays in existing `get_drift` snapshot results.
- OpenSpec specs added/updated: `react-pattern-analyzers`, `pattern-drift`, and `cli-adapter-loading`.
- Deferred to later P11 slices (no findings emitted yet): provider/context, controlled/uncontrolled, forms, data fetching, design-system usage, overlays beyond compound primitives, and broad API conventions.
- Deferred PR3 follow-ups (optional, non-blocking): backfill/snapshot/`get_drift` parity test coverage and `rai explain <file>` / file-ref parity test coverage.

Latest P11-S1 verification:

```bash
pnpm test       # 59 files / 365 tests
pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## P10 React Pattern Intelligence Foundation

P10 adds deterministic foundation facts for later React pattern analyzers without adding findings yet:

- `RepoGraph.patternFacts` carries sorted/deduped/frozen syntax facts.
- Core extracts imports, exports, calls, hook-like calls, JSX parent/child tags, member assignments, and file-role seeds.
- `@rai/core` remains framework-agnostic: facts describe syntax only and do not include React catalog names or intent claims.
- `packages/adapter-react` holds React catalog scaffolding outside core and currently emits no findings or memory writes.
- Modal/Popover fixtures cover compound primitive syntax evidence for future analyzers.
- OpenSpec specs added: `pattern-fact-extraction` and `react-pattern-catalog`.

Latest P10 verification:

```bash
pnpm test       # 57 files / 351 tests
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## P9 explainability

P9 makes existing RAI facts easier to understand without changing analyzer truth:

- Core explainability helpers derive bounded summaries, inspect-first guidance, limits, grounding fields, and glossary entries from existing findings.
- MCP `explain_finding` returns raw finding data plus an additive `explanation` envelope.
- CLI `rai explain <file>` shows relevant findings for a file in human-readable output, with JSON support following existing CLI conventions.
- P9-S2 adds an analyzer-owned explanation hook so adapters can provide high-quality human wording without moving adapter semantics into `@rai/core`.
- `react/container-presenter-role-drift` now explains the concrete observation in human language: a container-like component renders a presenter-like component, and the presenter-like side has high-signal hook evidence.
- Next explainability slice: P9-S3 Human Output Coverage Audit for remaining human-facing RAI outputs, including other analyzers and CLI UX surfaces.
- Root `README.md` gives new users a quick path: install, doctor, analyze, explain, reading guide, glossary, limits, and next step.
- Guardrail: human-facing presentation explains facts; machine-facing JSON/raw evidence stays stable and structured; presentation does not infer intent, ownership, root cause, or remediation not present in evidence.

Latest P9/P11 explainability verification:

```bash
pnpm test       # 56 files / 344 tests
pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

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
- GoReleaser publishing is enabled in config but guarded by release workflow tag regex, `origin/main` ancestry, exact secrets, `pnpm release:check`, tests, typecheck, build, and GoReleaser-owned release asset preparation.
- `v0.1.3` is the first successful real release. It generated GitHub Release assets, `pavp/homebrew-tap/Formula/rai.rb`, and `pavp/scoop-bucket/rai.json`.
- Homebrew install was verified locally with `brew install pavp/tap/rai`; installed `rai doctor . --json` passed.
- Failed tags `v0.1.0`, `v0.1.1`, and `v0.1.2` are immutable audit history and must not be moved or reused.

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
