# Spec: calibration

Capability promoted from delta `openspec/changes/p13-s1-rai-calibrate/spec.md` at archive (2026-06-07).
S2 delta merged from `openspec/changes/p13-s2-evidence-correlated-suggestions/spec.md` at archive (2026-06-07).
Changes: `p13-s1-rai-calibrate`, `p13-s2-evidence-correlated-suggestions` · Persistence: hybrid

---

## ADDED Requirements

### Requirement: Suggest-Only Calibration Command (Primary Guardrail)

The system MUST provide `rai calibrate [dir] [--json]`. The command MUST be strictly
suggest-only: it MUST NOT create, modify, or delete any configuration file (including
`rai.config.json`), MUST NOT write to `feedback_event` (T4), MUST NOT write to `weight` (T5),
and MUST NOT perform any other database write or memory mutation. The command reads T4 feedback
and the resolved config, computes suggestions, and prints them for human review. Project guardrail:
"threshold SUGGESTIONS from feedback, NO automatic config changes."

#### Scenario: Calibrate never writes config

- GIVEN a project directory with feedback events recorded in T4
- AND no `rai.config.json` file present at the project root
- WHEN `rai calibrate` runs and emits one or more suggestions
- THEN no `rai.config.json` file is created or modified at the project root
- AND no other configuration file on disk is created or modified.

#### Scenario: Calibrate never mutates memory or findings

- GIVEN a project directory with existing T4 feedback events and T5 weights
- WHEN `rai calibrate` runs to completion
- THEN no row is inserted, updated, or deleted in `feedback_event` (T4)
- AND no row is inserted, updated, or deleted in `weight` (T5)
- AND no finding (T3) row is mutated
- AND the calibration data source is read-only.

#### Scenario: Existing config left untouched when present

- GIVEN a project directory with an existing valid `rai.config.json`
- WHEN `rai calibrate` runs and proposes raising a threshold
- THEN the on-disk `rai.config.json` content is byte-identical before and after the run
- AND the suggested patch is only printed, never applied.

### Requirement: Per-Rule Feedback Aggregation

The system MUST aggregate `feedback_event` (T4) rows grouped per `rule_id`. For each rule it MUST
report counts per verdict and a `negativeRate` computed as
`(reject + wontfix + dismiss) / totalEvents`, where `totalEvents` is the count of all feedback
events for that rule. Verdicts `accept` and `confirm` are positive; `reject`, `wontfix`, and
`dismiss` are negative. Aggregation MUST be read-only over T4.

#### Scenario: Aggregation computes per-rule verdict counts and negative rate

- GIVEN T4 contains feedback events for `react/shared-extraction` with verdicts
  reject, reject, dismiss, accept (4 events)
- WHEN feedback is aggregated
- THEN the rule's `totalEvents` is 4
- AND its `negativeRate` is `3 / 4 = 0.75` (count of reject + wontfix + dismiss = 3, over totalEvents = 4)
- AND the per-verdict counts are reported for the rule (reject: 2, dismiss: 1, accept: 1).

#### Scenario: Rules without feedback are absent from aggregation

- GIVEN T4 contains feedback only for `react/render-coupling`
- WHEN feedback is aggregated
- THEN only `react/render-coupling` appears in the aggregated stats
- AND rules with zero feedback events do not appear.

### Requirement: Deterministic Suggestion Engine

The suggestion engine MUST be a deterministic pure function over aggregated stats and the resolved
config. The same T4 feedback state and the same config MUST produce an identical aggregation and an
identical, stably-ordered list of suggestions across runs. Suggestion output MUST be a
`Partial<RaiConfigInput>` JSON patch that validates against `ConfigSchema.partial()`.

#### Scenario: Same feedback state yields identical suggestions

- GIVEN a fixed T4 feedback state and a fixed resolved config
- WHEN suggestions are computed twice
- THEN both runs produce the same aggregation
- AND both runs produce the same suggestion list in the same order.

#### Scenario: Suggestion patch validates against the config schema

- GIVEN a suggestion is emitted for any rule
- WHEN its `Partial<RaiConfigInput>` patch is validated with `ConfigSchema.partial()`
- THEN validation succeeds
- AND the patch contains only keys that exist in the config schema.

### Requirement: Suggestion Trigger Threshold

The engine MUST emit a suggestion for a rule only when `negativeRate >= 0.5` AND
`totalEvents >= MIN_EVENTS`, where `MIN_EVENTS` is a named constant equal to `3`. The
`totalEvents >= MIN_EVENTS` floor prevents calibration from becoming noise on thin evidence.
A rule that fails either condition MUST NOT produce a suggestion.

