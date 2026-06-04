# P9-S3a Design: Current Analyzer Human Explanation Coverage

Upgrade the shared explanation path so current findings read as observed code facts instead of internal evidence dumps. The change is presentation-only: analyzers keep emitting the same raw findings, evidence, fingerprints, diagnostics, snapshots, and MCP/CLI JSON shapes.

## Decision summary

| Area | Decision |
|------|----------|
| Slice | Cover current analyzer explanations only: core evidence kinds plus compound, container/presenter, and Next adapter findings. |
| Core wording | Core owns framework-neutral wording for existing core evidence shapes only. It does not add React- or Next-specific meaning for adapter metrics. |
| Adapter wording | React and Next adapters own rule-specific explanation hooks for their adapter findings. |
| Contracts | No raw contract changes. Only deterministic strings inside the existing `ExplanationEnvelope` change. |
| Composition | `Session.explainFinding` already prefers `Analyzer.explain`; Next `core-adapter.ts` must attach adapter-owned hooks when wrapping Next analyzers. |
| Tests | Write failing tests first for known wording, adapter hook use, hook propagation, raw contract stability, and unknown fallback. |

## Current data flow

1. Analyzer emits an immutable raw `Finding` with `evidence`.
2. The engine overlays memory/config into a `PresentedFinding` without changing raw evidence.
3. `Session.analyzeRepo` stores the current `AnalyzerRegistry` in `lastRegistry`.
4. `Session.explainFinding({ fingerprint })`:
   - finds the current `PresentedFinding`;
   - asks `lastRegistry.get(ruleId)?.explain?.(finding)`;
   - falls back to `packages/core/src/explainability/explain.ts` when no hook returns an envelope;
   - returns raw `finding`, raw `evidence`, raw `groundingFields`, additive `explanation`, and read-only `memory`.
5. CLI `rai explain` and MCP `explain_finding` both consume this same explanation envelope.

This design keeps that flow and improves only the hook/fallback text.

## Exact core wording strategy

Core fallback covers only evidence categories already modeled in `packages/core/src/types.ts`. It must not hardcode adapter rule semantics for `react/compound-component-api-drift`, `next/client-boundary-bloat`, or `next/route-coupling`.

### Shared helpers

Use deterministic formatting helpers in `explain.ts`:

| Helper | Rule |
|--------|------|
| `plural(count, singular, pluralForm?)` | Keep existing behavior. |
| `formatList(values, limit = 4)` | Preserve evidence order, omit empty values, join one/two/many with commas and `and`; append `, and N more` after limit. |
| `formatRatio(value)` | Render finite numbers to two decimals, otherwise `unknown`. |
| `componentRef(name, file)` | Render `${name} in ${file}`. |
| `rawKeys(groundingFields)` | Render `raw evidence keys: ${groundingFields.join(", ")}`. |

### Known core evidence envelopes

#### `shared-extraction`

Summary template:

```text
${count} components share similar source shape: ${formatList(instanceNames)}.
```

Fallback summary when no instances are present:

```text
Shared-extraction evidence has no component instances to list.
```

Why text:

```text
This is worth checking because the listed components already share measured structure, props, or hook usage in source.
```

Inspect-first lines, in this order:

1. One line per instance: `${instance.name} in ${instance.span.file}`.
2. `similarity score: ${formatRatio(evidence.cosine)}`.
3. `prop overlap: ${formatRatio(evidence.propOverlap)}`.
4. `hook overlap: ${formatRatio(evidence.hookOverlap)}`.
5. `shared props observed: ${formatList(evidence.sharedSurface) || "none recorded"}`.
6. `varying props observed: ${formatList(evidence.variancePoints) || "none recorded"}`.
7. If `evidence.conflict` exists: `configured boundary conflict: ${evidence.conflict.why}`.

Limits:

```text
Do not assume shared ownership, intent, root cause, user impact, or safe remediation from this finding alone.
```

If `conflict` exists, add:

```text
The boundary conflict comes from repo config; inspect the configured convention before acting.
```

#### `render-coupling`

Summary template:

```text
${component.name} sits at a busy render point: ${fanIn} inbound, ${fanOut} downstream, ${directChildren} direct ${childWord}, depth ${reachableDepth}.
```

Why text:

```text
This is worth checking because the render graph shows many relationships around one component.
```

Inspect-first lines, in this order:

