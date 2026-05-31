# Proposal: P7 Distribution + Install

## Intent

Reduce RAI adoption friction by adding near-term TypeScript CLI install/doctor flows that configure supported agent platforms safely and expose native/runtime health checks before deeper distribution work.

## Scope

### In Scope
- Add `rai install` for `opencode`, `claude-code`, `codex`, and `copilot` with auto-detect default and `--platform` override.
- Support `--dry-run`, `--yes`, and `--no-instructions` for safe planning, confirmation, and instruction control.
- Write MCP config plus bounded RAI routing instructions using marker-owned blocks and JSON merges with no unrelated overwrites.
- Add `rai doctor` checks for Node/CLI/runtime, `better-sqlite3`, `sqlite-vec`, MCP server construction, platform config, and permissions.
- Decide distribution path: prebuilt native bindings near-term; Go CLI wrapper longer-term; WASM SQLite deferred unless vector support improves.

### Out of Scope
- Go CLI wrapper implementation.
- WASM SQLite rewrite or vector-store replacement.
- Publishing/release automation beyond decisions needed for generated MCP commands.
- Broad command-framework migration unless current parser blocks required flags.

## Capabilities

### New Capabilities
- `cli-distribution-install`: CLI installation, platform config, safe writes, routing instructions, doctor checks, and native distribution decisions.

### Modified Capabilities
- None.

## Approach

Keep P7 in `@rai/cli`: pure install planner + small filesystem writer + doctor checks. Default `rai install` detects supported platforms, emits planned operations, and writes only after explicit consent unless `--dry-run`. Config writers own only RAI MCP entries/marker blocks. Routing instructions stay short: use RAI for React architecture findings, drift, evidence, and refactor insight; do not route general file reads or dependency graph work to RAI.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/cli/src/cli.ts` | Modified | Add install/doctor command routing and flag parsing. |
| `packages/cli/src/cli.test.ts` | Modified | Cover planning, dry-run, safe writes, and doctor outcomes. |
| `packages/cli/package.json` | Modified | Review bin/distribution metadata for generated command contract. |
| `packages/core/src/db/db.ts` | Referenced | Doctor validates native SQLite/vector load without repo mutation. |
| Platform config/instruction files | Modified | Marker-owned MCP config and bounded agent instructions. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Platform schema drift | Med | Verify schemas in spec/design before implementation. |
| Config corruption | Med | Preserve unknown keys; only own RAI server key/markers. |
| Native install failure blocks doctor | Med | Document source/npx fallback and report actionable errors. |
| Review size exceeds 800 lines | Med | Split planner/writer/doctor into separate slices. |

## Rollback Plan

Revert CLI changes. Remove marker-owned instruction blocks and RAI MCP entries; leave unrelated platform config untouched.

## Dependencies

- Current platform MCP config schemas for OpenCode, Claude Code, Codex, and Copilot.
- Node >=22 and native package availability for `better-sqlite3` and `sqlite-vec`.

## Success Criteria

- [ ] `rai install --dry-run` shows platform-specific planned writes without filesystem changes.
- [ ] `rai install --yes` updates only RAI-owned MCP/config/instruction sections.
- [ ] `rai doctor` reports environment, native SQLite/vector, MCP, and platform health.
- [ ] Specs/design preserve TypeScript CLI near-term path and defer Go/WASM work.
