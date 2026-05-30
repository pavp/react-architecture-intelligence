# Design: Wire Three Deferred MVP Gaps

## Context

Three deferred gaps from `gaps.md`, each a deliberate P0–P3 stub whose types, columns, and call sites already exist. This change activates the live behavior with minimal new surface. The ts-morph Pass-2 gap (§1.2) is split out into a separate future change `wire-ts-morph-pass2` (zero observable behavior in this scope, ~130–190 LOC, ~5 MB dependency). Boundary-rule source is **CONFIG-array-driven**; the DB `boundary_rule` table stays read-only.

All line references below were verified directly against source (not inherited from the exploration handoff). Corrections to the exploration are called out.

## Verified Source Map (corrected line refs)

| File | Ref | Verified fact |
|------|-----|---------------|
| `analyzers/shared-extraction.ts` | `:45` | `const type = "opportunity" as const` is the assignment (exploration said `:44`; `:44` is the comment). Push block `:47-67`. |
| `analyzers/shared-extraction.ts` | `:80-98` | Existing reusable `globMatch(glob, path)` util. **REUSE — do NOT add a glob dependency.** |
| `analyzers/analyzer.ts` | `:12-21` | `AnalysisContext` interface; `boundaryRules` added here. `TypeResolver` `:9` untouched (that is §1.2). |
| `engine/pipeline.ts` | `:43-48` | ctx object literal; `types: { typeOf: () => null }` at `:45`. Boundary load added here. |
| `engine/pipeline.ts` | `:59` | `overlay(persisted, w, input.config.memory)` — overlay's `cfg` is `config.memory`. **⇒ `severityMap` MUST live under `config.memory`.** |
| `types.ts` | `:37` | `Severity = "info" \| "warn" \| "error"` — clamp rank: `info=0 < warn=1 < error=2`. |
| `types.ts` | `:38` | `FindingType = "opportunity" \| "architectural-conflict"` — union member present. |
| `types.ts` | `:48` | `conflict?: { rule: string; why: string }` on `SharedExtractionEvidence`. |
| `types.ts` | `:61` / `:69` | `Finding.severityRaw` (stored) vs `PresentedFinding.severity` (derived). |
| `memory/overlay.ts` | `:3` / `:7` | `OverlayConfig` inline `{ suppressBelow; amplifyAbove; minConf }`; clamp identity at `:7`; fn is pure (`return { ...f, ... }`). |
| `config/schema.ts` | `:26-31` / `:32` | `memory` section; `excludeGlobs` after. **No existing Zod `.refine`/`.superRefine` anywhere in this file.** |
| `config/resolve.ts` | whole | Pure pass-through (`ConfigSchema.parse`) — inherits new fields, zero code change. |
| `mcp/tools.ts` | `:66-82` | `explainFinding`; **inline** return type (no declared interface); `events` (`:69`) used only for `.length` (`:77`). |
| `memory/feedback-store.ts` | `:58-67` | `eventsFor` returns `FeedbackEvent[]` ordered `created_at ASC` → `findLast` is safe; `reason` is nullable. |
| `mcp/server.ts` | `:52-57` | `explain_finding` registered with **input schema only**; output via `JSON.stringify(r)` text block → no server change for `lastReason`. |
| `db/schema.sql` | `:42-43` | `boundary_rule (id, from_glob, to_glob, kind, reason)` — never queried; stays read-only. |

## Architecture Approach

No new architectural pattern. Each gap activates an already-scaffolded seam at its existing layer, preserving the pipeline's purity boundary (pure analyzers + pure overlay, impure persistence around them). Three changes, three independent rollbacks.

```
config (CONFIG tier, version-controlled)
  │  boundaries[]          severityMap (under memory)
  ▼                         │
pipeline.ts ── builds AnalysisContext ──┐         │
  │  ctx.boundaryRules = config.boundaries        │
  ▼                                                ▼
shared-extraction.analyze(ctx)            overlay(persisted, w, config.memory)
  │  PURE: glob-match cluster file pairs     │  PURE: read-time severity clamp
  │  → type + evidence.conflict              │  → PresentedFinding.severity (severityRaw untouched)
  ▼                                          ▼
Finding (append-only)                  PresentedFinding (derived, never persisted)

feedback-store.eventsFor() ──► tools.explainFinding() ──► memory.lastReason (LLM-facing view)
```

## Component & Data-Flow Design

### §1.1 — boundary → `architectural-conflict` (CONFIG-array-driven)

**New context field** (`analyzer.ts`):
```ts
export interface BoundaryRule { from: string; to: string; kind?: string; reason: string; }
// inside AnalysisContext:
boundaryRules: readonly BoundaryRule[];
```

**Pipeline load** (`pipeline.ts`, in the ctx literal `:43-48`):
```ts
boundaryRules: input.config.boundaries,
```

