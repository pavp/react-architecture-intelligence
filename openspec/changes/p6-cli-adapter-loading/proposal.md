# Proposal: P6 CLI Adapter Loading

## Intent

Make CLI analysis load installed framework adapters while keeping `@rai/core` framework-agnostic. Next adapter findings and variant diagnostics must appear through existing `analyze_repo`/`rai analyze` result semantics, not adapter-owned persistence or core Next imports.

## Scope

### In Scope
- Add a public, framework-neutral analyzer composition seam in core sessions/registry.
- Allow successful analyzers to return findings plus diagnostics without changing existing analyzer implementations.
- Compose `@rai/adapter-next` from CLI/package surface for `rai analyze`; reuse same composition for `rai backfill` and `rai mcp` when low-risk.
- Add CLI exit coverage proving adapter findings/diagnostics flow through existing result shape.
- Update specs/docs/status for Slice 6.

### Out of Scope
- New Next analyzer rules beyond existing `next/client-boundary-bloat` and `next/route-coupling`.
- Core imports, rule IDs, role names, or variant strings specific to Next.js.
- Adapter-owned database tables or direct T3/T4/T5 writes.
- Automatic plugin discovery across arbitrary packages beyond installed/supported adapter loading.

## Capabilities

### New Capabilities
- `cli-adapter-loading`: CLI/package composition of installed adapters outside `@rai/core`, including Next adapter wrapper loading and command parity.

### Modified Capabilities
- `analysis-pipeline`: analyzer result normalization supports `{ findings, diagnostics }` while preserving legacy `Finding[]`, ordering, crash isolation, and persistence boundaries.
- `mcp-tools`: `analyze_repo` result shape stays stable while adapter findings affect counts and adapter diagnostics appear as diagnostics, not findings.

## Approach

Use CLI as composition root. Core exposes registry/session injection and diagnostic-aware analyzer result normalization with generic names only. CLI loads/registers adapter wrappers that close over root/files, call Next detect/enrich/analyzers, and return findings plus diagnostics. `rai analyze` is mandatory; `rai backfill` should share composition because snapshots must match normal analysis. `rai mcp` should receive same composed session if the server option is small; otherwise explicitly defer with spec rationale.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/analyzers/analyzer.ts` | Modified | Generic analyzer result type. |
| `packages/core/src/engine/pipeline.ts` | Modified | Normalize findings/diagnostics. |
| `packages/core/src/mcp/{tools,server}.ts` | Modified | Session/registry injection and stable MCP output. |
| `packages/cli/src/cli.ts` | Modified | Adapter composition for commands. |
| `packages/cli/src/cli.test.ts` | Modified | Exit/fixture tests for adapter loading. |
| `openspec/specs/*` | Modified/New | Delta specs for capability contract. |
| `docs/superpowers/STATUS.md`, `docs/gaps.md` | Modified | Slice 6 status/docs. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Core leaks Next strings | Med | Keep core tests/examples generic; retain framework-name lint. |
| Diagnostics dropped | Med | Contract normalization tests for successful diagnostic returns. |
| `rai mcp` parity costs too much | Low | Include only if server injection stays small; otherwise defer explicitly. |

## Rollback Plan

Remove CLI adapter registration and injected registry options; analyzer normalization remains backward compatible or reverts with tests. Existing core analyzers and MCP contracts keep working without adapter package.

## Dependencies

- Existing `@rai/adapter-next` exports and P6 analyzer specs.
- No new runtime persistence dependency.

## Success Criteria

- [ ] `rai analyze` on a Next fixture exits successfully and includes adapter findings/diagnostics.
- [ ] `@rai/core` has no framework-specific imports/names.
- [ ] Adapter diagnostics preserve `analyze_repo` result shape and are not feedback targets.
- [ ] Backfill and MCP parity is implemented or explicitly deferred with contract rationale.