1. `${component.name} in ${component.span.file}`.
2. `${fanIn} inbound render ${plural(fanIn, "link")}`.
3. `${fanOut} downstream render ${plural(fanOut, "link")}`.
4. `${directChildren} direct ${plural(directChildren, "child", "children")}`.
5. `render tree depth: ${reachableDepth}`.

Limits:

```text
Do not assume shared ownership, intent, root cause, user impact, architectural correctness, or safe remediation from this finding alone.
```

#### `over-abstraction`

Summary template:

```text
${component.name} has a large measured component surface: ${propCount} props, ${hookCount} hooks, ${childCount} rendered ${childWord}, ${compositionMarkerCount} composition ${markerWord}, and ${conditionalBranchCount} conditional ${branchWord}.
```

Why text:

```text
This is worth checking because many props, hooks, children, composition markers, or branches meet in one source component.
```

Inspect-first lines, in this order:

1. `${component.name} in ${component.span.file}`.
2. `${propCount} ${plural(propCount, "prop")}`.
3. `${hookCount} ${plural(hookCount, "hook")}`.
4. `${childCount} rendered ${plural(childCount, "child", "children")}`.
5. `${compositionMarkerCount} composition ${plural(compositionMarkerCount, "marker")}`.
6. `${conditionalBranchCount} conditional ${plural(conditionalBranchCount, "branch", "branches")}`.

Limits:

```text
Do not assume shared ownership, intent, root cause, user impact, architectural correctness, or safe remediation from this finding alone.
```

#### `hook-topology`

Summary template:

```text
${hook.name} sits at a busy hook dependency point: ${fanIn} inbound, ${fanOut} downstream, ${directDependencies} direct ${dependencyWord}, depth ${reachableDepth}.
```

Why text:

```text
This is worth checking because the dependency graph shows many relationships around one hook.
```

Inspect-first lines, in this order:

1. `${hook.name} in ${hook.span.file}`.
2. `${fanIn} inbound dependency ${plural(fanIn, "link")}`.
3. `${fanOut} downstream dependency ${plural(fanOut, "link")}`.
4. `${directDependencies} direct ${plural(directDependencies, "dependency", "dependencies")}`.
5. `dependency tree depth: ${reachableDepth}`.

Limits:

```text
Do not assume shared ownership, intent, root cause, user impact, architectural correctness, or safe remediation from this finding alone.
```

#### `boundary-violation`

Summary template:

```text
Configured convention ${convention.id} forbids this ${edgeLabel}: ${from.name} -> ${to.name}.
```

Where `edgeLabel` remains existing wording: `render link` for `renders`, `hook-use link` for `uses-hook`.

Why text:

```text
This is worth checking because the repo config says this relationship should not appear: ${convention.reason}.
```

Inspect-first lines, in this order:

1. `${from.name} in ${from.file}`.
2. `${to.name} in ${to.file}`.
3. `forbidden ${edgeLabel} under convention ${convention.id}`.
4. `config reason: ${convention.reason}`.

Limits:

```text
This reflects configured convention evidence only; RAI does not infer ownership, intent, root cause, user impact, or safe remediation.
```

### Unknown and adapter fallback wording

Unknown evidence must stay explicit and bounded. Replace the generic fallback summary with:

```text
Unrecognized evidence kind "${evidence.kind}" for ${finding.ruleId}; showing raw evidence keys only.
```

Fallback why text:

```text
RAI can show the source-measured keys, but no semantic explanation is registered for this evidence shape.
```

Fallback inspect-first lines:

```text
raw evidence keys: ${groundingFields.join(", ")}
```

For `adapter-metric` without an adapter hook, core may expose raw adapter facts only when labeled as raw:

1. `${subject.name} in ${subject.file}`.
2. `raw adapter id: ${adapterId}`.
3. `raw rule id: ${ruleId}`.
4. `raw roles: ${role.variant} (${role.role}) in ${role.file}` entries.
5. `raw metric keys: ${Object.keys(metrics).sort().join(", ")}`.
6. `raw threshold keys: ${Object.keys(thresholds).sort().join(", ")}`.
7. `raw topology exceeded keys: ${topology.exceeded.join(", ") || "none"}`.

Fallback limits always include:

```text
Unknown evidence keys are raw facts, not inferred meaning.
```

and:

```text
RAI does not infer team intent, ownership, root cause, user impact, architectural correctness, historical change, or required remediation from unrecognized evidence.
```

## Adapter-owned explanation strategy

Adapter wording lives beside the adapter analyzer code. Each adapter hook must:

