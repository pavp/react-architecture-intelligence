# Proposal: P13-S2 Evidence-Correlated Calibration Suggestions

## Intent

S1 (shipped) computes calibration suggestions using a blind `knob := current + 1` formula. When a user has rejected findings where render-coupling fanIn values were 6, 7, 9, and 12, S1 suggests `maxFanIn: 6` — clearing only one of the four rejected findings. S2 replaces that formula with evidence-correlated suggestions derived from the actual breach values of rejected findings stored in T3 (`finding.evidence_json`). The T4→T3 join already exists and is indexed; this is purely an additive computation layer on top. The system remains suggest-only (no writes to config, feedback, or memory).

## Scope

### In Scope

- `lookupRejectedEvidence(db, ruleId): number[]` — new core helper in `packages/core/src/calibration/evidence-lookup.ts`; executes the T4→T3 join (feedback_event rejected verdicts → finding.evidence_json via `FindingsStore.currentVersion`), extracts the primary metric per rule, returns a numeric array; pure read-only.
- Per-rule correlated formulas (four mappings, capped at `maxCap = 50`):
  - `react/render-coupling` → `max(evidence.fanIn over rejected)` → suggests `renderCoupling.maxFanIn`
  - `react/over-abstraction` → `max(evidence.propCount over rejected)` → suggests `overAbstraction.maxProps`
  - `react/hook-topology` → `max(evidence.fanIn over rejected)` → suggests `hookTopology.maxFanIn`
  - `react/shared-extraction` → `max(evidence.instances.length over rejected) + 1` → suggests `shared.minInstances` (inverted: raise floor)
- `computeSuggestionsWithEvidence(stats, currentConfig, evidenceByRule: Map<string, number[]>)` — new pure overload in `packages/core/src/calibration/suggest.ts`; original `computeSuggestions` left UNCHANGED as fallback.
- `runCalibrateCommand` wiring in `packages/cli/src/cli.ts`: build evidenceByRule map per calibratable rule (already has `db` in scope), pass to new overload.
- Upgraded rationale text: `"observed max fanIn: 12 across 4 rejected findings — suggest maxFanIn: 12 to clear all rejected findings"`.
- Tests: unit tests for `evidence-lookup.ts`; `cli.calibrate.test.ts` gains T3 fixture seeding.

### Out of Scope

- Secondary metric expansion per rule (`maxFanOut`, `maxDirectChildren`, `maxReachableDepth` for render-coupling; `maxHooks`, `maxChildren` for over-abstraction; `minCosine`, `minPropOverlap` etc. for shared-extraction) — deferred to S2.x.
- `--apply` flag (config write-back) — S3.
- Any schema or DB table change.
- New MCP tool.
- ML/probabilistic thresholds.

## Capabilities

### New Capabilities

- `calibration-evidence-lookup`: Core helper that resolves rejected fingerprints from T4 to typed evidence metrics in T3 via the existing (fingerprint, rule_id) index — no schema change required.

### Modified Capabilities

- `calibration-suggestions`: `computeSuggestions` gains evidence-correlated path via new pure overload; suggestions now cite observed breach max and count of rejected findings rather than a generic knob+1.

## Guardrail Compliance

| Guardrail | Status |
|-----------|--------|
| SUGGEST-ONLY | Join is read-only; no writes to config, feedback, memory, or DB |
| S1 fallback preserved | `computeSuggestions` signature unchanged; new overload falls back to generic `current+1` when evidence absent, insufficient, or newValue ≤ current |
| packages/core framework-agnostic | `evidence-lookup.ts` and `suggest.ts` carry zero React semantics; rule IDs are strings |
| Deterministic + pure | `computeSuggestionsWithEvidence` is a pure function over its inputs; same T4+T3 state → same output |
| Findings immutable | T3 is read-only from this path; no append, no update |
| Zero schema change | Reuses existing `finding.evidence_json` column and `idx_finding_fp` index |

## Resolved Open Questions

| # | Question | Decision |
|---|----------|----------|
| OQ1 | Expand CALIBRATABLE_RULES to secondary metrics? | No. Single primary knob per rule (S2 MVP). Secondary metrics are S2.x. |
| OQ2 | Rationale format: full value list vs. max+count? | Max + count only: `"observed max fanIn: 12 across 4 rejected findings"`. |
| OQ3 | `max(observed) == current` exactly? | Fall back to generic `current+1` (treat as insufficient evidence to improve). |
| OQ4 | cli.calibrate.test.ts coverage? | Gains T3 fixture seeding; integration test asserts correlated value, not just generic knob+1. |

## Reuse

- `FindingsStore.currentVersion(fp, ruleId)` — existing T3 query, reused directly.
- `idx_finding_fp` — existing index on `(fingerprint, rule_id)`, reused.
- S1's `computeSuggestions`, `aggregateFeedback`, `runCalibrateCommand` — all unchanged; S2 builds on, not replaces.

## Approach

Option C (from exploration): new pure overload + pre-computed evidence map. `runCalibrateCommand` (CLI) calls `lookupRejectedEvidence` per calibratable rule, assembles `Map<ruleId, number[]>`, passes to `computeSuggestionsWithEvidence`. Core function stays pure and testable without a DB. Evidence-lookup belongs in core (knows CALIBRATABLE_RULES and join semantics), making it reusable by a future MCP calibration tool.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/calibration/evidence-lookup.ts` | New | T4→T3 join helper; ~60 lines |
| `packages/core/src/calibration/suggest.ts` | Modified | New pure overload; ~40 lines added |
| `packages/cli/src/cli.ts` | Modified | Evidence wiring in runCalibrateCommand; ~10 lines |
| Tests | New/Modified | Unit (evidence-lookup) + integration (T3 fixtures); ~100 lines |

Estimated total: ~210 lines. Single PR, within 400-line budget.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Evidence staleness (currentVersion = latest, not at-rejection) | Low | Document in rationale; calibrating to current breach level is correct behavior |
| Fingerprint not in T3 (manual MCP feedback, no persisted finding) | Low | `currentVersion` returns null → graceful fallback to generic knob+1 |
| shared-extraction inverted direction suppresses legitimate same-size cluster | Low | Expected calibration behavior; user rejected that cluster size explicitly |
| New overload expands core API surface | Low | Export is internal to core; no external consumers |

## Rollback Plan

The new overload is additive. Revert by removing `evidence-lookup.ts` and the `computeSuggestionsWithEvidence` overload, and reverting the two-line wiring change in `cli.ts`. `computeSuggestions` (S1 behavior) is untouched and immediately operational.

## Dependencies

- S1 shipped on main (rai calibrate, aggregateFeedback, computeSuggestions) — confirmed.
- T3 `evidence_json` column populated by existing analysis pipeline — confirmed.

## Success Criteria

- [ ] `computeSuggestionsWithEvidence` is a pure function with no DB dependency (unit-testable with plain Map input).
- [ ] Correlated suggestion value = `max(observed breach metric over rejected findings)`, or `max+1` for `minInstances`, capped at 50.
- [ ] Fallback to `current+1` when evidence absent, insufficient, or newValue ≤ current (S1 not regressed).
- [ ] Rationale text cites observed max and count of rejected findings.
- [ ] SUGGEST-ONLY assertion (no-write) is covered by existing test or new test.
- [ ] Deterministic: same DB state → same suggestion output.
- [ ] Evidence staleness behavior documented in code comment.
- [ ] Zero schema change — CI migration check passes with no new migrations.
- [ ] Single PR ≤ 400 changed lines.
