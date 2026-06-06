# Spec: calibration

Capability promoted from delta `openspec/changes/p13-s1-rai-calibrate/spec.md` at archive (2026-06-07).
Change: `p13-s1-rai-calibrate` · Persistence: hybrid

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
suggest raising the least-disruptive relevant threshold knob for that rule. The knob MUST be one
that exists in `ConfigSchema` for that rule's config group (e.g. `shared.minInstances` for
`react/shared-extraction`, `renderCoupling.maxFanIn` for `react/render-coupling`). The resulting
patch MUST validate against `ConfigSchema.partial()`.

#### Scenario: Shared-extraction suggestion raises a valid knob

- GIVEN `react/shared-extraction` passes the trigger
- WHEN a suggestion is computed
- THEN the suggestion is a `Partial<RaiConfigInput>` raising a `shared.*` threshold knob
  (the least-disruptive relevant knob, e.g. `shared.minInstances`)
- AND the patch validates against `ConfigSchema.partial()`.

#### Scenario: Each core rule maps to its own config group

- GIVEN `react/render-coupling`, `react/over-abstraction`, or `react/hook-topology` passes the trigger
- WHEN a suggestion is computed
- THEN the suggested knob belongs to that rule's config group
  (`renderCoupling.*`, `overAbstraction.*`, or `hookTopology.*` respectively)
- AND no knob from an unrelated config group is suggested for that rule.

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

---

## Out of Scope (explicit)

The following are NOT part of P13-S1 and MUST NOT be implemented in this change:

- `rai calibrate --apply` config write (deferred to S3).
- Evidence-correlated suggestions, e.g. `maxFanIn: observed+1` (deferred to S2).
- T5 suppression-state display in calibrate output (deferred to S2).
- A `--min-events` flag override (`MIN_EVENTS = 3` is a named constant in S1).

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