- return `null` unless `finding.ruleId` and `finding.evidence.kind` match the analyzer;
- derive every word from `finding.evidence`, `finding.ruleId`, and local constants;
- use `Object.keys(evidence).sort()` for `groundingFields`;
- use `groundingFields.map(explainTerm)` for glossary;
- avoid mutation and I/O;
- avoid claims about team intent, ownership, root cause, user impact, historical change, wrong architecture, or required remediation.

### React: `react/compound-component-api-drift`

File: `packages/adapter-react/src/compound-component-api-drift.ts`.

Add `explain: explainCompoundComponentApiDrift` to the returned core `Analyzer`.

Evidence derivation:

| Value | Source |
|-------|--------|
| Root name | `evidence.subject.name`. |
| Missing parts | Unique sorted `roles` where `role === "missing-declaration"`, using `variant`. |
| Declared parts | Unique sorted `roles` where `role === "declared-part"`, using `variant`. |
| Used parts | Unique sorted `roles` where `role === "used-part"`, using `variant`. |
| Missing files | For each missing part, files from matching `missing-declaration` roles. |
| Counts | `evidence.metrics.declaredParts`, `usedParts`, `missingDeclarations`, `unusedDeclarations`. |
| Limit | `evidence.thresholds.maxMissingDeclarations`. |

Summary template for one missing part:

```text
${root}.${part} is used in JSX, but no matching ${root}.${part} static member declaration was observed.
```

Summary template for multiple missing parts:

```text
${root} has JSX uses for ${formatCompoundParts(root, missingParts)}, but matching static member declarations were not observed for those parts.
```

Why text:

```text
This is worth checking because observed compound part declarations and JSX member usage describe different part sets.
```

Inspect-first lines:

1. `${root} usage in ${evidence.subject.file}`.
2. One line per missing part: `missing declaration observed: ${root}.${part} used in ${formatList(filesForPart)}`.
3. `declared parts observed: ${formatList(declaredParts) || "none recorded"}`.
4. `used parts observed: ${formatList(usedParts) || "none recorded"}`.
5. `missing declarations observed: ${missingDeclarations} (limit: ${maxMissingDeclarations})`.
6. `observed counts: ${declaredPartsCount} declared, ${usedPartsCount} used, ${missingDeclarations} missing, ${unusedDeclarations} unused`.

Limits:

```text
This does not prove intended public API, type resolution, runtime export behavior, or required remediation.
```

```text
RAI only compares observed static member assignments and JSX member usage in current source.
```

```text
RAI does not infer team intent, ownership, root cause, historical change, or user impact from this finding alone.
```

### React: `react/container-presenter-role-drift`

This analyzer already has a hook. Keep it, but add regression coverage so the hook remains plain-language and bounded. Do not change its raw evidence or semantics in this slice unless a test reveals generic/internal wording.

### Next: `next/client-boundary-bloat`

Files:

- `packages/adapter-next/src/client-boundary-bloat.ts`
- `packages/adapter-next/src/core-adapter.ts`

Add a pure adapter-owned explanation function in the rule module, for example `explainClientBoundaryBloatFinding`. Attach it as the core `Analyzer.explain` hook from `createNextCoreAnalyzers`.

Do not move this wording into `@rai/core`.

Evidence derivation:

| Value | Source |
|-------|--------|
| Boundary name/file | `evidence.subject.name`, `evidence.subject.file`. |
| Router/client role | `roles` where `role === "ClientComponent"`. |
| Counts | `metrics.fanOut`, `directChildren`, `reachableNodes`, `reachableDepth`. |
| Limits | `thresholds.maxFanOut`, `maxDirectChildren`, `maxReachableNodes`, `maxReachableDepth`. |
| Crossed limits | `topology.exceeded`, mapped to human count/limit labels. |
| Topology | `topology.directChildIds`, `topology.reachableNodeIds`. |

Metric label map:

| Metric | Human label | Threshold key |
|--------|-------------|---------------|
| `fanOut` | outgoing render links | `maxFanOut` |
| `directChildren` | direct render children | `maxDirectChildren` |
| `reachableNodes` | reachable components | `maxReachableNodes` |
| `reachableDepth` | render depth | `maxReachableDepth` |

Summary template:

```text
${subject.name} is a client boundary with render topology above configured limits: ${formatExceededLimits(exceeded)}.
```

Where each exceeded limit renders as:

```text
${observed} ${humanLabel} (limit: ${limit})
```

Why text:

