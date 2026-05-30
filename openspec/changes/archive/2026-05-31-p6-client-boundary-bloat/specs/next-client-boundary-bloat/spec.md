# next-client-boundary-bloat Specification

## Purpose

Define App Router-only Next analyzer behavior for detecting oversized client component boundaries using deterministic enrichment roles and render topology metrics.

## Requirements

### Requirement: App Router Boundary Analysis

The analyzer MUST run only for App Router projects and MUST evaluate nodes tagged as `ClientComponent` by Next enrichment using render topology metrics.

#### Scenario: Oversized client boundary emits finding

- GIVEN an App Router project with a `ClientComponent` node and render topology above configured fan-out or reachable-depth thresholds
- WHEN the analyzer runs
- THEN it MUST return a `next/client-boundary-bloat` finding
- AND the finding MUST identify the boundary node and exceeded threshold metrics

#### Scenario: Boundary below thresholds is silent

- GIVEN an App Router project with `ClientComponent` nodes whose direct children, fan-out, and reachable depth stay at or below thresholds
- WHEN the analyzer runs
- THEN it MUST return no `next/client-boundary-bloat` finding

### Requirement: Metric-Only Evidence Contract

Finding evidence MUST contain metric-only data: node IDs, spans, counts, configured thresholds, route/topology references, and enrichment role data. Evidence MUST NOT contain prose explanations, remediation text, or narrative descriptions.

#### Scenario: Evidence contains only deterministic metrics

- GIVEN an oversized App Router client boundary
- WHEN the analyzer returns a finding
- THEN evidence MUST include measured counts, thresholds, node IDs, spans, and role tags
- AND evidence MUST NOT include prose fields or recommendation text

### Requirement: Router Variant Guard

The analyzer MUST reject unsupported Next variants with diagnostics instead of findings.

#### Scenario: Pages Router emits variant mismatch

- GIVEN a Pages Router project
- WHEN the analyzer runs
- THEN it MUST return a `variant-mismatch` diagnostic
- AND it MUST return no `next/client-boundary-bloat` finding

#### Scenario: Mixed Router emits variant mismatch

- GIVEN a mixed App Router and Pages Router project
- WHEN the analyzer runs
- THEN it MUST return a `variant-mismatch` diagnostic
- AND it MUST return no `next/client-boundary-bloat` finding

### Requirement: Analyzer Return Boundary

The analyzer MUST return findings and diagnostics through the normal analyzer result flow and MUST NOT write to persistence or memory directly.

#### Scenario: Findings use analyzer return path

- GIVEN an oversized App Router client boundary
- WHEN the analyzer completes
- THEN all findings MUST be present in the analyzer return value
- AND the analyzer MUST NOT perform direct persistence writes
