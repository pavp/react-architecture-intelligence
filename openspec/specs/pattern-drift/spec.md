# Pattern Drift Specification

## Purpose

Define pattern-drift terminology for P11 so current-source pattern divergence remains distinct from historical snapshot drift.

## Requirements

### Requirement: Distinct Drift Terminology

The system MUST distinguish repo-local pattern divergence from historical drift. Repo-local pattern divergence means a current-source finding derived from disagreement between observed pattern facts in the same repository state. Historical drift means comparison of persisted snapshots over time through existing drift behavior. Current-source divergence MUST NOT be presented as historical drift.

#### Scenario: Current-source divergence is not historical drift

- GIVEN a React compound API finding is derived from the current repository graph
- WHEN the finding is displayed, explained, or serialized
- THEN it MUST describe repo-local pattern divergence or equivalent current-source disagreement
- AND it MUST NOT claim that behavior changed over time unless snapshot comparison evidence is present.

#### Scenario: Historical drift remains snapshot-based

- GIVEN two persisted analysis snapshots contain different stable pattern findings
- WHEN historical drift is requested
- THEN drift results MUST be based on existing snapshot comparison semantics
- AND MUST NOT be inferred from a single current-source analysis result.

### Requirement: Grounded Repo-Local Pattern Divergence

Repo-local pattern divergence findings MUST be deterministic findings grounded in existing graph facts, pattern facts, and stable analyzer output. They MUST NOT be derived from LLM inference, best-practice assumptions, automatic memory state, or automatic configuration changes.

#### Scenario: Divergence comes from observed facts

- GIVEN pattern facts record observed declarations and observed usages for a pattern family
- WHEN a repo-local pattern divergence finding is emitted
- THEN the finding MUST identify the observed fact categories that disagree
- AND the finding MUST be reproducible from the same graph facts without external inference.

#### Scenario: Divergence does not change config or memory

- GIVEN a repo-local pattern divergence finding is emitted
- WHEN analysis completes
- THEN project configuration MUST remain unchanged
- AND memory or feedback state MUST NOT be written automatically from the inferred pattern.

### Requirement: Historical Drift Uses Existing Snapshot Flow

Stable pattern divergence findings MUST participate in historical drift through the existing snapshot persistence and `get_drift` comparison flow once such findings are persisted. P11-S1 MUST NOT add a new MCP drift tool or a separate pattern-drift persistence path.

#### Scenario: Stable pattern findings can drift over time

- GIVEN one snapshot contains a stable `react/compound-component-api-drift` finding and another comparable snapshot does not
- WHEN existing historical drift comparison runs
- THEN the finding MUST appear as added or removed according to existing snapshot drift semantics
- AND no React-specific drift storage path MUST be required.

#### Scenario: No new drift tool is required

- GIVEN P11-S1 pattern divergence findings are available through normal analysis
- WHEN MCP tools are reviewed for historical drift behavior
- THEN existing drift access MUST remain the historical drift interface
- AND P11-S1 MUST NOT require a new MCP pattern drift query tool.
