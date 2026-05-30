# Tasks: Wire Three Deferred MVP Gaps

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~105–145 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |
| Delivery strategy | ask-on-risk |

Single PR; ~105–145 lines well under budget.

## Authoritative facts (from design — do not deviate)

- Boundary field shape: `{ from: string; to: string; kind?: string; reason: string }` (NOT fromGlob/toGlob).
- Stub line: `shared-extraction.ts:45` (`:44` is the comment).
- REUSE `globMatch` at `shared-extraction.ts:80-98` — no new glob dependency.
- `severityMap` MUST live under `config.memory` (overlay gets `config.memory` as cfg at `pipeline.ts:59`).
- Severity rank: info=0 < warn=1 < error=2. Down-only superRefine rejects `rank[mapped] > rank[raw]`.
- AnalysisContext break = exactly ONE test double: `shared-extraction.test.ts` `ctx()` factory needs `boundaryRules: []`.
- No MCP server output-schema change for §3.5 (server.ts JSON.stringifies). explainFinding return type stays inline.

> **TDD ordering note (apply):** In a typed language, the fail-first test must still COMPILE. For §1.1, add the `AnalysisContext.boundaryRules` field + the `ctx()` factory `boundaryRules: []` together with the failing test so it compiles; the test then fails on BEHAVIOR (returns `"opportunity"`, not `"architectural-conflict"`), not on a type error. For §1.3 task 2.2 (upward-map rejection): if the `superRefine` (1.1) already landed, this test is green-from-start rather than red — that is acceptable (behavior still verified); apply MAY write 2.2 before 1.1 if it wants a true red.

---

## Phase 1: Foundation — Types & Schema (sequential; §1.3 first, then §1.1)

- [x] 1.1 **[§1.3 SCHEMA]** In `packages/core/src/config/schema.ts`, add optional `severityMap: z.record(z.enum(["info","warn","error"]), z.enum(["info","warn","error"])).optional()` inside the `memory` z.object block (`:26-31`); add `.superRefine` down-only rank guard (`rank = {info:0,warn:1,error:2}`; reject when `rank[mapped] > rank[raw]`).
- [x] 1.2 **[§1.3 OVERLAY TYPE]** In `packages/core/src/memory/overlay.ts`, add `severityMap?: Partial<Record<Severity, Severity>>` to the `OverlayConfig` interface at `:3`.
- [x] 1.3 **[§1.1 SCHEMA]** In `packages/core/src/config/schema.ts`, add top-level `boundaries: z.array(z.object({ from: z.string(), to: z.string(), kind: z.string().optional(), reason: z.string() })).default([])` to `ConfigSchema`.
- [x] 1.4 **[§1.1 CONTEXT TYPE]** In `packages/core/src/analyzers/analyzer.ts`, add `export interface BoundaryRule { from: string; to: string; kind?: string; reason: string; }` and add `boundaryRules: readonly BoundaryRule[]` to `AnalysisContext` (`:12-21`).

---

## Phase 2: Fail-First Tests — RED (sequential: §1.3 → §3.5 → §1.1)

- [x] 2.1 **[§1.3 RED — clamp]** In `packages/core/src/memory/overlay.test.ts`, add test: `severityRaw:"error"` + `severityMap:{error:"warn"}` → `result.severity==="warn"` AND `f.severityRaw==="error"`. Run `pnpm test -- overlay`; confirm RED.
- [x] 2.2 **[§1.3 RED — rejection]** In `packages/core/src/config/resolve.test.ts` (or schema test), add test: config input `memory.severityMap = { info: "error" }` → `ConfigSchema.parse(...)` throws. (See TDD ordering note — may be green-from-start if 1.1 landed first.)
- [x] 2.3 **[§3.5 RED]** In `packages/core/src/mcp/tools.test.ts`, add test: record feedback with `reason: "arch-reason"` → `explainFinding({fingerprint}).memory.lastReason === "arch-reason"` (currently `undefined`). Run `pnpm test -- tools`; confirm RED.
- [x] 2.4 **[§1.1 RED — positive]** In `packages/core/src/analyzers/shared-extraction.test.ts`, add `boundaryRules: []` to the `ctx()` factory default literal (`:16-25`). Add test: cluster crossing `src/features/**`→`src/ui/**` boundary → `type==="architectural-conflict"` AND `evidence.conflict` defined. Run `pnpm test -- shared-extraction`; confirm RED (behavior, not compile).
- [x] 2.5 **[§1.1 RED — negative]** Add test: cluster with all files in `src/ui/` only → `type==="opportunity"` AND `evidence.conflict` undefined.

---

## Phase 3: Implementation — GREEN (sequential: §1.3 → §3.5 → §1.1)

- [x] 3.1 **[§1.3 CLAMP]** In `packages/core/src/memory/overlay.ts:7`, replace identity with: `const severity: Severity = cfg.severityMap?.[f.severityRaw] ?? f.severityRaw;`. Run `pnpm test -- overlay`; GREEN. Existing non-mutation test stays green.
- [x] 3.2 **[§1.3 SCHEMA VERIFY]** Run `pnpm test -- resolve`; upward-map rejection test GREEN (superRefine from 1.1 is live).
- [x] 3.3 **[§3.5 lastReason]** In `packages/core/src/mcp/tools.ts` memory object (`:74-80`), add: `lastReason: [...events].reverse().find((e) => e.reason !== null)?.reason ?? null` (ES2022-compatible; findLast not available at target). Run `pnpm test -- tools`; GREEN.
- [x] 3.4 **[§1.1 PIPELINE]** In `packages/core/src/engine/pipeline.ts` ctx literal (`:43-48`), add: `boundaryRules: input.config.boundaries as readonly BoundaryRule[]`. (MUST precede 3.5 — the predicate reads `ctx.boundaryRules`.)
- [x] 3.5 **[§1.1 PREDICATE]** In `packages/core/src/analyzers/shared-extraction.ts:45`, replace `const type = "opportunity" as const` with the nested-loop boundary predicate (reuse `globMatch` at `:80-98`; derive `conflict`; set `type: FindingType`). Spread `conflict` into evidence at push site (`:57-65`). Run `pnpm test -- shared-extraction`; GREEN.

---

## Phase 4: Final Gate & Documentation (sequential, last)

- [x] 4.1 **[TYPECHECK]** Run `pnpm typecheck`; zero errors.
- [x] 4.2 **[FULL SUITE]** Run `pnpm test`; all 106 existing + 8 new = 114 tests GREEN.
- [x] 4.3 **[BUILD + SMOKE]** Run `pnpm build && ./scripts/smoke.sh --build`; 13/13 checks passed.
- [x] 4.4 **[DOCS]** In `docs/gaps.md`, flip §1.1, §1.3, §3.5 from open→fixed (reference `wire-deferred-mvp-gaps`); note §1.2 split into `wire-ts-morph-pass2`. Confirm headings before editing.

---

## Spec-to-Task Traceability

| Task(s) | Spec Requirement |
|---------|-----------------|
| 1.1, 1.2, 3.1, 3.2, 2.1, 2.2 | §1.3 Severity Clamp Map |
| 1.3, 1.4, 3.4, 3.5, 2.4, 2.5 | §1.1 BoundaryRules + Boundary-Crossing Finding Type |
| 3.3, 2.3 | §3.5 lastReason in explainFinding |
| 4.1–4.3 | Regression: Existing Test Suite Green |
| 4.4 | Docs hygiene |
