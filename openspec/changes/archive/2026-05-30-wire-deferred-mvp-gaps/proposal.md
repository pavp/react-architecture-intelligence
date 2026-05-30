# Proposal: Wire Three Deferred MVP Gaps (boundary-conflict, severity-clamp, feedback-reason)

## Intent

Activate three pieces of behavior that were scaffolded during P0-P3 but left as stubs/identities. Each gap has its types, columns, and call sites already in place; this change wires the live behavior with minimal new surface. The split-out ts-morph Pass-2 (§1.2) is a separate future change.

## Motivation

Three deferred gaps from `gaps.md`, each a deliberate stub left from P0-P3:

- **§1.1 — `architectural-conflict` never fires.** `shared-extraction.ts:44` hardcodes `const type = "opportunity" as const`. The `FindingType` union (`types.ts:38`) already declares `"architectural-conflict"` and `SharedExtractionEvidence` (`types.ts:40-49`) already has optional `conflict?: { rule; why }`. Scaffolding present; predicate never evaluated.
- **§1.3 — severity-clamp is identity.** `overlay.ts:7` is `const severity = f.severityRaw` (identity). `OverlayConfig` has `suppressBelow`/`amplifyAbove` but no severity map. Design leak-invariant #1: "Severity is computed by CODE, clamped by CONFIG, immutable to the LLM."
- **§3.5 — `reason` field inert.** Stored in T4 (`schema.sql:29`), written by `feedback-store.ts:42`, read back by `eventsFor()` (`feedback-store.ts:60-66`), but `explainFinding` (`tools.ts:66-82`) returns only `{ weight, confidence, eventCount, net }` — `reason` is never surfaced; the loaded `events` array is used only for `.length`.

## Proposed Approach

**§1.1 boundary_rule → architectural-conflict (CONFIG-ARRAY-DRIVEN).**
LOCKED DECISION: boundary rules live in a `boundaries` array in `ConfigSchema` (CONFIG tier — version-controlled, deterministic). `pipeline.ts` loads them into `ctx.boundaryRules` each run. The DB `boundary_rule` table stays READ-ONLY for future runtime management; C2 wires NO DB write path.
Wiring: (1) add `boundaryRules` to `AnalysisContext` (`analyzer.ts`); (2) load from config into ctx in `pipeline.ts`; (3) in `shared-extraction.ts:44` emit `"architectural-conflict"` + populate `evidence.conflict` when a cluster's component file pair crosses a declared `from_glob → to_glob`; (4) add `boundaries` knob to `schema.ts`, pass through `resolve.ts`. Scaffolding already present: union member + evidence field. `type` stays CODE-derived from config rule data; finding stays append-only at persist. Same code+config in ⇒ same finding type out.

**§1.3 severity-clamp at read time.**
Add `severityMap` to `OverlayConfig` and to the `memory` section of `ConfigSchema`. In `overlay.ts`: `const severity = cfg.severityMap?.[f.severityRaw] ?? f.severityRaw`. Clamp is READ-TIME on `PresentedFinding.severity`; `f.severityRaw` MUST stay untouched (overlay already pure). Clamp DOWN only — enforce via Zod refinement rejecting upward maps. Scaffolding present: overlay is already pure, `severityRaw` already separate from derived `severity`.

**§3.5 surface lastReason.**
In `explainFinding` (`tools.ts`), add `lastReason: events.findLast(e => e.reason !== null)?.reason ?? null` to the returned `memory` object. No schema change (data already persisted by §3.5 path). `reason` is feedback metadata informing the LLM-facing view only — no finding mutation, NOT an LLM write path. Scaffolding present: `events` already loaded.

## Scope

### In Scope (~105-140 lines, single PR, under 400 budget)
- `analyzers/analyzer.ts` — add `boundaryRules` to `AnalysisContext`
- `engine/pipeline.ts` — load config boundaries → ctx
- `analyzers/shared-extraction.ts` — boundary-crossing predicate → conflict type
- `memory/overlay.ts` — read-time severity clamp
- `config/schema.ts` — `severityMap` (memory) + `boundaries` array
- `config/resolve.ts` — pass-through
- `mcp/tools.ts` — `lastReason` in explainFinding memory
- `*.test.ts` for each (three fail-first tests)

### Out of Scope (Non-goals)
- **§1.2 ts-morph Pass-2 — SPLIT OUT into separate future change `wire-ts-morph-pass2`.** Adds 130-190 lines + ~5MB dep for ZERO observable behavior (no analyzer calls `typeOf()`). NOT in this proposal.
- No DB write path for boundaries — CONFIG-driven only; `boundary_rule` table stays read-only.
- No upward severity clamp (down-only Zod refinement).
- No change to FINDINGS append-only semantics; no finding mutation anywhere.

