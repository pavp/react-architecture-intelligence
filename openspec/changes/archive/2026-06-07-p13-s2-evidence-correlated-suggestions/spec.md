# Delta for calibration

Change: `p13-s2-evidence-correlated-suggestions` · Persistence: hybrid
Extends the existing `calibration` capability (S1). All S1 requirements not listed below remain unchanged. At archive these merge into `openspec/specs/calibration/spec.md` IN PLACE.

## ADDED Requirements

### Requirement: Rejected-Finding Evidence Lookup

For each calibratable core rule, the system MUST resolve the breach-metric values recorded in the rejected findings for that rule by joining T4 negative feedback to T3 evidence. The lookup MUST select distinct fingerprints from `feedback_event` (T4) where verdict is `reject`, `wontfix`, or `dismiss` for the rule, resolve each `(fingerprint, rule_id)` to its current finding via `FindingsStore.currentVersion`, extract the rule's primary metric, and return a numeric array. The lookup MUST be strictly read-only over T4 and T3 (no insert, update, or delete) and MUST require no schema change. The extracted primary metric per rule MUST be: `react/render-coupling` → `evidence.fanIn`; `react/over-abstraction` → `evidence.propCount`; `react/hook-topology` → `evidence.fanIn`; `react/shared-extraction` → `evidence.instances.length`.

#### Scenario: Lookup returns observed breach metrics for rejected findings

- GIVEN T4 has `reject`/`wontfix`/`dismiss` events for `react/render-coupling` on fingerprints whose current T3 findings carry `fanIn` of 6, 7, 9, 12
- WHEN evidence is looked up for that rule
- THEN the returned array contains 6, 7, 9, and 12
- AND no T3 or T4 row is mutated.

#### Scenario: Unresolvable fingerprint is skipped, not zeroed

- GIVEN a rejected fingerprint for a rule whose `FindingsStore.currentVersion(fp, ruleId)` returns null (no persisted finding)
- WHEN evidence is looked up for that rule
- THEN that fingerprint contributes no value to the returned array
- AND it is NOT treated as the value 0.

### Requirement: Evidence-Correlated Suggestion Fallback

When a calibratable core rule passes the trigger but has zero rejected fingerprints resolvable to T3 evidence, OR the correlated `newValue` is less than or equal to the current configured value (including exactly equal), the engine MUST fall back to the S1 generic `current + 1` suggestion. The fallback MUST NOT emit a no-op patch and MUST NOT suggest a value lower than the current threshold. When only some rejected fingerprints resolve (partial evidence), the correlated value MUST be derived from the resolved subset only.

#### Scenario: No recoverable evidence falls back to generic current+1

- GIVEN `react/render-coupling` passes the trigger and current `renderCoupling.maxFanIn` is 5
- AND none of its rejected fingerprints resolve to T3 evidence
- WHEN suggestions are computed with evidence
- THEN the suggested `renderCoupling.maxFanIn` is 6 (`current + 1`, S1 behavior)
- AND the patch validates against `ConfigSchema.partial()`.

#### Scenario: Correlated value equal to current falls back (boundary)

- GIVEN `react/render-coupling` passes the trigger and current `renderCoupling.maxFanIn` is 12
- AND the observed max `fanIn` over rejected findings is exactly 12
- WHEN suggestions are computed with evidence
- THEN the engine falls back to generic `current + 1`, suggesting `renderCoupling.maxFanIn` of 13
- AND it does NOT emit a no-op or a value below 12.

#### Scenario: Partial evidence uses the resolved subset

- GIVEN four rejected fingerprints where two resolve to `fanIn` 7 and 9 and two return null
- WHEN suggestions are computed with evidence
- THEN the correlated value is derived from {7, 9} only (max 9)
- AND the null fingerprints are skipped, not counted as 0.

## MODIFIED Requirements

### Requirement: Core-Rule Threshold Suggestions

For the core calibratable rules `react/shared-extraction`, `react/render-coupling`, `react/over-abstraction`, and `react/hook-topology`, when a rule passes the trigger the engine MUST suggest raising the relevant threshold knob for that rule, and that knob MUST exist in `ConfigSchema` for the rule's config group (e.g. `shared.minInstances` for `react/shared-extraction`, `renderCoupling.maxFanIn` for `react/render-coupling`). When recoverable rejected-finding evidence is available and improves on the current value, the suggested value MUST be evidence-correlated rather than a blind `current + 1`: the ceiling-direction rules MUST suggest `max(metric over rejected)` and the inverted floor rule `react/shared-extraction` MUST suggest `max(evidence.instances.length over rejected) + 1`. Every suggested value MUST be capped at `maxCap = 50`. The correlated suggestion's rationale MUST cite the observed max metric and the count of rejected findings it was derived from. The engine MUST remain a deterministic pure function: the same trigger stats, current config, and per-rule evidence MUST produce identical suggestions across runs. The resulting patch MUST validate against `ConfigSchema.partial()`.
(Previously: suggested only `current + 1` with no evidence correlation, cap, or observed-count rationale.)

Note: evidence reflects the current (latest) `analysis_version` via `FindingsStore.currentVersion`, not the values at rejection time. By design the correlated value tracks the current breach level of the rejected components.

#### Scenario: Shared-extraction suggestion raises a valid knob

