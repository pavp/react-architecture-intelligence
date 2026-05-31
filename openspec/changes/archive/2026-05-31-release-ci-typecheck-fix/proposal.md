# release-ci-typecheck-fix Proposal

## Motivation

The `v0.1.0` release workflow failed during `pnpm typecheck` because `packages/adapter-next` typechecked before `@rai/core` declaration files existed in a clean checkout. Local runs passed when stale `dist` output was already present, masking the CI dependency-order bug.

## Scope

- Make root `pnpm typecheck` safe on clean CI checkouts by building workspace packages in topological order before package typechecks.
- Add regression coverage for the root script contract.
- Verify clean-package-dist `pnpm typecheck` succeeds.

## Non-goals

- Do not move, delete, or reuse the `v0.1.0` tag.
- Do not create or push a new tag.
- Do not publish release artifacts.
- Do not change `.atl/`.

## Rollback

Revert the root `typecheck` script and regression test if the workspace strategy changes to TypeScript project references or source-path aliases later.
