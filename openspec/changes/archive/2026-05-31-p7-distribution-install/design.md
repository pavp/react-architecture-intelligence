# Design: P7 Distribution + Install

## Technical Approach

Keep P7 inside `@rai/cli` and extend the existing custom parser only as far as needed for `install` and `doctor`. `install` is plan-first: detect/select platforms, produce deterministic file operations, then apply only with `--yes`. Writers own only RAI MCP entries and marked instruction blocks. `doctor` is read-only except temp runtime probes. This preserves `@rai/core` independence and the Code → Findings → Config/Memory → LLM boundary.

## Architecture Decisions

| Area | Option / tradeoff | Decision |
|------|-------------------|----------|
| CLI shape | Command framework adds churn; current parser is tiny. | Extend `parseArgs` with typed install/doctor flags; revisit only if parser becomes ambiguous. |
| Platform support | Schemas drift across agent tools. | Encode platform adapters with best-known targets plus `schemaConfidence`; fail safely with clear uncertainty. |
| Writes | Blind overwrites risk user config. | Use atomic safe writers: parse/merge/write temp/rename; broken JSON/TOML blocks writes. |
| Instructions | Full-file ownership is unsafe. | Use `<!-- RAI:BEGIN -->` / `<!-- RAI:END -->` marker block replacement only. |
| Distribution | Go/WASM reduce Node pain but are larger projects. | TypeScript CLI now; prebuilt native bindings next; Go wrapper future; WASM deferred. |

## Data Flow

```text
argv -> parseArgs -> install/doctor command
install -> platform selection -> plan -> operations -> dry-run | confirm/--yes -> safe writers
doctor  -> checks(runtime/native/mcp/config/perms) -> report -> exit code
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/cli/src/cli.ts` | Modify | Add `install`/`doctor` routing, usage, flags. |
| `packages/cli/src/install/types.ts` | Create | Platform ids, plan, operation, result contracts. |
| `packages/cli/src/install/platforms.ts` | Create | `opencode`, `claude-code`, `codex`, `copilot` adapters and targets. |
| `packages/cli/src/install/detect.ts` | Create | Config target and project root detection. |
| `packages/cli/src/install/plan.ts` | Create | Pure planner for selection, MCP command, instructions. |
| `packages/cli/src/install/writers.ts` | Create | JSON merge, TOML section replace, marker block, atomic write helpers. |
| `packages/cli/src/install/templates.ts` | Create | Bounded routing instruction text. |
| `packages/cli/src/doctor.ts` | Create | Read-only health checks and report assembly. |
| `packages/cli/src/cli.test.ts` | Modify | Parser, integration, temp-dir CLI behavior tests. |
| `packages/cli/src/install/*.test.ts` | Create | TDD unit tests for planner/writers/platforms. |
| `packages/cli/package.json` | Modify | Review bin metadata only if command generation needs package name/version. |

## Interfaces / Contracts

Best-known platform targets:

| Platform | MCP target | Instruction target | Confidence |
|----------|------------|--------------------|------------|
| `opencode` | `opencode.json/jsonc` local or `~/.config/opencode/opencode.json` `mcp.rai` | `AGENTS.md` or configured instruction file | Medium; schema needs docs verification. |
| `claude-code` | project `.mcp.json` preferred; `~/.claude.json` user fallback | `CLAUDE.md` | Medium; scope behavior needs verification. |
| `codex` | `~/.codex/config.toml` `[mcp_servers.rai]` | `AGENTS.md` | Low/Medium; TOML schema needs verification. |
| `copilot` | `.vscode/mcp.json` server `rai` | `.github/copilot-instructions.md` | Medium; VS Code/Copilot schema needs verification. |

`InstallPlan` JSON output includes `platforms`, `projectRoot`, `mcpCommand`, `operations`, `warnings`. `--dry-run` prints plan plus unified diff/operation list and writes nothing. No `--yes` prints plan and returns confirmation-required before writes. `--yes` prints per-operation `{path, action, status}` results.

MCP command strategy: local dev uses `process.execPath` + absolute built CLI entry when detectable; global install uses `rai mcp <projectRoot>`; future published fallback may use `npx -y @rai/cli mcp <projectRoot>`. All variants pass repository root, never `/src`.

`DoctorReport` JSON includes `status: pass|warn|fail`, checks with `category`, `name`, `status`, `message`, `remediation`. Checks: Node >=22, CLI bin/build smoke, `better-sqlite3` import, `sqlite-vec` load via temp DB and `vec_version()`, MCP server construction with empty repo, generated config presence/parse, target file permissions, and runtime `rai mcp <root>` spawn smoke where safe. Any blocking fail exits non-zero.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Arg parsing, platform selection, command generation, safe writers. | Vitest first; temp dirs; no home writes. |
| Integration | `install --dry-run`, `install --yes`, `--no-instructions`, broken config, doctor degraded/healthy. | Temp `$HOME`/cwd fixtures and injected env paths. |
| Smoke | Built CLI can run `doctor` and construct MCP. | Extend existing smoke only after unit/integration green. |

Strict TDD: write failing tests before planner/writer/doctor code. Keep implementation sliced if forecast exceeds 800 changed lines: (1) parser + planner, (2) writers + instructions, (3) doctor checks, (4) docs/status polish.

## Migration / Rollout

No migration required. Installer is opt-in and reversible by removing RAI MCP entries plus marker blocks.

## Open Questions

- [ ] Verify current MCP schemas for OpenCode, Claude Code, Codex, and Copilot before implementation hard-codes targets.