- GIVEN `react/shared-extraction` passes the trigger
- WHEN a suggestion is computed
- THEN the suggestion is a `Partial<RaiConfigInput>` raising the `shared.minInstances` threshold knob
- AND the patch validates against `ConfigSchema.partial()`.

#### Scenario: Each core rule maps to its own config group

- GIVEN `react/render-coupling`, `react/over-abstraction`, or `react/hook-topology` passes the trigger
- WHEN a suggestion is computed
- THEN the suggested knob belongs to that rule's config group (`renderCoupling.*`, `overAbstraction.*`, or `hookTopology.*` respectively)
- AND no knob from an unrelated config group is suggested for that rule.

#### Scenario: Render-coupling correlated to observed max fanIn

- GIVEN `react/render-coupling` passes the trigger with current `renderCoupling.maxFanIn` of 5
- AND rejected findings carry observed `fanIn` of 6, 7, 9, 12
- WHEN suggestions are computed with evidence
- THEN the suggested `renderCoupling.maxFanIn` is 12 (the observed max), NOT 6 (`current + 1`).

#### Scenario: Over-abstraction correlated to observed max propCount

- GIVEN `react/over-abstraction` passes the trigger with current `overAbstraction.maxProps` below the observed values
- AND rejected findings carry observed `propCount` of 9, 11, 14
- WHEN suggestions are computed with evidence
- THEN the suggested `overAbstraction.maxProps` is 14 (the observed max).

#### Scenario: Hook-topology correlated to observed max fanIn

- GIVEN `react/hook-topology` passes the trigger with current `hookTopology.maxFanIn` below the observed values
- AND rejected findings carry observed `fanIn` of 4, 8, 10
- WHEN suggestions are computed with evidence
- THEN the suggested `hookTopology.maxFanIn` is 10 (the observed max).

#### Scenario: Shared-extraction inverted floor is observed max instances plus one

- GIVEN `react/shared-extraction` passes the trigger with current `shared.minInstances` below the observed values
- AND rejected findings carry observed `instances.length` of 3, 4, 6
- WHEN suggestions are computed with evidence
- THEN the suggested `shared.minInstances` is 7 (`max(6) + 1`, inverted floor).

#### Scenario: Correlated value above cap is clamped to maxCap

- GIVEN a calibratable core rule passes the trigger
- AND the observed max breach metric over rejected findings exceeds 50 (e.g. 73)
- WHEN suggestions are computed with evidence
- THEN the suggested value is capped at `maxCap = 50`
- AND the patch validates against `ConfigSchema.partial()`.

#### Scenario: Correlated rationale cites observed max and rejected count

- GIVEN `react/render-coupling` emits an evidence-correlated suggestion of `maxFanIn` 12 derived from 4 rejected findings
- WHEN the suggestion rationale is rendered
- THEN it cites the observed max metric (12) and the count of rejected findings (4)
  (e.g. "observed max fanIn: 12 across 4 rejected findings").

#### Scenario: Same stats, config, and evidence yield identical suggestions

- GIVEN fixed trigger stats, a fixed current config, and a fixed per-rule evidence map
- WHEN evidence-correlated suggestions are computed twice
- THEN both runs produce the same suggestion list in the same order.

#### Scenario: Calibrate run exercising the evidence path performs no writes

- GIVEN a project with T4 negative feedback and resolvable T3 evidence for a calibratable rule
- WHEN `rai calibrate` runs through the evidence-correlated path to completion
- THEN no `rai.config.json` or other config file is created or modified
- AND no row is inserted, updated, or deleted in `feedback_event` (T4), `weight` (T5), or `finding` (T3)
- AND the evidence lookup reads `FindingsStore.currentVersion` as read-only only.

## Out of Scope (explicit)

The following remain NOT part of this change and MUST NOT be implemented here:

- Secondary per-rule metric knobs (e.g. render-coupling `maxFanOut`/`maxDirectChildren`/`maxReachableDepth`, over-abstraction `maxHooks`/`maxChildren`, shared-extraction `minCosine`/`minPropOverlap`) — deferred to S2.x.
- `rai calibrate --apply` config write-back — deferred to S3.
- Any schema or DB table change, and any new migration.
- A new MCP tool.
- ML/probabilistic thresholds.
- Adapter/unknown rules: these are NOT evidence-correlated (they have no config threshold knob); they retain the S1 `memory.severityMap` downgrade behavior unchanged.

## Traceability

| Proposal acceptance signal | Requirement(s) |
|----------------------------|----------------|
| T4→T3 read-only join resolves rejected breach metrics | Rejected-Finding Evidence Lookup |
| Correlated value = max(observed) / max+1 for minInstances, capped at 50 | Core-Rule Threshold Suggestions |
| Rationale cites observed max + rejected count | Core-Rule Threshold Suggestions |
| Fallback to current+1 when evidence absent/insufficient/newValue ≤ current | Evidence-Correlated Suggestion Fallback |
| Partial evidence uses resolved subset; null skipped not zeroed | Evidence-Correlated Suggestion Fallback |
| SUGGEST-ONLY no-write preserved across evidence path | Core-Rule Threshold Suggestions |
| Deterministic: same stats+config+evidence → same output | Core-Rule Threshold Suggestions |
| Adapter rules unchanged (severityMap downgrade) | Out of Scope note |
