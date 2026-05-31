# Apply Progress: P9 Explainability

**Change**: p9-explainability  
**Mode**: Strict TDD  
**Status**: Critical verification fixes applied; required command suite passed.

## Completed Tasks

- [x] Phase 1: Core explainability helpers
- [x] Phase 2: MCP `explain_finding`
- [x] Phase 3: CLI `rai explain <file>`
- [x] Phase 4: README onboarding
- [x] Phase 5: Verification commands and status docs gating
- [x] Critical fix: formal strict TDD evidence saved
- [x] Critical fix: MCP unknown fingerprint/not-found behavior covered
- [x] Critical fix: README quick-path onboarding covered

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Phase 1: Core glossary/explanation/file refs | `packages/core/src/explainability/glossary.test.ts`, `packages/core/src/explainability/explain.test.ts`, `packages/core/src/explainability/file-refs.test.ts` | Unit | N/A (new helpers) | ✅ Written first for known terms, unknown raw fallback, explanation envelope, file refs | ✅ Passed in focused and full Vitest suites | ✅ Known + unknown terms; shared/render/topology/boundary/adapter evidence; file hit + miss | ✅ Helpers kept pure, deterministic, framework-independent |
| Phase 2: MCP `explain_finding` additive envelope | `packages/core/src/mcp/tools.test.ts`, `packages/core/src/mcp/server.test.ts` | Integration | ✅ Existing MCP tests passed before P9 edits in prior cycle | ✅ Written first for additive explanation beside raw evidence/memory | ✅ Passed in focused and full Vitest suites | ✅ Raw fields unchanged + explanation fields + server schema/wording | ✅ Reused core explainability helper; no analyzer fact changes |
| Phase 3: CLI `rai explain <file>` UX | `packages/cli/src/cli.test.ts` | Integration | ✅ Existing CLI tests passed before P9 edits in prior cycle | ✅ Written first for parser/help, file hit, no hit, human output, JSON output, and no feedback writes | ✅ Passed in focused and full Vitest suites | ✅ File hit + no relevant findings + JSON path + feedback-write guard | ✅ CLI wording aligned with core explanation fields |
| Phase 4: README onboarding | `packages/cli/src/readme-onboarding.test.ts` | Docs unit | N/A (docs test new) | ✅ Written first in critical-fix cycle to require quick path/install/doctor/analyze/explain/limits/glossary | ✅ `/opt/homebrew/bin/pnpm test -- packages/cli/src/readme-onboarding.test.ts` passed: 56 files / 344 tests | ✅ Command order + limitations + glossary terms + JSON example | ➖ None needed — README already had required quick-path shape |
| Phase 5: Verification commands/status gating | Existing focused suites plus full command suite | Verification | ✅ Focused P9 suites passed before full verification in prior cycle | ✅ Verification task list existed before command execution | ✅ Required command suite passed after critical fixes | ✅ Focused MCP/docs tests plus full suite rerun after critical fixes | ➖ None needed |
| Critical fix: formal TDD evidence artifact | `openspec/changes/p9-explainability/apply-progress.md` and Engram `sdd/p9-explainability/apply-progress` | Artifact | ✅ Existing Engram apply-progress #359 and verify-report #367 read before merge | ✅ Missing formal table identified by verify failure before artifact update | ✅ Artifact now contains required columns from `strict-tdd.md` | ✅ Covers prior phases plus new critical-fix rows | ✅ Merged prior progress instead of overwriting it |
| Critical fix: MCP unknown fingerprint not-found behavior | `packages/core/src/mcp/tools.test.ts` | Integration | ✅ `/opt/homebrew/bin/pnpm test -- packages/core/src/mcp/tools.test.ts` baseline passed: 55 files / 342 tests | ✅ Added test for unknown fingerprint throwing `unknown fingerprint in current analysis` and no feedback writes before production change | ✅ `/opt/homebrew/bin/pnpm test -- packages/core/src/mcp/tools.test.ts` passed: 56 files / 344 tests | ✅ Covered unknown fingerprint plus existing known-fingerprint explanation path | ➖ None needed — implementation already matched spec |
| Critical fix: README quick-path onboarding scenario | `packages/cli/src/readme-onboarding.test.ts` | Docs unit | ✅ `/opt/homebrew/bin/pnpm test -- packages/cli/src/doctor.test.ts` baseline passed: 55 files / 342 tests | ✅ Added deterministic README test before production/doc change, covering quick path/install/explain limitations | ✅ `/opt/homebrew/bin/pnpm test -- packages/cli/src/readme-onboarding.test.ts` passed: 56 files / 344 tests | ✅ Command order + output limitations + glossary terms | ➖ None needed — README already matched required content |

## Test Summary

- **Total tests written in critical-fix cycle**: 2
- **Total tests passing after critical-fix focused runs**: 344
- **Layers used**: Unit/docs (1), Integration (1), E2E (0)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 0 in critical-fix cycle

## Files Changed by Critical Fixes

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/core/src/mcp/tools.test.ts` | Modified | Added unknown fingerprint `explainFinding` coverage and no feedback-write assertion. |
| `packages/cli/src/readme-onboarding.test.ts` | Created | Added deterministic README onboarding test for quick path, install, first commands, JSON explain, limitations, and glossary terms. |
| `openspec/changes/p9-explainability/apply-progress.md` | Created | Persisted formal strict TDD evidence table matching required columns. |

## Deviations from Design

None — implementation remains presentation-only and keeps analyzer facts unchanged.

## Verification Commands

| Command | Result |
|---------|--------|
| `/opt/homebrew/bin/pnpm test -- packages/core/src/mcp/tools.test.ts` | ✅ 56 files / 344 tests |
| `/opt/homebrew/bin/pnpm test -- packages/cli/src/readme-onboarding.test.ts` | ✅ 56 files / 344 tests |
| `/opt/homebrew/bin/pnpm test` | ✅ 56 files / 344 tests |
| `/opt/homebrew/bin/pnpm test:launcher` | ✅ `internal/launcher` passed |
| `/opt/homebrew/bin/pnpm typecheck` | ✅ Passed |
| `/opt/homebrew/bin/pnpm build` | ✅ Passed |
| `/opt/homebrew/bin/pnpm lint` | ✅ Passed |
| `git diff --check` | ✅ Passed |

## Issues Found

- Vitest path filtering in this repo still executed the full configured suite during focused runs; results remained green.
- Existing unrelated local files remain in worktree (`AGENTS.md`, `.atl/`) and were not staged or committed.

## Remaining Tasks

- [x] Run final required verification commands after critical fixes.

## Workload / PR Boundary

- Mode: single PR
- Current work unit: P9 verification critical fixes
- Boundary: tests/artifact evidence only; no staging or commit
- Estimated review budget impact: small follow-up on existing P9 work
