# release-ci-typecheck-fix Design

## Decision

Change the root `typecheck` script from a package-only recursive typecheck to a two-step topological pipeline:

```bash
pnpm -r --sort run build && pnpm -r --sort run typecheck
```

## Rationale

Workspace packages publish types through their package `types` and `exports` fields, both pointing at `dist/index.d.ts`. A clean checkout has no `dist`, so dependents such as `@rai/adapter-next` cannot resolve `@rai/core` until `@rai/core` has built declarations. `pnpm -r --sort` respects workspace dependency order, so `@rai/core` builds before `@rai/adapter-next`, and both build before `@rai/cli`.

## Alternatives considered

- `pretypecheck`: rejected because it hides required setup behind npm lifecycle behavior and can be harder to reason about in CI logs.
- TypeScript project references: rejected for this incident fix because it is broader than necessary and would require package config changes beyond the minimal release unblock.
- Source `paths` aliases for all workspaces: rejected because package boundaries currently resolve through package exports and built declarations.

## Invariants

- `@rai/core` remains framework-agnostic.
- Adapter dependencies still point from adapter/CLI to core, never core to adapter.
- Release tags remain immutable; this change prepares for a later new tag only.