#### Scenario: Rule past both thresholds emits a suggestion

- GIVEN a rule with `negativeRate >= 0.5` and `totalEvents >= 3`
- WHEN suggestions are computed
- THEN a suggestion is emitted for that rule.

#### Scenario: Event floor not met yields no suggestion

- GIVEN a rule with `negativeRate >= 0.5` but `totalEvents < 3` (e.g. 2 rejects over 2 events)
- WHEN suggestions are computed
- THEN no suggestion is emitted for that rule.

#### Scenario: Negative rate not met yields no suggestion

- GIVEN a rule with `totalEvents >= 3` but `negativeRate < 0.5` (e.g. 1 reject over 4 events)
- WHEN suggestions are computed
- THEN no suggestion is emitted for that rule.

### Requirement: Core-Rule Threshold Suggestions

For the core calibratable rules `react/shared-extraction`, `react/render-coupling`,
`react/over-abstraction`, and `react/hook-topology`, when a rule passes the trigger the engine MUST
suggest raising the relevant threshold knob for that rule, and that knob MUST exist in `ConfigSchema`
for the rule's config group (e.g. `shared.minInstances` for `react/shared-extraction`,
`renderCoupling.maxFanIn` for `react/render-coupling`). When recoverable rejected-finding evidence is
available and improves on the current value, the suggested value MUST be evidence-correlated rather
than a blind `current + 1`: the ceiling-direction rules MUST suggest `max(metric over rejected)` and
the inverted floor rule `react/shared-extraction` MUST suggest
`max(evidence.instances.length over rejected) + 1`. Every suggested value MUST be capped at
`maxCap = 50`. The correlated suggestion's rationale MUST cite the observed max metric and the count
of rejected findings it was derived from. The engine MUST remain a deterministic pure function: the
same trigger stats, current config, and per-rule evidence MUST produce identical suggestions across
runs. The resulting patch MUST validate against `ConfigSchema.partial()`.
(Previously S1: suggested only `current + 1` with no evidence correlation, cap, or observed-count rationale.)

Note: evidence reflects the current (latest) `analysis_version` via `FindingsStore.currentVersion`,
not the values at rejection time. By design the correlated value tracks the current breach level of
the rejected components.

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

### Requirement: Adapter-Rule Severity Downgrade Suggestions

For adapter rules (the P11 family, e.g. `react/form-control-surface-drift`) that are not
threshold-calibratable via config knobs, when a rule passes the trigger the engine MUST suggest a
`memory.severityMap` downgrade for that rule rather than a non-existent threshold knob. The output
MUST communicate that adapter rules are not config-threshold-calibratable and direct the user to the
`memory.severityMap` mechanism. The downgrade patch MUST validate against `ConfigSchema.partial()`,
including the schema's clamp-down-only rule.

#### Scenario: Adapter rule suggests severityMap downgrade

- GIVEN an adapter rule such as `react/form-control-surface-drift` passes the trigger
- WHEN a suggestion is computed
- THEN the suggestion is a `memory.severityMap` downgrade for that rule
- AND no threshold knob (which does not exist for the rule) is suggested
- AND the patch validates against `ConfigSchema.partial()` and respects the clamp-down-only rule.

#### Scenario: Output names adapter rules as not threshold-calibratable

- GIVEN an adapter rule produces a suggestion
- WHEN the calibrate output is rendered
- THEN it states the adapter rule is not config-threshold-calibratable
- AND it points the user to the `memory.severityMap` downgrade mechanism.

### Requirement: Graceful Empty-Feedback Behavior

When T4 contains no feedback events, `rai calibrate` MUST emit no suggestions and MUST print a clear
message guiding the user to record feedback first. The command MUST exit successfully (exit code 0),
not as an error.

#### Scenario: No feedback recorded

- GIVEN T4 contains zero feedback events
- WHEN `rai calibrate` runs
- THEN it emits no suggestions
- AND it prints a message guiding the user to record feedback first
- AND it exits with code 0.

### Requirement: Calibrate Output Shape

`rai calibrate` MUST produce a human-readable default output containing a per-rule stats table and a
suggestion block, and a `--json` output with the deterministic shape
`{ rules, suggestions, currentConfig }`. Both forms MUST be deterministic for a fixed T4 state and
config. The `--json` output MUST be machine-parseable JSON.

