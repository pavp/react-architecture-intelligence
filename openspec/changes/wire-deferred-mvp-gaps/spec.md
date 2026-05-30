# Delta Spec: wire-deferred-mvp-gaps

**Change**: wire-deferred-mvp-gaps
**Scope**: Three deferred MVP stubs — §1.1 boundary→architectural-conflict, §1.3 severity-clamp, §3.5 reason surface
**Capabilities modified**: `architecture-analysis`, `memory-overlay`, `mcp-tools`

## Naming Decision

No existing `openspec/specs/` files match these three capability names. The only existing capability spec is `parser-component-detection.md`. Rather than create standalone `openspec/specs/architecture-analysis/spec.md` etc. now (no prior spec to delta against), all three gaps are specified here as a single delta change artifact. At archive time, the executor MAY promote each section to a new top-level capability spec.

## RECONCILIATION NOTE — boundary rule field shape (authoritative)

Spec and design drafts diverged on the boundary-rule field names. **This is the AUTHORITATIVE shape** for tasks + apply (matches the design, which was modeled against the read-only DB columns `from_glob`/`to_glob` and chooses concise config-facing names):

```ts
interface BoundaryRule { from: string; to: string; kind?: string; reason: string; }
```

- `from`, `to` — glob patterns (config-facing names; the DB columns remain `from_glob`/`to_glob`, untouched/read-only).
- `kind` — OPTIONAL categorization string.
- `reason` — REQUIRED human-readable reason (every boundary rule must justify itself).

All requirements/scenarios below referring to `fromGlob`/`toGlob` map to `from`/`to`. Apply MUST use `{ from, to, kind?, reason }`.

## Integrity Tiers (Cross-Cutting)

| Gap | Integrity boundary |
|-----|--------------------|
| §1.1 | CODE-tier predicate: `type` is derived from config rule data. Finding is append-only at persist. |
| §1.3 | Read-time overlay only. `severityRaw` MUST NOT be mutated. |
| §3.5 | Feedback-metadata surface only. NOT an LLM write path. No finding mutation. |

---

## ADDED Requirements — architecture-analysis

### Requirement: BoundaryRules Context Field

`AnalysisContext` (packages/core/src/analyzers/analyzer.ts) MUST gain a `boundaryRules` field typed as an array of `{ from: string; to: string; kind?: string; reason: string }` objects (see Reconciliation Note).

`boundaryRules` MUST be populated by the pipeline from the config `boundaries` array (CONFIG tier — version-controlled). The DB `boundary_rule` table MUST NOT be written by this change; it remains read-only.

The config schema (`packages/core/src/config/schema.ts`) MUST gain an optional `boundaries` array field containing objects with `from`, `to`, optional `kind`, and `reason`.

#### Scenario: Context populated from config

- GIVEN a `RaiConfig` with a non-empty `boundaries` array
- WHEN the pipeline builds `AnalysisContext`
- THEN `ctx.boundaryRules` equals the config boundaries array (same elements, same order)

#### Scenario: No boundaries configured

- GIVEN a `RaiConfig` with no `boundaries` field (field absent or empty array)
- WHEN the pipeline builds `AnalysisContext`
- THEN `ctx.boundaryRules` is an empty array (not undefined)

---

### Requirement: Boundary-Crossing Finding Type

`sharedExtraction` analyzer (packages/core/src/analyzers/shared-extraction.ts) MUST replace the hardcoded `const type = "opportunity"` at line 45 (the comment is at :44) with a boundary-crossing predicate.

For each qualifying cluster the analyzer MUST check whether ANY component file pair in the cluster has one file matching `from` and another matching `to` for any rule in `ctx.boundaryRules`. The matcher MUST be the existing `globMatch` util in `shared-extraction.ts` (no new glob dependency).

If a crossing is detected:
- The finding `type` MUST be `"architectural-conflict"`.
- `evidence.conflict` MUST be populated with `{ rule: string; why: string }` derived from the matched rule's `reason` (and its glob identity).

If no crossing is detected (or `ctx.boundaryRules` is empty):
- The finding `type` MUST remain `"opportunity"`.
- `evidence.conflict` MUST be absent (undefined).

The `type` value is CODE-derived from config rule data and MUST NOT be LLM-writable. The finding MUST remain append-only at persist time.

#### Scenario: Cluster crosses a declared boundary (positive)

- GIVEN `ctx.boundaryRules` contains `{ from: "src/features/**", to: "src/ui/**", reason: "features must not be shared into ui" }`
- AND a qualifying cluster contains components in both `src/features/` and `src/ui/`
- WHEN `sharedExtraction.analyze(ctx)` is called
- THEN the emitted finding has `type === "architectural-conflict"`
- AND `evidence.conflict` is defined with `rule` and `why` fields

