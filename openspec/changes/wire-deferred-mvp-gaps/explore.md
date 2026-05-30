# Exploration — wire-deferred-mvp-gaps

**Change:** `wire-deferred-mvp-gaps`
**Phase:** explore
**Status:** done

## Executive summary

Four deferred MVP gaps (docs/gaps.md §1.1, §1.2, §1.3, §3.5) confirmed in real source. Three are small identity/no-op replacements that produce observable behavior. One (§1.2, ts-morph Pass-2) is infrastructure with NO consumer in this change — split it out.

**Revised scope:** C2 = §1.1 + §1.3 + §3.5 (~105-140 lines, under 400 budget). §1.2 → separate change `wire-ts-morph-pass2`, deferred until a type-aware analyzer needs it.

---

## Gap 1 — §1.1: `boundary_rule` → `architectural-conflict` never fires

**File:line:** `packages/core/src/analyzers/shared-extraction.ts:44-45`

```ts
// boundary check is a P4 feature (boundary_rule table empty in MVP) → always opportunity
const type = "opportunity" as const;
```

Scaffolding already complete: `boundary_rule` table in `schema.sql:41-45` (`id, from_glob, to_glob, kind, reason`), `FindingType` union in `types.ts:38` already declares `"architectural-conflict"`, `SharedExtractionEvidence` (types.ts:48) already has `conflict?: { rule: string; why: string }`. Only the predicate is missing.

**Critical discovery:** `AnalysisContext` (analyzer.ts) has NO `boundaryRules` field, and the config schema has no `boundaries` array. Rules exist in DB but there is no path to load them into analyzer context. Wiring requires a new `AnalysisContext` field + a load path in `pipeline.ts`.

**Wiring target:**
1. Add `boundaryRules: Array<{ fromGlob; toGlob; kind; reason? }>` to `AnalysisContext` (analyzer.ts)
2. Add `boundaries?` to `ConfigSchema` (schema.ts)
3. `pipeline.ts` populates `ctx.boundaryRules` from config
4. `shared-extraction.ts:44` — replace identity: if a cluster spans a declared boundary glob pair, emit `"architectural-conflict"` + populate `evidence.conflict`

**Files:** analyzer.ts, pipeline.ts, shared-extraction.ts, schema.ts · **~65-85 lines**
**Testability:** deterministic. Fail-first: two components crossing a declared boundary → `finding.type === "architectural-conflict"` (currently `"opportunity"`).
**Integrity risk:** LOW. `type` is CODE-derived from rule data; finding append-only at persist.

---

## Gap 2 — §1.2: `typeOf()` always returns null  → SPLIT OUT

**File:line:** `packages/core/src/engine/pipeline.ts:45`

```ts
types: { typeOf: () => null }, // lazy Pass-2 wired in P4
```

`TypeResolver` interface (`analyzer.ts:9`) = `typeOf(span): unknown | null`. **NO existing analyzer calls `ctx.types.typeOf()`.**

**Size:** ts-morph lazy Program init ~40-60 + span→type resolution ~30-50 + pipeline integration ~15-20 + tests ~40-60 = ~130-190 lines + a major new dependency (~5MB).

**SPLIT recommendation (substantiated):** wiring Pass-2 in C2 produces ZERO observable behavior change — no caller. It is infrastructure without a consumer in this change. Bundling it pushes C2 to 235-330 lines for a behavioral no-op. §1.2 needs a follow-up type-aware analyzer to have value. → **New change `wire-ts-morph-pass2`**, out of C2.

---

## Gap 3 — §1.3: Config severity-clamp is identity in the overlay

**File:line:** `packages/core/src/memory/overlay.ts:7`

```ts
const severity: Severity = f.severityRaw; // config severity-clamp is a P4 knob; identity here
```

`OverlayConfig` (overlay.ts:3) has `suppressBelow, amplifyAbove, minConf` but no severity map. The `overlay` function is already PURE — returns a derived `PresentedFinding`, never touches `f.severityRaw`. Non-mutation already tested (`overlay.test.ts:42-47`).

**Wiring target:**
1. Add `severityMap?: Partial<Record<Severity, Severity>>` to `OverlayConfig` + the `memory` section of `ConfigSchema`
2. overlay.ts:7 → `const severity = cfg.severityMap?.[f.severityRaw] ?? f.severityRaw`
3. Zod refinement: permit DOWN-clamping only (spec says "clamped")

**Files:** overlay.ts, schema.ts, config/resolve.ts · **~30-40 lines**
**Testability:** deterministic. Fail-first: `severityRaw: "error"` + `severityMap: { error: "warn" }` → `presented.severity === "warn"` AND `presented.severityRaw === "error"` (currently identity).
**Integrity risk:** NEGLIGIBLE. Read-time only, pure. `severityRaw` untouched; existing mutation test guards it.

---

## Gap 4 — §3.5: `reason` field in T4 feedback is inert

**File:line:** `packages/core/src/mcp/tools.ts:68-81` (`explainFinding`)

`reason` IS stored (`schema.sql:29 reason TEXT`), `FeedbackStore.eventsFor()` returns it (`feedback-store.ts:65`). The `events` array is loaded at tools.ts:69 but only `.length` is consumed — `reason` never surfaced.

**Wiring target:** add `lastReason` to the memory object in `Session.explainFinding()`:
```ts
lastReason: events.findLast(e => e.reason !== null)?.reason ?? null
```

**Files:** mcp/tools.ts only · **~10-15 lines**
**Testability:** deterministic. Fail-first: `recordFeedback({ reason: "architectural decision" })` → `explainFinding()` → `result.memory.lastReason === "architectural decision"` (currently undefined).
**Integrity risk:** NONE. `reason` is feedback metadata; surfacing informs LLM-facing view; T3 finding untouched; no LLM write path.

---

## Recommended dependency order (C2)

1. **Gap 3** (overlay severity-clamp) — smallest, no deps
2. **Gap 4** (reason surface) — standalone, no deps
3. **Gap 1** (boundary_rule) — analyzer.ts → pipeline.ts → shared-extraction.ts, most files, last

Gaps 3 & 4 independent (parallelizable). Gap 1 needs AnalysisContext extension first.

## Affected files (C2)

- `analyzers/analyzer.ts` — add `boundaryRules` to `AnalysisContext`
- `engine/pipeline.ts` — load boundary rules from config into ctx
- `analyzers/shared-extraction.ts` — boundary predicate replaces `"opportunity"` identity
- `memory/overlay.ts` — `severityMap` clamp replaces identity
- `config/schema.ts` — `severityMap` on memory + optional `boundaries` array
- `config/resolve.ts` — pass-through
- `mcp/tools.ts` — `lastReason` in explainFinding
- test files for each (inline `AnalysisContext` doubles need `boundaryRules`)

## Risks

1. **boundary_rule data source** — DB table exists but no config knob. DECISION before proposal: config-array-driven (version-controlled) vs DB-insert-driven (runtime). Recommend config-driven.
2. **AnalysisContext is public** — adding `boundaryRules` breaks inline test doubles. Audit `*.test.ts`.
3. **severityMap direction** — `Record<Severity,Severity>` allows upward (`info→error`); spec says "clamped" → Zod refinement to down-clamp only.
4. **explainFinding return type** — inline-typed; `lastReason` may need the MCP tool-output schema updated if formally declared.

## Next recommended

`sdd-propose`
