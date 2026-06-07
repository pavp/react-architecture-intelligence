# Design: P13-S2 Evidence-Correlated Calibration Suggestions

## Technical Approach

Additive computation layer over the shipped S1 calibrate flow. S2 replaces the blind `knob := current + 1` formula with values derived from the actual breach metrics of *rejected* findings, recovered through the existing T4→T3 join (`feedback_event` negative verdicts → `finding.evidence_json` via `FindingsStore.currentVersion`). Zero schema change, zero analyzer change. `packages/core` stays framework-agnostic: the new code keys on `ruleId` strings and evidence `kind` discriminants (data), carrying no React semantics.

Proposal Option C: a new pure overload `computeSuggestionsWithEvidence` consumes a pre-fetched `Map<ruleId, number[]>`. A new read-only core helper `lookupRejectedEvidence` performs the DB join. The CLI orchestrates: aggregate → lookup per calibratable rule → suggest. `computeSuggestions` is left byte-for-byte unchanged as the generic fallback path and reused building block.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|----------|--------|----------|-----------|
| D1 | Where evidence DB access lives | New `evidence-lookup.ts` in core; pure overload consumes pre-fetched map | (A) add `db` param to `computeSuggestions`; (B) inline lookup in cli.ts | Keeps `computeSuggestions` pure/testable; lookup is core domain logic (knows T3/T4 join + CALIBRATABLE_RULES), reusable by a future MCP tool; no IO in the suggestion math. |
| D2 | `FindingsStore` ownership | `lookupRejectedEvidence` constructs `new FindingsStore(db)` internally | take a `FindingsStore` param | `FindingsStore` is NOT exported from core index; CLI only has `Db`. Helper takes `Db`, builds its own store. |
| D3 | Per-rule metric direction | render-coupling/over-abstraction/hook-topology = ceiling (raise to `max`); shared-extraction = floor (raise to `max+1`) | min-based floor; per-metric expansion | Matches S1 single primary knob; max-over-rejected clears all rejected ceiling breaches; `max+1` raises the floor above the largest rejected cluster. |
| D4 | Generic-suggestion duplication | Extract a small `buildGenericSuggestion(stat, currentConfig)` helper shared by both functions | duplicate the current+1 block | DRY; `computeSuggestions` observable behavior/signature unchanged. |
| D5 | Value when `max(observed) <= current` | Fall back to generic current+1 (incl. exact equality) | suggest no-op / suppress | OQ3: equal or stale evidence still yields a useful generic bump, never a regression. |

## Data Flow

```
runCalibrateCommand (cli.ts, db in scope)
   │
   ├─ aggregateFeedback(db) ──────────────► RuleFeedbackStats[]   (T4 aggregate, unchanged)
   │
   ├─ for each CALIBRATABLE_RULES rule past trigger:
   │       lookupRejectedEvidence(db, ruleId)                     (T4 negatives → T3 evidence)
   │         SELECT DISTINCT fingerprint FROM feedback_event
   │           WHERE rule_id=? AND verdict IN ('reject','wontfix','dismiss')
   │         per fp → FindingsStore.currentVersion(fp, ruleId)    (SELECT-only)
   │           if null → skip; if evidence.kind != expected → skip
   │           else extract primary metric → number
   │       → evidenceByRule.set(ruleId, number[])
   │
   └─ computeSuggestionsWithEvidence(stats, currentConfig, evidenceByRule)  (PURE, no db)
           per rule: evidence present & >current → correlated; else → generic (S1)
```

All three new code paths issue **only SELECTs**. No INSERT/UPDATE/DELETE anywhere.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/calibration/evidence-lookup.ts` | Create | `lookupRejectedEvidence(db, ruleId): number[]` + per-rule extractor map; pure read-only join. |
| `packages/core/src/calibration/suggest.ts` | Modify | Add `computeSuggestionsWithEvidence` + extract `buildGenericSuggestion`; `computeSuggestions` unchanged. |
| `packages/cli/src/cli.ts` | Modify | `runCalibrateCommand`: build `evidenceByRule`, call new overload (~10 lines). |
| `packages/core/src/index.ts` | Modify | Export `lookupRejectedEvidence` + `computeSuggestionsWithEvidence`. |
| `packages/core/src/calibration/evidence-lookup.test.ts` | Create | Unit tests for the join/extraction. |
| `packages/core/src/calibration/suggest.test.ts` | Modify/Create | Unit tests for the overload (correlated/cap/fallback/inverted/determinism). |
| `packages/cli/src/cli.calibrate.test.ts` | Modify | T3 fixture seeding + extended no-write guardrail. |

## Interfaces / Contracts

```ts
// evidence-lookup.ts (core) — pure, read-only
export function lookupRejectedEvidence(db: Db, ruleId: string): number[];

