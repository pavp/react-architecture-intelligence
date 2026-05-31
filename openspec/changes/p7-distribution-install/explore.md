## Exploration: P7 — Distribution + install

### Current State

RAI is a TypeScript ESM pnpm workspace with Node >=22. `@rai/cli` currently exposes only `analyze`, `backfill`, `mcp`, and help through a small custom argv parser in `packages/cli/src/cli.ts`; there is no command framework, install planner, config writer, doctor command, or platform abstraction yet. `@rai/core` owns SQLite persistence and MCP server construction; `@rai/cli` is already the composition root for adapter loading and should stay the place where platform install/doctor UX lives.

The MCP server is stdio-based and currently starts with `rai mcp [dir]`. Core native runtime depends on `better-sqlite3` and `sqlite-vec`; `openDb()` always loads `sqlite-vec` and executes bundled `schema.sql`. The root package enables pnpm build scripts only for `better-sqlite3`, while `sqlite-vec` is also a native/vector package dependency worth checking explicitly in doctor. Package metadata is private workspace metadata (`0.0.0`, `@rai/cli` bin points to `./dist/index.js`) and is not ready for external npm distribution without version/export/release decisions.

Historical notes already identify the adoption gap: users must know per-agent MCP config and instruction paths manually. Canonical P7 narrows initial platform support to `opencode`, `claude-code`, `codex`, and `copilot`, with safe writes, markers, auto-detect, `--platform`, `--dry-run`, `--yes`, and `--no-instructions`.

### Affected Areas

- `packages/cli/src/cli.ts` — command routing must grow from fixed positional parsing into `install` and `doctor` option parsing while preserving existing commands.
- `packages/cli/src/cli.test.ts` — main test surface for parse/run behavior, dry-run output, and filesystem-safe planner/writer behavior.
- `packages/cli/src/index.ts` — bin entry remains valid, but install-generated MCP commands must point to the eventual published/global invocation contract.
- `packages/cli/package.json` — npm distribution metadata and dependencies need review; currently workspace-only and version `0.0.0`.
- `packages/core/src/db/db.ts` — doctor should exercise `better-sqlite3`, `sqlite-vec.load()`, `vec_version()`, and schema load without mutating user repos.
- `packages/core/src/mcp/server.ts` — doctor/build health can verify MCP server construction and tool registration; install config should launch `rai mcp` for target repo.
- `package.json` / `pnpm-lock.yaml` — Node >=22 and native dependency installation constraints shape distribution decision.
- `docs/future-ideas.md` — historical distribution/install/routing notes are useful input but not canonical scope.
- Platform user files outside repo — installer must write MCP config and bounded instructions with backup/merge/marker rules; this is main data-loss risk.

### Approaches

1. **TypeScript installer inside `@rai/cli`** — Add pure install planning/writing modules and wire them through current CLI.
   - Pros: Low architecture change, matches roadmap, reuses Node/fs/json tooling, easy to unit test with temp homes, no new binary language.
   - Cons: Still requires working Node/native install before installer can run; custom argv parser may become cramped.
   - Effort: Medium

2. **Add a small command framework before P7 commands** — Introduce commander/yargs-like parsing, then implement install/doctor.
   - Pros: Cleaner option handling for `--platform`, `--dry-run`, `--yes`, `--no-instructions`, future commands.
   - Cons: New dependency and migration churn for a small CLI; risks exceeding review budget for little product value.
   - Effort: Medium

3. **Go CLI wrapper** — Ship install/doctor as a native binary wrapper around existing TS engine.
   - Pros: Best long-term install UX and can run doctor before Node dependencies work.
   - Cons: High scope, new toolchain/release pipeline, unclear boundary to TS engine; too large for P7 first slice.
   - Effort: High

4. **WASM SQLite rewrite** — Remove native SQLite dependencies by replacing `better-sqlite3`/`sqlite-vec`.
   - Pros: Avoids native compilation class entirely.
   - Cons: Architectural persistence rewrite, vector extension gap, performance uncertainty; not needed to deliver install command.
   - Effort: High

### Recommendation

Use Approach 1 for P7 implementation: keep `rai install` and `rai doctor` in `@rai/cli`, with pure planner functions and small filesystem adapters. Defer command-framework migration unless option parsing becomes materially painful. Treat distribution as two tracks: near-term npm/Node CLI with explicit doctor diagnostics and longer-term release research for prebuilt/native or Go wrapper.

Suggested first implementation slice:

1. Add platform model and install planner: platform ids, detection probes, config path resolution, generated MCP entry, instruction targets, marker format, dry-run operations.
2. Add safe writer: preserve existing files, merge JSON configs by owned server key, replace only generated instruction block between markers, require `--yes` for writes unless non-interactive behavior is explicitly designed.
3. Add doctor checks: Node version, CLI build/bin resolution, core native load (`better-sqlite3`, `sqlite-vec`, `vec_version()`), MCP server build/tool names, platform config presence/validity, and path permissions.
4. Keep platform content minimal and capability-routed: RAI answers React architecture/finding/drift questions; it does not replace file reads, dependency impact tools, or general graph tools.

For platform locations, proposal/spec should confirm exact current schemas before locking behavior. Historical notes mention Claude Code `~/.claude.json`, Codex `~/.codex/config.json` plus `AGENTS.md`, and Copilot `.vscode/mcp.json` plus `.github/copilot-instructions.md`. OpenCode likely uses project or user MCP JSON plus `AGENTS.md`; this needs verification against current OpenCode docs or local config before implementation.

### Risks

- Config corruption: JSON merge logic must preserve unknown keys and only own the RAI MCP entry.
- Instruction bloat: generated blocks can hurt agent routing if too long; keep bounded and marker-owned.
- Platform schema drift: Claude Code, OpenCode, Codex, and Copilot MCP config formats may differ or change; verify before spec/design.
- Native doctor paradox: if `@rai/cli` cannot install because native deps fail, `rai doctor` cannot run from that install; near-term docs may need `npx`/source fallback guidance.
- Distribution ambiguity: published command (`rai mcp`, `npx @rai/cli mcp`, or local workspace path) must be decided before writing config templates.
- Review size: install + doctor + platform tests can exceed 800 changed lines; split into planner/writer/doctor slices if needed.

### Ready for Proposal

Yes. Proposal should define P7 MVP as TypeScript `@rai/cli` installer/doctor, explicitly defer Go wrapper and WASM SQLite, and require spec/design to verify platform config schemas before implementation.
