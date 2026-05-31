# Proposal: P10 React Pattern Intelligence Foundation

## Intent

Build the deterministic fact foundation P11 needs for React pattern analyzers without moving React interpretation into `@rai/core`. Core should expose source-observed syntax facts; React catalog meaning stays outside core.

## Scope

### In Scope
- Add framework-neutral syntax facts for imports, exports, calls, JSX structure, hook-like names, static/member assignments, and file-role seeds.
- Carry facts through `RepoGraph` as sorted, deduped, JSON-safe, frozen data with spans/evidence.
- Add React pattern catalog scaffolding and Modal/Popover fixtures outside `packages/core`.

### Out of Scope
- No full compound-component/container/provider/form/data-fetching analyzers.
- No findings, remediation, intent inference, or symbol/type resolver expansion.
- No React-specific pattern names or catalog rules inside `packages/core`.

## Capabilities

### New Capabilities
- `pattern-fact-extraction`: framework-neutral extraction and graph persistence of deterministic syntax facts.
- `react-pattern-catalog`: React-specific catalog scaffolding and fixtures that consume facts without emitting findings.

### Modified Capabilities
- None; existing specs do not define generic pattern facts or React catalog behavior yet.

## Approach

Use exploration approach 2: extend Pass-1 and graph construction with source-observed facts, then keep React pattern signatures/catalog data in an adapter/module seam like existing Next adapter composition. Tests define facts first; implementation follows strict TDD.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/parse/` | Modified | Extract generic syntax facts from parsed source. |
| `packages/core/src/graph/` | Modified | Store frozen deterministic fact indexes on `RepoGraph`. |
| `packages/core/src/types.ts` | Modified | Add framework-neutral fact contracts. |
| `packages/adapter-*` or new React module | New | Hold React catalog scaffolding outside core. |
| `fixtures/` | Modified | Add Modal/Popover compound primitive examples. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Core boundary drift | Medium | Ban React names/intent from core fact types/tests. |
| Fact volume growth | Medium | Keep bounded shapes, sorting, and dedupe. |
| Static/member over-interpretation | Medium | Store syntax only; analyzers infer later. |
| Review budget pressure | Medium | Keep single PR foundation-only under 800 lines. |

## Rollback Plan

Revert P10 changes and remove new specs/catalog/fixtures. Existing findings, memory, CLI, and Next adapter behavior remain unchanged because P10 emits no findings.

## Dependencies

- Existing parser, graph, adapter-loading, and strict TDD infrastructure.

## Success Criteria

- [ ] Core graph exposes deterministic generic pattern facts with tests.
- [ ] React catalog/fixtures live outside `packages/core` and emit no findings.
- [ ] `pnpm test`, typecheck, build, lint, and diff checks pass.
