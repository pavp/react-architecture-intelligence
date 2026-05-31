# Exploration: P8 — Single-binary distribution / Go CLI wrapper

P8 should not replace the TypeScript engine yet. Best first slice is a distribution design + thin Go wrapper prototype that proves command pass-through and release packaging while preserving current analyzer/core contracts.

## Current State

### Facts from repo

- `docs/STATUS.md` and `docs/ROADMAP.md` mark P7 complete and P8 next: evaluate/prototype a Go CLI wrapper for zero-runtime-dependency distribution while preserving the TypeScript engine boundary.
- Root `package.json` requires Node `>=22`, uses pnpm, and only allows native build scripts for `better-sqlite3`.
- `packages/core/package.json` depends on `better-sqlite3`, `sqlite-vec`, `oxc-parser`, `ts-morph`, `zod`, and `@modelcontextprotocol/sdk`.
- `packages/cli/package.json` exposes `rai` as `./dist/index.js` and depends on `@rai/core` plus `@rai/adapter-next`.
- `packages/cli/src/cli.ts` implements `analyze`, `backfill`, `install`, `doctor`, and `mcp`; `mcp` serves stdio through the current TypeScript/Node engine.
- `packages/cli/src/install/plan.ts` generates MCP configs that run `rai mcp <projectRoot>`.
- `packages/cli/src/doctor.ts` checks Node `>=22`, project root, CLI build, native SQLite/vector readiness, MCP config validity, MCP server construction, and config write suitability.
- `.github/workflows/ci.yml` only runs Ubuntu + Node 22 + pnpm build/test/typecheck/lint; no release matrix exists yet.
- `openspec/specs/distribution-install/spec.md` records P7 strategy: TypeScript CLI near term, prebuilt native bindings next, Go wrapper later, WASM deferred.

### Assumptions needing external verification

- Whether embedding Node/libnode inside a Go binary is legally, operationally, and release-size acceptable for RAI.
- Whether `better-sqlite3` and `sqlite-vec` prebuilt coverage is sufficient for target triples: macOS arm64/x64, Linux x64/arm64 glibc, Linux musl, Windows x64/arm64.
- Whether `oxc-parser` and other transitive packages introduce native/platform constraints in packaged release builds.
- Whether Homebrew bottles can ship a Node runtime sidecar or should depend on `node@22`.
- Whether winget needs MSI/MSIX/exe metadata for the intended UX, versus Scoop/Chocolatey accepting zip/tar assets faster.
- Whether corporate/user environments prefer `npm install -g @rai/cli`, `brew install rai`, or curl/tarball installs as primary path.

## Affected Areas

- `packages/cli/src/cli.ts` — current command boundary and pass-through target for any wrapper.
- `packages/cli/src/install/plan.ts` — generated MCP command currently assumes `rai mcp <root>`; wrapper must preserve this contract or version it.
- `packages/cli/src/doctor.ts` — health checks must distinguish wrapper, Node runtime, JS engine bundle, and native binding readiness.
- `packages/cli/package.json` — npm/bin metadata, published package shape, and bundled JS engine entry.
- `packages/core/package.json` — native dependency release constraints.
- `package.json` / `pnpm-lock.yaml` — Node requirement and native build behavior.
- `.github/workflows/ci.yml` — must grow release matrix for OS/arch packaging if P8 proceeds.
- `openspec/specs/distribution-install/spec.md` — may need new distribution requirements after proposal/spec.

## Approaches

| Approach | Fit | Pros | Cons | Effort |
|---|---:|---|---|---|
| Go wrapper shells to bundled/external Node/TS engine | Strong bridge | Preserves TypeScript engine; smallest behavior risk; can prototype command pass-through quickly; wrapper can improve install UX and diagnostics. | External Node variant is not zero-runtime; bundled Node sidecar is larger and platform-specific; still must solve native addons. | Medium |
| Go wrapper with embedded JS bundle/runtime | Weak near-term | True single executable if feasible; clean UX. | Current engine uses Node APIs, ESM packages, MCP SDK, and native addons; embedded JS runtimes like goja/QuickJS will not run it unchanged; libnode embedding is complex and needs external verification. | High |
| Native Go rewrite of CLI only, TS engine unchanged | Partial | `install` and basic `doctor` could be zero-runtime; Go can own package-manager UX and platform detection. | `analyze`/`mcp` still need Node/TS engine, so product is not truly single-binary; duplicates CLI parsing/install logic; risks drift from TS tests. | Medium |
| Prebuilt native binding release path | Strong bridge | Reduces current install failures without changing architecture; aligns with P7 decision; supports npm fallback and release tarballs. | Still requires Node >=22; native matrix/release automation needed; musl/Windows coverage needs verification. | Medium |
| Package manager channels | Required distribution layer | Homebrew + GitHub Releases cover macOS/Linux early; npm fallback preserves current users; Scoop/Chocolatey/winget can follow for Windows. | Each channel has manifest/release maintenance; Windows UX needs packaging choice; Homebrew may resist vendored Node without bottle strategy. | Medium |

