# release-ci-typecheck-fix Tasks

## Review Workload Forecast

- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No
- Delivery strategy: auto-forecast single PR

## Tasks

- [x] 1.1 Add regression coverage that root `typecheck` builds workspace declarations before package typechecking.
- [x] 1.2 Change root `typecheck` to run topological workspace builds before topological typechecks.
- [x] 1.3 Verify `pnpm typecheck` succeeds from a clean package `dist` state.