**Predicate** (`shared-extraction.ts`, replacing the `:45` identity):
```ts
// boundary check (§1.1): a cluster crossing a configured boundary is a conflict, not an opportunity
const files = comps.map((x) => x.file);
let conflict: { rule: string; why: string } | undefined;
outer: for (let i = 0; i < files.length; i++) {
  for (let j = 0; j < files.length; j++) {
    if (i === j) continue;
    for (const rule of ctx.boundaryRules) {
      if (globMatch(rule.from, files[i]!) && globMatch(rule.to, files[j]!)) {
        conflict = {
          rule: rule.reason || `${rule.from} → ${rule.to}`,
          why: `boundary ${rule.from} → ${rule.to} crossed by ${files[i]}, ${files[j]}`,
        };
        break outer;
      }
    }
  }
}
const type: FindingType = conflict ? "architectural-conflict" : "opportunity";
```
- Files compared: each cluster member's `comp.file` (repo-relative path string, e.g. `"features/cart/Button.tsx"`).
- Matcher: the **existing** `globMatch` at `shared-extraction.ts:80-98`. No new dependency.
- `evidence.conflict` is populated only on a match and spread into the existing evidence object at the push site (`:57-65`). `type` loses `as const` and is typed `FindingType`.
- No DB write. `boundary_rule` table stays read-only. Type is CODE-derived from CONFIG rule data — deterministic: same code + same config ⇒ same finding type.

**Schema** (`schema.ts`, new top-level knob):
```ts
boundaries: z.array(z.object({
  from: z.string(),
  to: z.string(),
  kind: z.string().optional(),
  reason: z.string(),
})).default([]),
```
`resolve.ts` inherits it (pass-through). The conflict's `rule`/`why` map to the config rule's `reason` and its glob identity — mirroring the read-only DB columns without touching the DB.

### §1.3 — read-time severity clamp (down-only)

**OverlayConfig** (`overlay.ts:3`):
```ts
export interface OverlayConfig {
  suppressBelow: number; amplifyAbove: number; minConf: number;
  severityMap?: Partial<Record<Severity, Severity>>;
}
```

**Clamp** (`overlay.ts:7`, the single line):
```ts
const severity: Severity = cfg.severityMap?.[f.severityRaw] ?? f.severityRaw;
```
- `f.severityRaw` is **never** assigned. Overlay stays pure (`return { ...f, severity, ... }`). The existing test "overlay does NOT mutate the finding row" (`overlay.test.ts:42`) continues to hold.

**Schema** (`schema.ts`, inside the `memory` object `:26-31`, because `pipeline.ts:59` passes `config.memory` as the overlay cfg):
```ts
memory: z.object({
  halfLifeDays: z.number().positive().default(180),
  suppressBelow: z.number().min(-1).max(1).default(-0.3),
  amplifyAbove: z.number().min(-1).max(1).default(0.3),
  minConf: z.number().min(0).max(1).default(0.4),
  severityMap: z.record(z.enum(["info","warn","error"]), z.enum(["info","warn","error"])).optional(),
}).default({})
.superRefine((m, ctx) => {
  const rank = { info: 0, warn: 1, error: 2 } as const;
  for (const [k, v] of Object.entries(m.severityMap ?? {})) {
    if (rank[v as Severity] > rank[k as Severity]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `severityMap may only clamp DOWN: ${k} -> ${v} raises severity`,
      });
    }
  }
})
```
- **Down-only predicate:** a mapping `raw → mapped` is valid iff `rank[mapped] <= rank[raw]`. Rejected: `info→warn`, `info→error`, `warn→error`. Allowed: identity and any downward map.
- This is written from scratch — there is no pre-existing refinement in `schema.ts` to match.

### §3.5 — surface `lastReason`