// Verified extractor mapping (ruleId → evidence.kind → primary metric field):
//   react/render-coupling  → "render-coupling"  → evidence.fanIn
//   react/over-abstraction → "over-abstraction" → evidence.propCount
//   react/hook-topology    → "hook-topology"    → evidence.fanIn
//   react/shared-extraction→ "shared-extraction"→ evidence.instances.length
// Guard: if currentVersion(fp,ruleId).evidence.kind !== expected kind → skip (defensive).

// suggest.ts (core) — PURE, evidence pre-fetched
export function computeSuggestionsWithEvidence(
  stats: RuleFeedbackStats[],
  currentConfig: RaiConfig,
  evidenceByRule: Map<string, number[]>,
): CalibrationSuggestion[];
```

### Correlated arithmetic (exact)

For a calibratable rule past trigger with `values = evidenceByRule.get(ruleId)`:

- **Ceiling knobs** (render-coupling, over-abstraction, hook-topology):
  `newValue = Math.min(Math.max(...values), maxCap)` (maxCap=50). Suggest only if `newValue > current`.
- **Floor knob** (shared-extraction `minInstances`):
  `newValue = Math.min(Math.max(...values) + 1, maxCap)`. Suggest only if `newValue > current` (raising the floor above the largest rejected cluster).
- Both compare `newValue > current` in the SAME direction (raise). For the floor knob, `current` is the minimum-instances threshold; raising it suppresses clusters at/under the rejected sizes.
- Correlated patch reuses `calibratable.buildPatch(newValue)` and the same `ConfigSchema.partial().safeParse` hard gate as S1.
- Rationale cites observed max + count: `"...observed max <metric>: <newValue> across <values.length> rejected findings — suggest <knob>: <newValue> to clear all rejected findings"`.
- If `values` absent/empty, or `newValue <= current` → `buildGenericSuggestion` (S1 current+1). Determinism: `Math.max` over a set is order-independent; same DB state → same output.

## Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Zero rejected fingerprints | `evidenceByRule` absent → generic current+1. |
| All rejected fps return `currentVersion === null` | empty `[]` → generic. |
| Partial (subset resolves) | `max` over the resolved subset. |
| `max(observed) == current` | generic (not no-op). |
| `max(observed) < current` (stale/refactored) | generic. |
| `max(observed) > 50` | capped at 50. |
| `evidence.kind` mismatch for a fp | skip that fp (defensive). |
| shared-extraction `max+1` exceeds cap | `min(max+1, 50)`. |
| Calibratable rule NOT past trigger | no suggestion; evidence not even looked up. |
| Adapter/unknown rule | severity downgrade path (S1); evidence path not entered. |

## SUGGEST-ONLY Invariant

`lookupRejectedEvidence` issues only `SELECT DISTINCT ... feedback_event` plus `FindingsStore.currentVersion` (confirmed SELECT-only). The overload is pure (no db). The CLI wiring opens `db` read-only and closes in `finally`. The existing S1 guardrail tests (no `rai.config.json` create/modify; `feedback_event` row count unchanged) are extended to also assert the `finding` row count is unchanged after seeding T3+T4 and running calibrate.

## Testing Strategy

| Layer | What | Approach (strict TDD) |
|-------|------|----------------------|
| Unit | `lookupRejectedEvidence` | Temp db: seed T3 findings (raw SQL, all 11 finding columns) + T4 negatives; assert correct metric per rule; null-finding skip; kind-mismatch skip; empty→`[]`. |
| Unit | `computeSuggestionsWithEvidence` | Correlated max per 4 rules; cap-50; fallback no-evidence; fallback `<=`current incl. equal; partial subset; inverted `minInstances` max+1; determinism; rationale cites max+count. |
| Integration | `runCalibrateCommand` | `cli.calibrate.test.ts` gains a T3 fixture (raw INSERT into `finding`); seed T3+T4 → assert correlated suggestion in output; extend no-write guardrail (finding count unchanged). |

`FindingsStore` is not exported, so tests seed `finding` rows via raw SQL (mirroring `seedFeedback`).

## Migration / Rollout

No migration required. T3 `evidence_json` + `idx_finding_fp` already exist. No new MCP tool, no analyzer change, single PR (~210 lines, within 400 budget).

## Open Questions

- [ ] None blocking. (Multi-metric expansion per rule deferred to S2.x per OQ1.)
