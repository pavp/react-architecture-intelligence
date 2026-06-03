## Main Branch Policy

All app changes must land through a PR before reaching `main`. Do not commit directly to `main`.

## PR Type

Check exactly one and add matching `type:*` label.

- [ ] Bug fix (`type:bug`)
- [ ] New feature (`type:feature`)
- [ ] Documentation only (`type:docs`)
- [ ] Code refactoring (`type:refactor`)
- [ ] Maintenance/tooling (`type:chore`)
- [ ] Breaking change (`type:breaking-change`)

## Summary

- <!-- What changed? -->
- <!-- Why now? -->

## Changes

| File | Change |
|------|--------|
| `path/to/file` | What changed |

## Review Notes

Review first:

- <!-- Highest-signal files or behavior to inspect first. -->

Out of scope:

- <!-- What this PR intentionally does not change. -->

Chain context, if applicable:

- Previous PR: N/A
- Next PR: N/A

## Test Plan

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] Manual check, if needed: N/A

## Contributor Checklist

- [ ] Confirmed this app change is landing through a PR, not directly on `main`
- [ ] Added exactly one `type:*` label
- [ ] Kept changes within stated scope
- [ ] Updated specs/docs if behavior changed
- [ ] Used conventional commits
- [ ] No `Co-Authored-By` or AI attribution trailers
