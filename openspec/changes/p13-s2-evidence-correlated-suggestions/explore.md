# Exploration: P13-S2 — Evidence-Correlated Calibration Suggestions

Phase: explore · Persistence: hybrid · Engram topic: `sdd/p13-s2-evidence-correlated-suggestions/explore` (obs #675)

## Core Finding: Evidence IS Reachable — YES, zero schema change

T4 `feedback_event(fingerprint, rule_id, verdict)` joins to T3 `finding(fingerprint, rule_id, evidence_json)`
via the existing `idx_finding_fp` index. `FindingsStore.currentVersion(fp, ruleId)`
(`packages/core/src/memory/findings-store.ts`) already runs
`SELECT * FROM finding WHERE fingerprint=? AND rule_id=? ORDER BY analysis_version DESC LIMIT 1` and
deserializes `evidence_json` to the typed `Evidence`. Join path:

```
feedback_event[verdict IN reject/wontfix/dismiss] → finding.fingerprint+rule_id → JSON.parse(evidence_json) → typed metrics
```

**Staleness (documented, accepted):** `currentVersion` returns the LATEST analysis_version, not
values-at-rejection-time. If a component was refactored after rejection, metrics may differ.
Acceptable — calibrating to the CURRENT breach level for rejected components is correct, more useful
than stale values. Document, don't silently assume.

## S1 weakness this fixes

S1 suggests `knob := current + 1` blindly. If render-coupling fanIn breaches were rejected at 6,7,9,12,
`maxFanIn: 6` clears only 1 of 4. Evidence-correlated → `maxFanIn: 12` (max observed) clears all.

## Per-Rule Evidence → Knob Mapping (types confirmed in `packages/core/src/types.ts`)

| Rule | Evidence metric | Direction | Correlated formula | S1 knob |
|------|----------------|-----------|-------------------|---------|
| react/render-coupling | `evidence.fanIn` | ceiling (raise) | `max(fanIn over rejected)` | `renderCoupling.maxFanIn` |
| react/over-abstraction | `evidence.propCount` | ceiling | `max(propCount over rejected)` | `overAbstraction.maxProps` |
| react/hook-topology | `evidence.fanIn` | ceiling | `max(fanIn over rejected)` | `hookTopology.maxFanIn` |
| react/shared-extraction | `evidence.instances.length` | floor (inverted) | `max(instances.length over rejected) + 1` | `shared.minInstances` |

shared-extraction is INVERTED: minInstances is a minimum; raise it to clear small rejected clusters.
`max(instances.length)+1` is the conservative choice — clears ALL rejected clusters.

## Correlated Algorithm + Fallback

Per calibratable rule meeting the S1 trigger (negativeRate>=0.5, totalEvents>=3):
1. `SELECT DISTINCT fingerprint FROM feedback_event WHERE rule_id=? AND verdict IN (reject,wontfix,dismiss)`.
2. For each fp → `FindingsStore.currentVersion(fp, ruleId)`; if null, skip.
3. Extract the rule's primary metric from evidence.
4. If >=1 value recovered: `newValue = max(values)` (or `max+1` for minInstances), capped at maxCap=50.
5. If `newValue > currentConfigValue` → emit correlated suggestion citing observed max + count.
6. If `newValue <= current` OR zero evidence recovered → FALL BACK to S1 generic `current+1` (S1 behavior preserved).

Rationale upgrade: `"observed max fanIn: 12 across 4 rejected findings — suggest maxFanIn: 12 to clear all rejected findings"`.

## What S2 Touches (Option C — recommended)

- `packages/core/src/calibration/evidence-lookup.ts` (NEW ~60): `lookupRejectedEvidence(db, ruleId): number[]` — the T4→T3 join, pure read-only, no writes.
- `packages/core/src/calibration/suggest.ts` (MODIFY ~40): NEW overload `computeSuggestionsWithEvidence(stats, currentConfig, evidenceByRule: Map<string, number[]>)`. Original `computeSuggestions` UNCHANGED as pure fallback.
- `packages/cli/src/cli.ts` (MODIFY ~10): `runCalibrateCommand` (already has `db`) builds the evidence map per calibratable rule, passes to the new overload.
- Tests (~100): new evidence-lookup unit tests; `cli.calibrate.test.ts` gains T3 fixtures.

`aggregateFeedback` UNCHANGED. No new MCP tool. No new config knob.

**Why Option C over A/B:** keeps `computeSuggestions` pure (testable without a DB); evidence-lookup is
domain logic (knows CALIBRATABLE_RULES + T3/T4 join) so it belongs in core, reusable by a future MCP
calibration tool. Option A (db param on computeSuggestions) breaks purity; Option B puts DB logic in CLI.

## Core Change Needed

**NO.** T3 already persists `evidence_json` indexed on (fingerprint, rule_id); `currentVersion` is the
existing query. Zero schema additions, zero new DB code.

## Estimated Lines

~210 total (evidence-lookup ~60, suggest ~40, cli ~10, tests ~100). Single PR, fits even the 400 default.

## Risks

- Evidence staleness (latest vs at-rejection) — benign, documented.
- Fingerprint algo-version mismatch if `fp_algo_version` bumped — low risk (unchanged since inception); `currentVersion` takes latest regardless.
- Rejection referencing a fingerprint never persisted to T3 (manual MCP feedback) → `currentVersion` null → graceful generic fallback.
- shared-extraction inverted direction — `max+1` may suppress a legitimate cluster of the same size; expected calibration behavior (user rejected that size).
- New overload expands core API surface (internal) — acceptable.

## Open Questions for Proposal

1. Expand CALIBRATABLE_RULES to all metrics per rule (maxFanOut/maxDirectChildren/maxReachableDepth, maxHooks/maxChildren)? → OUT of scope S2; single primary knob per rule is the MVP; S2.x material.
2. Rationale format — cite max + count (recommended) vs full value list.
3. `max(observed) == current` exactly → fall back to generic `current+1` (confirm).
4. cli.calibrate.test.ts needs T3 fixture seeding (currently T4-only).

## Status

Ready for proposal. Evidence reachability definitively confirmed. Additive, pure, backward-compatible (S1 fallback preserved), deterministic, no ML, zero schema change. Single PR ~210 lines.