**explainFinding** (`tools.ts`, in the returned `memory` object `:74-80`):
```ts
memory: {
  weight: f.weight?.value ?? 0,
  confidence: f.weight?.confidence ?? 0,
  eventCount: events.length,
  net: /* unchanged */,
  lastReason: events.findLast((e) => e.reason !== null)?.reason ?? null,
},
```
- `findLast` is safe: `eventsFor` returns a real `FeedbackEvent[]` ordered `created_at ASC`, so `findLast` yields the most recent non-null reason.
- Return type stays **inline** (no declared interface exists; none is introduced — keeps the diff minimal and matches the file's convention).
- No MCP server change: `server.ts` serializes the whole object via `JSON.stringify`; `lastReason` flows through automatically.
- No finding mutation. `reason` is feedback metadata feeding the LLM-facing view only.

## AnalysisContext Breakage Audit (the proposal's HIGH risk — exact list)

Adding a **required** `boundaryRules` field to `AnalysisContext` breaks any inline constructor that does not supply it. Full source audit result:

| File | Constructs ctx? | Action |
|------|-----------------|--------|
| `analyzers/shared-extraction.test.ts:16-25` | YES — `ctx()` factory (`Partial<AnalysisContext>` + spread) | **Add `boundaryRules: []`** to the default literal. The only test double requiring change. |
| `engine/pipeline.ts:43-48` | YES (production) | Add the `boundaryRules` load (part of §1.1 wiring). |
| `engine/pipeline.test.ts` | NO — calls `analyzeRepo()` | No change. |
| `engine/golden.test.ts` | NO — routes through pipeline | No change. |
| `mcp/tools.test.ts` | NO — `createSession` → `analyzeRepo` | No change. |
| `mcp/server.test.ts` | NO | No change. |

Net: **one** test-double edit. The proposal's "audit all `*.test.ts`" risk resolves to a single line.

## Integrity Invariants (boundaries apply MUST NOT cross)

1. **§1.1 — CODE-derived type from CONFIG.** `type` is computed by the pure predicate from `ctx.boundaryRules` (config data), never from LLM input. Findings remain append-only at persist (`createdAt` set by the runner, body unchanged). No DB write to `boundary_rule`.
2. **§1.3 — read-time, no mutation.** The clamp affects only `PresentedFinding.severity`. `Finding.severityRaw` is never written. Overlay stays pure. The stored finding row is identical with or without a `severityMap`.
3. **§3.5 — feedback metadata only.** `lastReason` is read from feedback events and surfaced in the LLM-facing view. No finding is mutated. This is not an LLM write path; the sole memory write door (`feedback-store.record`) is untouched.

## Dependency Order & Test Boundary (Strict TDD — fail-first per gap)

| Order | Gap | Fail-first test layer | Assertion |
|-------|-----|-----------------------|-----------|
| 1 | §1.3 | unit `overlay.test.ts` + `config/resolve.test.ts` | `severityRaw:"error"` + `severityMap:{error:"warn"}` ⇒ `severity==="warn"` AND `severityRaw==="error"`; upward map (`info→error`) rejected at parse. |
| 2 | §3.5 | unit `mcp/tools.test.ts` | record feedback with `reason` → `explainFinding().memory.lastReason === reason` (currently `undefined`). |
| 3 | §1.1 | unit `analyzers/shared-extraction.test.ts` (+ optional `pipeline.test.ts` integration) | crossing pair ⇒ `type==="architectural-conflict"`; negative: non-crossing cluster stays `"opportunity"`. ctx factory gains `boundaryRules`. |

Rationale for order: §1.3 is smallest and schema-local; §3.5 is one file and standalone; §1.1 is most files (context + pipeline + analyzer + schema) and goes last. Each test must fail before its wiring and pass after.

## Architecture Decision Records

**ADR-1 — Boundary rules from a CONFIG array (rejected: DB insert).**
Decision: rules live in `ConfigSchema.boundaries[]`, loaded into `ctx.boundaryRules` each run. Rejected runtime DB inserts because they break determinism (same code different output), bypass version control, and add a write path this change explicitly excludes. The `boundary_rule` table is preserved read-only for a future runtime-management change.

**ADR-2 — Down-only severity via `superRefine` (rejected: free `Record`).**
Decision: `severityMap` is `Partial<Record<Severity,Severity>>` constrained by a `superRefine` enforcing `rank[mapped] <= rank[raw]`. Rejected an unconstrained record because the spec says "clamped," and an upward map (`info→error`) would let config escalate severity — violating the leak-invariant that severity is computed by CODE and only clamped by CONFIG.

**ADR-3 — Split §1.2 (ts-morph Pass-2) out.**
Decision: excluded from this change → `wire-ts-morph-pass2`. It adds ~130–190 LOC and a ~5 MB dependency for zero observable behavior (no analyzer calls `ctx.types.typeOf()`), would inflate the review budget, and carries independent lazy-init/correctness risk deserving focused review.

**ADR-4 — `severityMap` under `config.memory` (not top-level).**
Decision: place it inside the `memory` section. `pipeline.ts:59` passes `input.config.memory` as the overlay's `cfg`; putting `severityMap` anywhere else would require threading a second config object into the pure overlay or silently no-op the clamp.

## Rollback Plan

Three isolated reverts:
- **§1.3** — revert the single `overlay.ts` line + remove `severityMap` from the `memory` schema. Smallest blast radius.
- **§3.5** — revert the one `tools.ts` expression. One file.
- **§1.1** — revert the `shared-extraction.ts` predicate, the `analyzer.ts` field, the `pipeline.ts` loader, the `schema.ts` `boundaries` knob, and the test-double field. Largest unit but self-contained.

No data migration; `boundary_rule` untouched. Reverting any wiring restores the prior stub/identity behavior with no cleanup.