#### Scenario: Human output shows stats table and suggestions

- GIVEN T4 contains feedback that triggers at least one suggestion
- WHEN `rai calibrate` runs without `--json`
- THEN output includes a per-rule stats table
- AND output includes a suggestion block with copy-paste-ready patches.

#### Scenario: JSON output has the documented shape

- GIVEN T4 contains feedback
- WHEN `rai calibrate --json` runs
- THEN stdout is valid JSON with keys `rules`, `suggestions`, and `currentConfig`
- AND the JSON is identical across runs for the same T4 state and config.

### Requirement: Rejected-Finding Evidence Lookup

For each calibratable core rule, the system MUST resolve the breach-metric values recorded in the
rejected findings for that rule by joining T4 negative feedback to T3 evidence. The lookup MUST
select distinct fingerprints from `feedback_event` (T4) where verdict is `reject`, `wontfix`, or
`dismiss` for the rule, resolve each `(fingerprint, rule_id)` to its current finding via
`FindingsStore.currentVersion`, extract the rule's primary metric, and return a numeric array. The
lookup MUST be strictly read-only over T4 and T3 (no insert, update, or delete) and MUST require no
schema change. The extracted primary metric per rule MUST be: `react/render-coupling` →
`evidence.fanIn`; `react/over-abstraction` → `evidence.propCount`; `react/hook-topology` →
`evidence.fanIn`; `react/shared-extraction` → `evidence.instances.length`.

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

When a calibratable core rule passes the trigger but has zero rejected fingerprints resolvable to T3
evidence, OR the correlated `newValue` is less than or equal to the current configured value
(including exactly equal), the engine MUST fall back to the S1 generic `current + 1` suggestion. The
fallback MUST NOT emit a no-op patch and MUST NOT suggest a value lower than the current threshold.
When only some rejected fingerprints resolve (partial evidence), the correlated value MUST be derived
from the resolved subset only.

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

---

## Out of Scope (explicit)

The following are NOT part of P13 S1–S2 and MUST NOT be implemented in these changes:

- `rai calibrate --apply` config write (deferred to S3).
- Secondary per-rule metric knobs (e.g. render-coupling `maxFanOut`/`maxDirectChildren`/`maxReachableDepth`, over-abstraction `maxHooks`/`maxChildren`, shared-extraction `minCosine`/`minPropOverlap`) — deferred to S2.x.
- T5 suppression-state display in calibrate output (deferred to a future slice).
- A `--min-events` flag override (`MIN_EVENTS = 3` is a named constant).
- Any schema or DB table change, and any new migration.
- A new MCP tool.
- ML/probabilistic thresholds.
- Adapter/unknown rules: NOT evidence-correlated (no config threshold knob); retain S1 `memory.severityMap` downgrade behavior unchanged.

## Traceability

| Proposal acceptance signal | Requirement(s) |
|----------------------------|----------------|
| Calibrate produces no config file; no file created/modified | Suggest-Only Calibration Command |
| `computeSuggestions` deterministic: same T4 → same list | Deterministic Suggestion Engine |
| Trigger exactly `negativeRate >= 0.5 && totalEvents >= 3` | Suggestion Trigger Threshold |
| Core rule → raise relevant valid knob | Core-Rule Threshold Suggestions |
| Adapter rule → `memory.severityMap` downgrade | Adapter-Rule Severity Downgrade Suggestions |
| Empty T4 → clean "no feedback recorded" message | Graceful Empty-Feedback Behavior |
| Human table + `--json { rules, suggestions, currentConfig }` | Calibrate Output Shape |
| T4→T3 read-only join resolves rejected breach metrics | Rejected-Finding Evidence Lookup |
| Correlated value = max(observed) / max+1 for minInstances, capped at 50 | Core-Rule Threshold Suggestions (S2) |
| Rationale cites observed max + rejected count | Core-Rule Threshold Suggestions (S2) |
| Fallback to current+1 when evidence absent/insufficient/newValue ≤ current | Evidence-Correlated Suggestion Fallback |
| Partial evidence uses resolved subset; null skipped not zeroed | Evidence-Correlated Suggestion Fallback |
| SUGGEST-ONLY no-write preserved across evidence path | Core-Rule Threshold Suggestions (S2) |
| Deterministic: same stats+config+evidence → same output | Core-Rule Threshold Suggestions (S2) |
| Adapter rules unchanged (severityMap downgrade) | Out of Scope note |