## Comparison Notes

### 1. Go wrapper that shells to bundled/external Node/TS engine

Best bridge for P8. Wrapper can own UX (`rai install`, `rai doctor`, command dispatch), but should initially delegate every command to the existing built JS CLI. Two variants matter:

- External Node: wrapper locates `node >=22` and JS engine. Fastest prototype; not zero-runtime.
- Bundled runtime sidecar: release tarball includes Go launcher, Node runtime, JS bundle, and native bindings for one platform. Better UX; not literally one file unless wrapper extracts embedded assets.

Recommended for first slice because it proves boundaries without rewriting core.

### 2. Go wrapper with embedded JS bundle/runtime

Not recommended as first implementation. RAI is not browser JS; it relies on Node runtime behavior and native packages. A true embedded runtime would force either libnode embedding or major engine changes. That is a distribution research project, not a reviewable P8 slice.

### 3. Native Go rewrite of CLI only with TS engine unchanged

Useful only if scoped as a bootstrapper/launcher. Rewriting `install` and `doctor` in Go before the engine distribution strategy is settled creates duplicate behavior. If chosen, keep Go logic thin and treat TS CLI as source of truth until design says otherwise.

### 4. Prebuilt native binding release path as alternative/bridge

This remains the lowest-risk adoption improvement. It will not remove Node, but it can remove most native-build friction while P8 explores wrapper packaging. It also benefits npm fallback and any bundled runtime release.

### 5. Package manager channels

Recommended channel sequence:

1. GitHub Release tarballs/zips per platform as canonical artifacts.
2. Homebrew tap for macOS and Linux pointing at those artifacts.
3. npm fallback for current TypeScript CLI users.
4. Scoop for Windows zip-based install once asset layout is stable.
5. winget/Chocolatey after Windows packaging and update semantics are chosen.

## Recommendation

Proceed with P8 as a two-track bridge, not a rewrite:

1. Define a stable distribution contract: platform triples, asset layout, launcher-to-engine boundary, doctor checks, and package-manager expectations.
2. Prototype a thin Go launcher that delegates `install`, `doctor`, `analyze`, and `mcp` to the existing JS CLI, first with external Node, then with one bundled-runtime release asset if verified.

Do not attempt embedded JS runtime or Go engine rewrite in the first P8 slice. The important architecture boundary is: Go may launch/distribute, but TypeScript remains source of analyzer behavior.

## Decisions to Ask User Before Proposal

1. Primary install promise: should P8 target true zero-runtime install first, or accept a Homebrew/npm bridge that may depend on Node while reducing native-build friction?
2. Platform priority: should first production channel optimize macOS/Homebrew first, or require Windows parity in the same P8 plan?
3. Packaging tolerance: is a release archive with `rai` plus bundled runtime/assets acceptable, or must the final user-facing artifact be one executable file?

## Risks

- “Single binary” may conflict with native Node addons unless assets are embedded/extracted or the engine is rewritten.
- Bundling Node/runtime assets increases release size and update surface.
- Duplicating CLI behavior in Go can create drift from existing TypeScript tests.
- Native addon platform gaps could block Linux musl, Windows arm64, or older distro support.
- Package-manager choices can accidentally become more work than the wrapper itself.

## Ready for Proposal

Yes, after user chooses install promise, first platform/channel priority, and one-file versus archive tolerance. Recommended proposal should scope P8 slice 1 to distribution contract + thin Go wrapper prototype + release-channel plan, with no analyzer/core rewrite.
