# Apply Progress: wire-deferred-mvp-gaps

**Status:** done (all 19 tasks)
**Branch:** feat/rai-mvp-p0-p3 (committed, not pushed, no PR)
**Mode:** Strict TDD (RED → GREEN per gap where a true red was possible)

## Phases

| Phase | Status |
|------|--------|
| 1 — Foundation (types/schema) | done (1.1–1.4) |
| 2 — Fail-first RED | done (2.1–2.5) |
| 3 — Implementation GREEN | done (3.1–3.5) |
| 4 — Final gate + docs | done (4.1–4.4) |

## RED evidence per gap

- §1.3 clamp: `AssertionError: expected 'error' to be 'warn'` (overlay.test.ts) → GREEN after clamp line.
- §1.3 rejection: green-from-start (superRefine landed with the test, per TDD ordering note). Behavior verified.
- §3.5: `expected undefined to be 'arch-reason'` + `expected undefined to be null` (tools.test.ts) → GREEN after lastReason.
- §1.1 positive: `expected 'opportunity' to be 'architectural-conflict'` (shared-extraction.test.ts) → GREEN after predicate.
- §1.1 negative: green-from-start (all-ui cluster doesn't cross; predicate not yet written).

## Final gate (verbatim)

- `pnpm test` → `Test Files 23 passed (23)` / `Tests 114 passed (114)`
- `pnpm typecheck` → packages/core Done, packages/cli Done
- `pnpm build` → packages/core Done, packages/cli Done
- `./scripts/smoke.sh --build` → `Result: 13 passed, 0 failed`

## Commits

- `1aad7e2` — `feat(memory): wire severity-clamp map in config overlay (§1.3)`
- `8092291` — `feat(mcp): surface lastReason in explainFinding memory object (§3.5)`
- `31991c4` — `feat(analyzer): wire boundary-crossing predicate for architectural-conflict (§1.1)`
- `747a8cd` — `docs(gaps): mark §1.1, §1.3, §3.5 fixed; note §1.2 split into wire-ts-morph-pass2`

## Files changed (10 source + tasks + docs)

config/schema.ts (severityMap+superRefine+boundaries), memory/overlay.ts (+test), config/resolve.test.ts, analyzers/analyzer.ts (BoundaryRule+boundaryRules), analyzers/shared-extraction.ts (+test), engine/pipeline.ts (boundaryRules load), mcp/tools.ts (+test), docs/gaps.md.

## Deviations from design (both legitimate, verified safe)

1. `findLast` → `[...events].reverse().find(...)` — ES2022 target lacks `findLast`. Semantically identical; reverses a COPY (no source mutation).
2. pipeline.ts cast `input.config.boundaries as readonly BoundaryRule[]` — exactOptionalPropertyTypes friction; Zod schema and BoundaryRule interface are structurally identical. Safe.

## Integrity invariants honored

- §1.3: overlay pure, `f.severityRaw` never assigned (existing non-mutation test still green).
- §1.1: `type` CODE-derived from config; NO write to `boundary_rule` DB table; `globMatch` reused (no new dep); field shape `{ from, to, kind?, reason }` per reconciliation.
- §3.5: no finding mutation, no new DB query, inline return type kept, no MCP server output-schema invented.

## Independent orchestrator verification

git log + `git show 31991c4` confirmed: 4 commits on correct branch, no AI attribution, §1.1 predicate matches design verbatim (nested loop, globMatch reuse, conditional conflict spread), reconciled field shape used. Tree clean of source.

## Next recommended

`sdd-verify`
