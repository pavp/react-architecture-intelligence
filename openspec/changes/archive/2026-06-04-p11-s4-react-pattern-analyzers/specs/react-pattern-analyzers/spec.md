# Delta for React Pattern Analyzers

## MODIFIED Requirements

### Requirement: Deferred React Pattern Families Stay Scoped by Slice

P11-S1 behavior MUST remain limited to compound component / compound primitive API divergence. P11-S2 MUST add only the container/presenter role-name divergence analyzer. P11-S3 MUST add only the controlled/uncontrolled prop-surface drift analyzer. P11-S4 MUST add only generic framework-neutral pattern facts and MUST NOT emit new React analyzer findings. P11-S4 MUST NOT emit findings for provider/context, forms, data fetching, design-system usage, overlays beyond compound primitive evidence, or broad API convention families. Those families MAY be specified and implemented by later approved changes that consume the new facts in adapter-owned analyzers.

(Previously: P11-S3 deferred provider/context, forms, data-fetching, design-system usage, overlays beyond compound primitive evidence, and broad API convention families.)

#### Scenario: P11-S4 fact expansion emits no new analyzer findings

- GIVEN source code contains provider/context, forms, data-fetching, design-system usage, overlay, or broad API-convention syntax
- WHEN P11-S4 React pattern analyzers run
- THEN no new React pattern findings MUST be emitted for those families
- AND any findings that exist MUST come from already-approved analyzer rule ids.

#### Scenario: Future analyzers remain adapter-owned

- GIVEN P11-S4 adds generic fact kinds that future React analyzers can consume
- WHEN `@rai/core` and `@rai/adapter-react` boundaries are inspected
- THEN React interpretation MUST remain outside core
- AND future provider/context, forms, data-fetching, design-system, overlay, or API-convention findings MUST require a later approved adapter-owned change.