#### Scenario: Cluster does not cross any boundary (negative)

- GIVEN `ctx.boundaryRules` contains one or more rules
- AND a qualifying cluster has all components in `src/ui/` only
- WHEN `sharedExtraction.analyze(ctx)` is called
- THEN the emitted finding has `type === "opportunity"`
- AND `evidence.conflict` is undefined

#### Scenario: No boundaries configured (negative)

- GIVEN `ctx.boundaryRules` is an empty array
- AND a qualifying cluster exists
- WHEN `sharedExtraction.analyze(ctx)` is called
- THEN the emitted finding has `type === "opportunity"`

---

## ADDED Requirements — memory-overlay

### Requirement: Severity Clamp Map

`OverlayConfig` (packages/core/src/memory/overlay.ts) MUST gain an optional `severityMap` field typed as `Partial<Record<Severity, Severity>>` where `Severity = "info" | "warn" | "error"`.

The config schema `memory` section MUST gain a corresponding optional `severityMap` field. (It MUST live under `config.memory` — the overlay receives `config.memory` as its `cfg` at `pipeline.ts:59`; placing it elsewhere silently no-ops the clamp.) Config validation MUST reject any mapping that would clamp a severity UPWARD. The severity order (ascending) is: `"info"` < `"warn"` < `"error"`. A mapping `A → B` is upward (and MUST be rejected) when B is strictly higher than A in this order.

The `overlay` function MUST set `PresentedFinding.severity` to `cfg.severityMap[f.severityRaw]` when that entry exists and is defined, else identity (`f.severityRaw`).

The `overlay` function MUST NOT mutate `f.severityRaw` or any other field on the source `Finding`. The overlay is read-time only; the stored finding in T3 MUST remain unchanged.

#### Scenario: Down-clamp applied

- GIVEN a finding with `severityRaw: "error"`
- AND `cfg.severityMap = { error: "warn" }`
- WHEN `overlay(f, w, cfg)` is called
- THEN `result.severity === "warn"`
- AND `f.severityRaw === "error"` (source finding unchanged)

#### Scenario: No severityMap — identity

- GIVEN a finding with `severityRaw: "warn"`
- AND `cfg` has no `severityMap` field
- WHEN `overlay(f, w, cfg)` is called
- THEN `result.severity === "warn"` (identity preserved)

#### Scenario: Upward map rejected at config validation

- GIVEN a config input with `memory.severityMap = { info: "error" }` (upward: info → error)
- WHEN the config is parsed/validated
- THEN validation MUST return an error (Zod parse failure or equivalent)
- AND the invalid config MUST NOT be accepted by the system

#### Scenario: Non-mutating overlay (regression)

- GIVEN the existing overlay non-mutation test
- WHEN overlay is called with any valid config (with or without severityMap)
- THEN the source `Finding` object is not mutated (all fields identical before and after)

---

## ADDED Requirements — mcp-tools

### Requirement: lastReason in explainFinding

The `explainFinding` method on `Session` (packages/core/src/mcp/tools.ts) MUST include a `lastReason` field in the returned `memory` object.

`lastReason` MUST equal the `reason` string from the most recent `FeedbackEvent` (by `createdAt` ascending order, last element) where `reason !== null`. If no such event exists, `lastReason` MUST be `null`.

`lastReason` MUST be sourced from `feedback.eventsFor()` return data only — no additional DB query, no LLM call, no finding mutation. No MCP server output-schema change is required (`server.ts` serializes the whole object via `JSON.stringify`; apply MUST NOT invent an output schema).

#### Scenario: Feedback with reason present

- GIVEN feedback has been recorded for a fingerprint with `reason: "architectural decision to keep separate"`
- WHEN `explainFinding({ fingerprint })` is called
- THEN `result.memory.lastReason === "architectural decision to keep separate"`

#### Scenario: No feedback / all-null reasons

- GIVEN no feedback events exist for a fingerprint, OR all feedback events have `reason === null`
- WHEN `explainFinding({ fingerprint })` is called
- THEN `result.memory.lastReason === null`

---

## Regression Requirement

### Requirement: Existing Test Suite Green

All 106 existing tests MUST remain green after wiring all three gaps. The `typecheck` and `build` commands MUST pass clean.

Any test file that constructs `AnalysisContext` inline MUST be updated to include a `boundaryRules` field (empty array is valid) to satisfy the updated interface. Per the design audit, this is exactly ONE file: `packages/core/src/analyzers/shared-extraction.test.ts` (the `ctx()` factory).

#### Scenario: Full test suite regression

- GIVEN all three gaps have been wired
- WHEN the full test suite is executed
- THEN all 106 existing tests pass
- AND no new type errors exist