```text
This is worth checking because the client-marked component owns a larger observed render neighborhood than the configured limit.
```

Inspect-first lines:

1. `${subject.name} in ${subject.file}`.
2. One line per client role: `client boundary role: ${variant} in ${file}`.
3. `direct render children observed: ${directChildIds.length} (${formatList(directChildIds) || "none"})`.
4. `reachable components observed: ${reachableNodeIds.length} (${formatList(reachableNodeIds) || "none"})`.
5. `limits crossed: ${formatExceededLimits(exceeded)}`.
6. `observed counts: ${fanOut} outgoing render links, ${directChildren} direct children, ${reachableNodes} reachable components, depth ${reachableDepth}`.

Limits:

```text
This does not prove bundle size, runtime performance, bad architecture, or that refactoring is required.
```

```text
RAI does not infer team intent, route ownership, root cause, historical change, or user impact from this finding alone.
```

```text
This explanation is based only on observed Next role tags, render edges, metrics, thresholds, and topology evidence.
```

### Next: `next/route-coupling`

Files:

- `packages/adapter-next/src/route-coupling.ts`
- `packages/adapter-next/src/core-adapter.ts`

Add a pure adapter-owned explanation function in the rule module, for example `explainRouteCouplingFinding`. Attach it as the core `Analyzer.explain` hook from `createNextCoreAnalyzers`.

Evidence derivation:

| Value | Source |
|-------|--------|
| Route name/file | `evidence.subject.name`, `evidence.subject.file`. |
| Route role | `roles` where `role === "RouteSegment"`. |
| Counts | `metrics.fanIn`, `fanOut`, `directChildren`, `reachableNodes`, `reachableDepth`. |
| Limits | `thresholds.maxFanIn`, `maxFanOut`, `maxDirectChildren`, `maxReachableNodes`, `maxReachableDepth`. |
| Crossed limits | `topology.exceeded`, mapped to human count/limit labels. |
| Topology | `topology.directChildIds`, `topology.reachableNodeIds`. |

Metric label map:

| Metric | Human label | Threshold key |
|--------|-------------|---------------|
| `fanIn` | incoming render links | `maxFanIn` |
| `fanOut` | outgoing render links | `maxFanOut` |
| `directChildren` | direct render children | `maxDirectChildren` |
| `reachableNodes` | reachable components | `maxReachableNodes` |
| `reachableDepth` | render depth | `maxReachableDepth` |

Summary template:

```text
${subject.name} is a route segment with render topology above configured limits: ${formatExceededLimits(exceeded)}.
```

Why text:

```text
This is worth checking because the route component owns a larger observed render neighborhood than the configured route-coupling limit.
```

Inspect-first lines:

1. `${subject.name} in ${subject.file}`.
2. One line per route role: `route role: ${variant} in ${file}`.
3. `incoming render links observed: ${fanIn}`.
4. `direct render children observed: ${directChildIds.length} (${formatList(directChildIds) || "none"})`.
5. `reachable components observed: ${reachableNodeIds.length} (${formatList(reachableNodeIds) || "none"})`.
6. `limits crossed: ${formatExceededLimits(exceeded)}`.
7. `observed counts: ${fanIn} incoming, ${fanOut} outgoing, ${directChildren} direct children, ${reachableNodes} reachable components, depth ${reachableDepth}`.

Limits:

```text
This does not prove bundle size, runtime performance, bad architecture, or that refactoring is required.
```

```text
RAI does not infer team intent, route ownership, root cause, historical change, or user impact from this finding alone.
```

```text
This explanation does not claim import coupling, module coupling, data-fetching behavior, or prop-flow coupling; it is based on observed route role tags and render topology evidence.
```

## Next core adapter hook propagation

`packages/adapter-next/src/core-adapter.ts` currently wraps Next-specific analyzers into core `Analyzer` objects but drops any explanation hook. Change the wrapper seam, not the raw analyzer output.

Planned shape:

```ts
function adaptNextAnalyzer(input: {
  ruleId: string;
  input: NextCoreAnalyzerInput;
  analyze: (ctx: AnalysisContext) => NextAdapterAnalyzerResult;
  explain?: Analyzer["explain"];
}): Analyzer {
  return {
    ruleId: input.ruleId,
    framework: "next",
    analyze: input.analyze,
    ...(input.explain ? { explain: input.explain } : {}),
  };
}
```

`createNextCoreAnalyzers` should instantiate or reference each rule's adapter-owned explanation function and pass it into `adaptNextAnalyzer`:

- route wrapper gets `explainRouteCouplingFinding`;
- client-boundary wrapper gets `explainClientBoundaryBloatFinding`.

This preserves direct raw analyzer result contracts and ensures CLI/MCP composition sees `Analyzer.explain` through the registry.

## File changes

| File | Planned change |
|------|----------------|
| `packages/core/src/explainability/explain.ts` | Replace generic known summaries with evidence-first templates; make unknown fallback explicit raw-key wording; keep adapter fallback generic and raw. |
| `packages/core/src/explainability/explain.test.ts` | Update/add tests for exact core summaries, inspect-first lines, limits, unknown fallback, and no generic lead wording. |
| `packages/core/src/mcp/tools.test.ts` | Update shared-extraction expected summary; add/keep assertions that raw finding/evidence/fingerprint/memory remain unchanged and analyzer hooks win. |
| `packages/adapter-react/src/compound-component-api-drift.ts` | Add analyzer-owned `explain` hook with compound-part wording. |
| `packages/adapter-react/src/compound-component-api-drift.test.ts` | Add failing hook test for human summary, inspect lines, limits, no generic/internal wording, and raw evidence preservation. |
| `packages/adapter-react/src/container-presenter-role-drift.test.ts` | Add/keep regression that wording remains bounded and hook-owned. |
| `packages/adapter-next/src/client-boundary-bloat.ts` | Add pure explanation function owned by Next rule module. |
| `packages/adapter-next/src/client-boundary-bloat.test.ts` | Add failing explanation test for client boundary count/limit wording and bounded limits. |
| `packages/adapter-next/src/route-coupling.ts` | Add pure explanation function owned by Next rule module. |
| `packages/adapter-next/src/route-coupling.test.ts` | Add failing explanation test for route count/limit wording and bounded limits. |
| `packages/adapter-next/src/core-adapter.ts` | Attach Next explanation functions to adapted core `Analyzer` objects. |
| `packages/adapter-next/src/core-adapter.test.ts` | Prove a Next finding explained through `Session.explainFinding` uses the adapter hook after composition. |
| `packages/cli/src/cli.test.ts` | Add focused `rai explain` assertion for at least one adapter-owned human summary through the real CLI path. |

No `packages/core/src/types.ts`, MCP schema, DB schema, snapshot schema, feedback schema, or raw evidence shape changes are planned.

## Contract preservation

| Contract | Status |
|----------|--------|
| `Finding`, `PresentedFinding`, `Evidence`, `AdapterMetricEvidence` | Unchanged. |
| `ExplanationEnvelope` shape | Unchanged; only strings become clearer. |
| `Analyzer.explain` | Existing optional seam; no core interface change needed. |
| MCP `explain_finding` raw fields | Unchanged: `finding`, `evidence`, `groundingFields`, `memory` remain. |
| CLI `rai explain --json` schema | Unchanged: same envelope with improved `explanation` strings. |
| CLI `rai analyze --json` | Unchanged. |
| Snapshots, persistence, feedback, codemod proofs | Unchanged; explanation paths remain read-only. |
| Adapter diagnostics | Unchanged; diagnostics UX is deferred. |

## Tests that must fail first

### Core fallback tests

Add/update `packages/core/src/explainability/explain.test.ts`:

- `shared-extraction` summary equals `2 components share similar source shape: PrimaryButton and SecondaryButton.` and does not match `^RAI found`.
- `render-coupling`, `over-abstraction`, `hook-topology`, and `boundary-violation` summaries use the exact templates above.
- Known inspect-first guidance uses user-facing labels and does not contain raw assignment-style labels such as `fanIn=`, `propCount=`, `reachableDepth=`.
- Unknown evidence summary equals `Unrecognized evidence kind "custom-evidence" for react/shared-extraction; showing raw evidence keys only.`.
- Unknown evidence limits include raw-facts wording and do not include `team-a` or invented meaning.
- Adapter fallback, when no hook exists, prefixes internal values with `raw ...` and does not synthesize React/Next meaning.

### Adapter hook tests

Add adapter rule tests:

- Compound hook returns a summary about `Modal.Footer` used in JSX without an observed static member declaration.
- Compound inspect-first contains declared/used/missing part sets and `missing declarations observed: 1 (limit: 0)`.
- Client boundary hook returns a summary about a client boundary above configured limits using count/limit wording.
- Route coupling hook returns a summary about a route segment above configured limits using count/limit wording.
- Adapter hook text does not contain primary generic/internal lines matching:

```regex
/^RAI found .* evidence for /i
/\badapter:\s/i
/\brule:\s/i
/\bmetric [A-Za-z0-9_]+:/i
/\bthreshold [A-Za-z0-9_]+:/i
/\bexceeded topology:/i
```

- Adapter hook limits do not claim wrong architecture, team intent, ownership, root cause, historical change, user impact, or required refactoring.

### Composition and surface tests

Add/update session and CLI tests:

- `Session.explainFinding` for a composed Next analyzer returns the Next adapter summary, not core adapter-metric fallback.
- The same result preserves `result.evidence === finding.evidence` by deep equality, raw fingerprint, rule id, severity/status, and memory overlay.
- `rai explain <file>` on the Next fixture includes a client-boundary or route human summary and does not include `adapter: next`, `rule: next/...`, `metric ...:`, `threshold ...:`, or `exceeded topology:` as the primary explanation.
- Existing `explain_finding` additive tests continue to prove no feedback writes and raw fields remain present.

## Strict TDD plan

1. Write failing core explanation tests for exact summary/inspect/limits and unknown fallback.
2. Write failing compound adapter hook test.
3. Write failing Next rule explanation tests.
4. Write failing Next core-adapter propagation test through `Session.explainFinding`.
5. Write failing CLI `rai explain` assertion for one adapter-owned summary.
6. Implement minimal core fallback wording.
7. Implement compound `Analyzer.explain` hook.
8. Implement Next explanation functions and pass them through `adaptNextAnalyzer`.
9. Refactor small shared formatter helpers only after tests pass.
10. Run focused tests first, then full validation.

Focused commands:

```bash
pnpm test packages/core/src/explainability/explain.test.ts
pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts
pnpm test packages/adapter-next/src/client-boundary-bloat.test.ts packages/adapter-next/src/route-coupling.test.ts packages/adapter-next/src/core-adapter.test.ts
pnpm test packages/cli/src/cli.test.ts
```

Full required validation:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## Review workload forecast

Expected implementation stays under the active 1200-line review budget.

| Area | Estimated changed lines |
|------|-------------------------|
| Core fallback + tests | 180-260 |
| React compound hook + tests | 120-180 |
| Next explanation functions + adapter propagation + tests | 240-360 |
| CLI/MCP focused test updates | 80-140 |
| Total expected | 620-940 |

Single PR is appropriate if scope stays here. Pause before apply and ask for a delivery decision if work expands into doctor/install/backfill/error UX, broad README rewrites, schema changes, or new analyzer semantics because that can exceed 1200 lines.

## Rollout and rollback

Rollout is a normal code/test PR with no migration.

Rollback is low-risk:

1. Revert explanation string/helper changes.
2. Revert adapter hook additions and hook propagation.
3. Revert related tests.
4. Re-run `pnpm test && pnpm test:launcher`.

No DB, snapshot, feedback, MCP raw field, or finding migration is needed.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Human text snapshots break. | Keep exact text deterministic; tests assert meaning and targeted strings, not large paragraphs. Raw fields stay stable. |
| Adapter semantics leak into core. | Core only explains core evidence categories and raw adapter facts. Compound/Next wording lives in adapter modules. |
| Next hook passes unit tests but not CLI/MCP. | Add core-adapter/session and CLI tests proving composed registry uses `Analyzer.explain`. |
| Wording overclaims cause or remediation. | Limits explicitly reject intent, ownership, root cause, user impact, historical change, wrong architecture, and required refactoring. |
| Fallback becomes too opaque for unknown adapters. | Fallback still lists raw evidence keys and raw adapter facts, clearly labeled as raw/unrecognized. |

## Acceptance checklist

- [ ] Known core evidence summaries no longer lead with `RAI found <kind> evidence for <ruleId>`.
- [ ] Known core inspect-first guidance cites concrete files, names, counts, and config reasons.
- [ ] Compound, Next client-boundary, and Next route findings use adapter-owned explanations.
- [ ] Next `core-adapter.ts` preserves hooks into composed core analyzers.
- [ ] CLI `rai explain` and MCP/session `explain_finding` use the improved envelope.
- [ ] Unknown evidence fallback remains explicit raw evidence only.
- [ ] Raw findings, evidence, fingerprints, severity/status, diagnostics, memory, snapshots, and JSON/MCP schemas stay unchanged.
- [ ] Strict TDD and full validation commands complete before apply is considered done.
