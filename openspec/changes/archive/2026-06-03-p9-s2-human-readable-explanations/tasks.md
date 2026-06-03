# Tasks: P9-S2 Human-Readable Explanations

## Review workload forecast

| Field | Value |
|---|---|
| Estimated changed lines | 300-650 |
| 400-line risk | Medium |
| Chained PRs recommended | No for this already size-exception session; keep as same explicit large change unless scope grows. |
| Stop gate | Stop if implementation needs React-specific strings in `packages/core/**` or changes raw evidence/fingerprints. |

## Strict TDD tasks

### RED

1. Add failing core test proving analyzer-owned `explain` hook is used by `Session.explainFinding` and raw evidence remains unchanged.
2. Add failing adapter-react test proving `react/container-presenter-role-drift` explanation is plain-language and bounded.
3. Update smoke expectation to assert the human summary for the P11-S2 CLI fixture.

### GREEN

4. Add optional `explain` hook to `Analyzer` type.
5. Add `AnalyzerRegistry.get(ruleId)`.
6. Store the last registry in `Session` and dispatch to `analyzer.explain` when available, falling back to generic core explanation.
7. Implement container/presenter explanation in `packages/adapter-react/src/container-presenter-role-drift.ts`.

### TRIANGULATE

8. Run focused tests:
   - `pnpm test packages/core/src/mcp/tools.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/cli/src/cli.test.ts`
9. Run targeted smoke:
   - `./scripts/smoke.sh --build`

### REFACTOR / VERIFY

10. Keep wording concise and human; avoid intent/remediation claims.
11. Sync explainability spec and archive after verification.
12. Final commands:
   - `pnpm test && pnpm test:launcher`
   - `pnpm typecheck`
   - `pnpm build`
   - `rtk proxy pnpm lint`
   - `./scripts/smoke.sh --build`
   - `git diff --check`