## Capabilities

### New Capabilities
- None — all three gaps modify already-declared behavior.

### Modified Capabilities
- `architecture-analysis`: §1.1 — shared-extraction MUST emit `architectural-conflict` for clusters crossing a configured boundary (previously always `opportunity`).
- `memory-overlay`: §1.3 — overlay MUST clamp `PresentedFinding.severity` per `severityMap` while preserving `severityRaw`.
- `mcp-tools`: §3.5 — `explainFinding` response MUST include `memory.lastReason`.

(If these capability names differ from existing `openspec/specs/`, sdd-spec reconciles against actual spec filenames. Currently `openspec/specs/` holds only `parser-component-detection.md`.)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/analyzers/analyzer.ts` | Modified | Add `boundaryRules` to `AnalysisContext` (public interface) |
| `packages/core/src/engine/pipeline.ts` | Modified | Load config `boundaries` into ctx |
| `packages/core/src/analyzers/shared-extraction.ts` | Modified | Boundary-crossing predicate → `architectural-conflict` |
| `packages/core/src/memory/overlay.ts` | Modified | Read-time severity clamp |
| `packages/core/src/config/schema.ts` | Modified | `severityMap` + `boundaries` (Zod, down-only refinement) |
| `packages/core/src/config/resolve.ts` | Modified | Pass-through new config fields |
| `packages/core/src/mcp/tools.ts` | Modified | `lastReason` in explainFinding memory |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `AnalysisContext` is a public interface — adding `boundaryRules` breaks inline test doubles | High | Audit all `*.test.ts` that construct ctx inline; add field to each double in the same PR |
| `severityMap` allows circular/upward mapping (info→error) | Med | Zod refinement: reject upward maps; clamp DOWN only per spec |
| `explainFinding` return type is untyped in `tools.ts` | Med | Add/extend explicit return type for `memory` if MCP tool output is formally declared; otherwise document shape |
| Combining all three exceeds review budget | Low | ~105-140 lines, well under 400; §1.2 deliberately excluded |

## Rollback Plan

Three independent wirings, each revertible in isolation:
- **§1.3** — revert the single `overlay.ts` clamp line + remove `severityMap` from schema/resolve. Smallest blast radius.
- **§3.5** — revert the one `tools.ts` expression + type annotation. Standalone, one file.
- **§1.1** — revert `shared-extraction.ts` predicate AND its `analyzer.ts` context field + `pipeline.ts` loader + `schema.ts` `boundaries` knob (these move together). Largest unit but self-contained.

No persisted data migration; `boundary_rule` table untouched (read-only). Reverting any wiring restores the prior stub/identity behavior with no data cleanup.

## Exit Criteria (RFC 2119)

- The pipeline MUST emit a finding with `type === "architectural-conflict"` for a cluster whose component file pair crosses a configured boundary glob pair; it MUST remain `"opportunity"` when no boundary is crossed.
- The overlay MUST set `PresentedFinding.severity` to the mapped value when `severityMap` is configured, AND MUST leave `Finding.severityRaw` unchanged. Upward clamps MUST be rejected at config validation.
- `explainFinding` response MUST expose `memory.lastReason` equal to the most recent non-null feedback `reason`, or `null` when none exists. It MUST NOT mutate any finding.
- All 106 existing tests MUST remain green.
- `typecheck` and `build` MUST pass clean.
- Strict TDD: each gap MUST have a fail-first test that fails before wiring and passes after.

## Test Plan

Three deterministic fail-first tests (per exploration testability notes):
1. **§1.1** — two component files crossing a declared boundary; `expect(finding.type).toBe("architectural-conflict")` (currently `"opportunity"`). Plus a negative: non-crossing cluster stays `"opportunity"`.
2. **§1.3** — finding with `severityRaw: "error"`, config `severityMap: { error: "warn" }`; `expect(presented.severity).toBe("warn")` AND `expect(finding.severityRaw).toBe("error")`. Existing "overlay does NOT mutate the finding row" test continues to pass.
3. **§3.5** — record feedback with `reason: "architectural decision to keep separate"`, call `explainFinding`; `expect(result.memory.lastReason).toBe("architectural decision to keep separate")` (currently `undefined`).

## Dependencies

- None new. (§1.2's ts-morph dependency is deliberately deferred to `wire-ts-morph-pass2`.)

## Success Criteria

- [ ] `architectural-conflict` fires on a boundary-crossing cluster; non-crossing stays `opportunity`
- [ ] Severity down-clamp works AND `severityRaw` preserved; upward maps rejected
- [ ] `memory.lastReason` surfaced in `explainFinding`
- [ ] 106 existing tests green; typecheck + build clean
- [ ] Single PR under 400-line budget; §1.2 split out as `wire-ts-morph-pass2`
