# Design: P11-S5 Context Provider Value-Surface Drift

## Technical Approach

Add `react/context-provider-value-surface-drift` as a pure, adapter-owned analyzer in `packages/adapter-react`. The analyzer consumes frozen `RepoGraph.patternFacts`, correlates local `createContext` call bindings with same-file `<Local.Provider>` JSX occurrences by `(file, localName)`, derives only syntax-level provider `value` surface observations, and emits `type: "opportunity"` findings when the observed surfaces diverge under bounded rules.

The implementation should mirror the existing React analyzers:

- `compound-component-api-drift.ts`: pattern-fact consumer over `observationsFor(ctx.graph.patternFacts)`, sorted fact indexing, collected fact ids, SHA fingerprints.
- `controlled-uncontrolled-prop-surface-drift.ts`: `AdapterMetricEvidence` with `subject`, `roles`, `metrics`, `thresholds`, `topology`, adapter-local `severityFor`, and analyzer-owned `explain` envelope with `limits` and `glossary`.
- `container-presenter-role-drift.ts`: deterministic filtering, dedupe/sort before fingerprinting, frozen-input-safe reads, and bounded current-source wording.

No `@rai/core` behavior or contracts change. React meaning remains inside `@rai/adapter-react`; core facts remain syntax-only.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Analyzer location | Add `packages/adapter-react/src/context-provider-value-surface-drift.ts`. | React provider interpretation is adapter-owned; core remains framework-neutral. |
| Rule id / family | `react/context-provider-value-surface-drift`, family `provider/context`. | Matches proposal/spec and remaining P11 provider slice. |
| Evidence shape | Reuse `AdapterMetricEvidence`; do not add a new evidence union. | Existing adapter evidence already persists, explains, and flows through CLI/MCP. |
| Correlation key | `(file, localName)` from `call-binding.local`; provider tags must be same-file `<localName>.Provider`. | Keeps this slice same-file and syntax-grounded without symbol resolution. |
| Provider enumeration | Use `jsx` facts to enumerate provider occurrences, then `jsx-attribute` facts to classify direct `value` and spread/ambiguous attributes. | A provider with zero attributes has no `jsx-attribute` fact, so `jsx` is required to observe “no direct value” accurately. |
| Default argument association | Match `call-argument` index `0` to the containing `call-binding` by same file/callee and AST path/span containment. | `call-argument` facts do not store the binding local name; containment is the stable same-call signal available today. |
| Emission | One finding per non-colliding `(file, localName)` observation only when at least one same-file provider exists and divergence labels are present. | Avoids no-provider findings and keeps output bounded to observed value-surface divergence. |
| Duplicate local binding keys | Suppress findings when multiple `createContext` bindings share the same `(file, localName)`. | Current facts do not expose lexical scope; suppression avoids over-correlating providers across same-file name collisions. |
| Severity | `info` for one divergence label; `warn` for more than one; never `error`. | Matches prior adapter-local deterministic escalation pattern. |

## Data Flow

```text
SourceFile[]
  -> @rai/core pass1/buildGraph
     - patternFacts include call-binding, call-argument, jsx, jsx-attribute, hook-call
  -> @rai/adapter-react createReactCoreAnalyzers(...)
     - registers react/context-provider-value-surface-drift
  -> analyzer observationsFor(ctx.graph.patternFacts)
     - sort copied facts deterministically
     - filter createContext call bindings
     - associate createContext arg0 facts by same call
     - enumerate same-file <Local.Provider> jsx facts
     - classify provider attributes from contained jsx-attribute facts
     - optionally collect useContext/use call evidence when already observed
     - derive divergence labels, metrics, thresholds, fact ids
  -> Finding[] with AdapterMetricEvidence + SHA fingerprints
  -> existing core analysis, persistence, CLI, MCP, explain paths
```

## Package Boundaries

### `packages/core`

No planned changes.

Core already provides the required generic facts:

- `PatternCallBindingFact` (`kind: "call-binding"`)
- `PatternCallArgumentFact` (`kind: "call-argument"`)
- `PatternJsxFact` (`kind: "jsx"`)
- `PatternJsxAttributeFact` (`kind: "jsx-attribute"`)
- optional `PatternHookCallFact` (`kind: "hook-call"`)

Core must not gain React context/provider rule ids, catalog labels, provider labels, imports from `@rai/adapter-react`, JSX provider semantics, or analyzer registration logic.

### `packages/adapter-react`

Owns all new logic:

- analyzer factory;
- fact filtering predicates;
- context/provider observation model;
- divergence rules;
- evidence construction;
- severity mapping;
- analyzer-owned explanation text;
- registration through the existing React adapter factory.

## Analyzer Contract

```ts
export const CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID =
  "react/context-provider-value-surface-drift";

export function createContextProviderValueSurfaceDriftAnalyzer(): Analyzer;
```

Returned analyzer:

- `ruleId: "react/context-provider-value-surface-drift"`
- `framework: "react"`
- `analyze(ctx: AnalysisContext): AnalyzerResult`
- `explain(finding: PresentedFinding): ExplanationEnvelope | null`
- pure, synchronous, side-effect free
- no filesystem, network, memory, config, snapshot, feedback, source, instruction, clock, randomness, or LLM writes
- lets core analyzer isolation handle unexpected failures; no broad local try/catch

## Internal Observation Model

Recommended internal adapter-only types:

```ts
type ContextProviderKey = `${string}\0${string}`; // file\0localName

type ProviderSurfaceKind =
  | "direct-value"
  | "missing-direct-value"
  | "direct-value-with-spread"
  | "spread-ambiguous";

interface ContextBindingObservation {
  key: ContextProviderKey;
  file: string;
  localName: string;
  bindingFacts: PatternCallBindingFact[];
  defaultArgument: DefaultArgumentSurface;
  providers: ProviderOccurrence[];
  consumerFactIds: string[];
  collision: boolean;
}

interface DefaultArgumentSurface {
  observed: boolean;
  argumentKind: PatternCallArgumentFact["argumentKind"] | null;
  factIds: string[];
}

interface ProviderOccurrence {
  fact: PatternJsxFact;
  attributeFacts: PatternJsxAttributeFact[];
  directValueAttributeFacts: PatternJsxAttributeFact[];
  spreadAttributeFacts: PatternJsxAttributeFact[];
  hasDirectValue: boolean;
  hasSpread: boolean;
  surfaceKind: ProviderSurfaceKind;
  spanToken: string; // `${file}@${start}-${end}`
}
```

`collision` is true when more than one createContext binding fact exists for the same `(file, localName)`. A collided observation is skipped for emission because current facts cannot disambiguate lexical scope.

## Fact Filtering Predicates

Implement narrow type guards and helpers near the analyzer, not in core.

```ts
function isCallBindingFact(fact: PatternFact): fact is PatternCallBindingFact {
  return fact.kind === "call-binding" && isCreateContextCallee(fact.callee) && isIdentifierName(fact.local);
}

function isCallArgumentFact(fact: PatternFact): fact is PatternCallArgumentFact {
  return fact.kind === "call-argument" && isCreateContextCallee(fact.callee);
}

function isJsxAttributeFact(fact: PatternFact): fact is PatternJsxAttributeFact {
  return fact.kind === "jsx-attribute" && splitProviderTag(fact.tag) !== null;
}

function isProviderJsxFact(fact: PatternFact): fact is PatternJsxFact {
  return fact.kind === "jsx" && splitProviderTag(fact.tag) !== null;
}
```

Helper semantics:

```ts
function isCreateContextCallee(callee: string): boolean {
  const value = callee.trim();
  return value === "createContext" || value.endsWith(".createContext");
}

function splitProviderTag(tag: string): { localName: string } | null {
  const value = tag.trim();
  const suffix = ".Provider";
  if (!value.endsWith(suffix)) return null;
  const localName = value.slice(0, -suffix.length).trim();
  return isIdentifierName(localName) ? { localName } : null;
}

function isDirectProviderValueAttribute(fact: PatternJsxAttributeFact): boolean {
  return fact.name === "value" && fact.valueKind !== "spread";
}

function isSpreadProviderAttribute(fact: PatternJsxAttributeFact): boolean {
  return fact.valueKind === "spread";
}
```

Notes:

- Bare `createContext(...)` and member `React.createContext(...)` both match.
- Member forms match only by string suffix `.createContext`; no import or type resolution is attempted.
- Direct provider value means a non-spread JSX attribute named `value` was observed. `valueKind: "absent"` still counts as a direct `value` surface because the direct attribute name exists; the analyzer does not infer runtime meaning.
- Spread provider attributes are ambiguity evidence only. They are not expanded and do not prove `value` is absent inside the spread object.
- `<Namespace.Context.Provider>` does not match a local binding named `Context` because the correlation key is same-file local identifier text only.

## Correlation Rules

### Context key

The primary subject key is:

```ts
const key = `${binding.file}\0${binding.local}` as ContextProviderKey;
```

All observations, sorting, fingerprints, and evidence are anchored to:

- `file`: `binding.file`
- `localName`: `binding.local`

### Binding collection

1. Copy and sort `ctx.graph.patternFacts` with `compareFacts` before filtering.
2. Keep only `isCallBindingFact` facts.
3. Group bindings by `(file, localName)`.
4. Mark groups with more than one binding fact as `collision: true`; skip emission for those groups.
5. For non-colliding groups, use the single binding fact as the context call anchor.

### Default argument association

A `call-argument` fact belongs to a binding when all are true:

1. `arg.file === binding.file`
2. `arg.callee.trim() === binding.callee.trim()`
3. `arg.argumentIndex === 0`
4. same-call relationship holds:
   - preferred: `arg.span.astPath.startsWith(`${binding.span.astPath}>init`)`
   - fallback: `spanContains(binding.span, arg.span)`

If at least one matching arg0 fact exists, default surface is `observed: true` and `argumentKind` is the first fact after `compareFacts` sorting. If none exists, default surface is `observed: false` and `argumentKind: null`.

### Provider occurrence association

A provider occurrence belongs to a binding when all are true:

1. fact is `PatternJsxFact`
2. `splitProviderTag(fact.tag)?.localName === binding.local`
3. `fact.file === binding.file`

Provider occurrences are sorted by:

1. `file`
2. `span.start`
3. `span.end`
4. `tag`
5. `id`

Attribute facts belong to a provider occurrence when all are true:

1. fact is `PatternJsxAttributeFact`
2. `fact.file === provider.fact.file`
3. `fact.tag === provider.fact.tag`
4. `spanContains(provider.fact.span, fact.span)`

Classify each provider occurrence:

| Condition | Surface |
|---|---|
| direct `value` attr and no spread | `direct-value` |
| direct `value` attr and one or more spread attrs | `direct-value-with-spread` |
| no direct `value` attr and one or more spread attrs | `spread-ambiguous` |
| no direct `value` attr and no spread attrs | `missing-direct-value` |

For direct-value presence metrics, `direct-value` and `direct-value-with-spread` count as direct. `spread-ambiguous` and `missing-direct-value` count as no directly observed `value`.

### Optional consumer corroboration

Consumer evidence is optional and never required for emission.

Collect fact ids only when all matching data is already available:

- `hook-call` named `useContext` in the same file plus a same-call `call-argument` index `0` whose `argument` equals `localName`.
- `call-argument` callee `use`, argument index `0`, same file, `argument === localName`.

These ids may be added to `topology.reachableNodeIds` and roles as `context-consumer-call`, but divergence rules must not depend on them.

## Divergence Detection Rules

Skip an observation when:

1. `collision === true`.
2. no same-file provider occurrence exists.
3. no divergence labels are derived.

Derive divergence labels deterministically:

### `noDefaultArgumentAndProviderNoDirectValue`

Emit one exceeded token per provider occurrence when:

- `defaultArgument.observed === false`
- provider has no direct `value` attribute (`hasDirectValue === false`)

Token format:

```text
noDefaultArgumentAndProviderNoDirectValue:<spanToken>
```

This wording means “no directly observed provider `value` attribute,” not “runtime value is absent.” If the same provider also has spread attrs, the spread ambiguity token below is also emitted.

### `mixedProviderDirectValuePresence`

Emit once per context binding when:

- at least one provider occurrence has `hasDirectValue === true`
- at least one provider occurrence has `hasDirectValue === false`

Token format:

```text
mixedProviderDirectValuePresence:<localName>
```

This detects direct-value presence divergence only. It does not compare expression shapes, object fields, types, or runtime values.

### `providerSpreadAmbiguous`

Emit one exceeded token per provider occurrence when:

- provider has one or more spread attributes

Token format:

```text
providerSpreadAmbiguous:<spanToken>
```

This records that the direct `value` surface cannot be fully observed from JSX attributes. It must not claim spread expansion or hidden `value` presence/absence.

### Non-divergence cases

Do not emit for:

- `createContext` binding with no same-file provider.
- providers where every occurrence has direct `value` and no spread, even if `createContext` has no default argument.
- a single provider with no direct `value` when a default argument was observed and no spread exists.
- direct `value` expressions with different expression text or shapes.
- cross-file providers with the same local name.
- provider aliases such as `<Provider>` without `<Local.Provider>` syntax.

## Severity Mapping

Use adapter-local deterministic severity:

```ts
function severityFor(divergenceCount: number): Severity {
  return divergenceCount > 1 ? "warn" : "info";
}
```

Where `divergenceCount` is the sorted exceeded-token count after derivation. The analyzer never emits `error` in P11-S5.

## Evidence Shape

Use `AdapterMetricEvidence`.

### Subject

```ts
subject: {
  id: `react:context-provider:${file}:${localName}`,
  name: localName,
  file,
  span: primarySpan,
  fingerprint: subjectFingerprint,
}
```

`primarySpan` should be the first deterministic divergent provider span when available; otherwise the binding span. Since findings only emit with providers, this normally points to the provider occurrence that crossed a threshold. Provider and default fact ids in topology preserve additional locations.

### Roles

Recommended role/variant values:

| Role | Variant |
|---|---|
| `context-binding` | `<localName>` |
| `create-context-callee` | `bare:createContext` or `member:<callee>` |
| `default-argument` | `observed:<argumentKind>` or `absent` |
| `provider-surface` | `<surfaceKind>@<start>-<end>` |
| `provider-direct-value` | `<valueKind>@<start>-<end>` |
| `provider-spread-ambiguous` | `<attributeName>@<start>-<end>` |
| `context-consumer-call` | `useContext` or `use` |

Roles are deduped by `role:variant:file` and sorted by `role`, `variant`, `file`.

### Metrics

Use stable count metrics only:

```ts
metrics: {
  contextBindings: 1,
  defaultArgumentsObserved: 0 | 1,
  providers: providerCount,
  providersWithDirectValue: directProviderCount,
  providersWithoutDirectValue: noDirectProviderCount,
  providersWithSpread: spreadProviderCount,
  directValuePresenceModes: directProviderCount > 0 && noDirectProviderCount > 0 ? 2 : 1,
  consumerCalls: consumerFactIds.length,
  surfaceDivergences: exceeded.length,
}
```

If `providers` is zero no finding is emitted, so emitted findings always have `providers >= 1`.

### Thresholds

Use stable zero/min thresholds:

```ts
thresholds: {
  minProviders: 1,
  maxProvidersWithoutDirectValueWhenNoDefault: 0,
  maxMixedDirectValuePresence: 0,
  maxSpreadAmbiguousProviders: 0,
}
```

### Topology

Use fact id collections, all sorted:

```ts
topology: {
  directChildIds: sortedUnique([
    ...bindingFactIds,
    ...defaultArgument.factIds,
  ]),
  reachableNodeIds: sortedUnique([
    ...providerJsxFactIds,
    ...providerAttributeFactIds,
    ...consumerFactIds,
  ]),
  exceeded: sortedExceededTokens,
}
```

This follows the existing adapter-metric evidence shape while preserving stable fact-id grounding.

## Explanation Envelope

Add analyzer-owned explain logic similar to the existing React analyzers.

Return `null` unless:

- `finding.ruleId === CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID`
- `finding.evidence.kind === "adapter-metric"`

Envelope fields:

- `summary`: one bounded sentence focused on observed same-file value-surface divergence.
- `whyItMatters`: review/onboarding maintainability signal, not a correctness claim.
- `inspectFirst`: deterministic bullets for subject, default argument surface, provider surface counts, spread ambiguity count, consumer corroboration if any, and threshold count.
- `limits`: must include no runtime semantics, no bug claim, no team intent/root cause/user impact, no cross-file symbol resolution, no spread expansion, no required remediation.
- `groundingFields`: `Object.keys(evidence).sort()`.
- `glossary`: `groundingFields.map(explainTerm)`.

Suggested bounded summary templates:

- No default + missing direct value:
  - `` `${name} has a same-file provider with no directly observed value attribute, and no createContext default argument was observed.` ``
- Mixed direct-value presence:
  - `` `${name} has same-file providers where some occurrences have a direct value attribute and some do not.` ``
- Spread ambiguity:
  - `` `${name} has a same-file provider spread attribute, so the direct value surface is ambiguous from syntax facts.` ``
- Multiple labels:
  - `` `${name} has multiple same-file provider value-surface divergence signals: ${formatList(labels)}.` ``

Prohibited wording in messages/explanations:

- “bug”
- “wrong”
- “must refactor”
- “runtime value is missing”
- “React warning”
- “intended API”
- “root cause”
- “user impact”
- “historically changed”
- “spread contains/does not contain value”

## Deterministic Sort and Fingerprint Approach

### Sort order

Use copied arrays; never mutate frozen graph arrays.

`compareFacts(a, b)`:

1. `a.id.localeCompare(b.id)`
2. `a.file.localeCompare(b.file)`
3. `a.span.start - b.span.start`
4. `a.span.end - b.span.end`
5. `a.kind.localeCompare(b.kind)`

Observation sort:

1. `file`
2. `localName`
3. binding `span.start`
4. binding `span.end`
5. binding `id`

Provider sort:

1. provider `file`
2. provider `span.start`
3. provider `span.end`
4. provider `tag`
5. provider `id`

Roles sort:

1. `role`
2. `variant`
3. `file`

Finding sort:

1. `fingerprint.structural`
2. `fingerprint.nominal`
3. `fingerprint.positional`

All arrays in evidence (`roles`, `directChildIds`, `reachableNodeIds`, `exceeded`) must be sorted after dedupe.

### Fingerprints

Use the same local helper pattern as existing analyzers:

```ts
function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
```

Recommended stable subject fingerprint input with explicitly ordered keys:

```ts
const subjectFingerprint = sha(JSON.stringify({
  defaultArgument: {
    argumentKind: defaultArgument.argumentKind,
    factIds: defaultArgument.factIds,
    observed: defaultArgument.observed,
  },
  exceeded,
  file,
  localName,
  providerSurfaces: providers.map((provider) => ({
    attributeFactIds: provider.attributeFacts.map((fact) => fact.id).sort(),
    directValueFactIds: provider.directValueAttributeFacts.map((fact) => fact.id).sort(),
    file: provider.fact.file,
    hasDirectValue: provider.hasDirectValue,
    hasSpread: provider.hasSpread,
    span: { start: provider.fact.span.start, end: provider.fact.span.end },
    spreadFactIds: provider.spreadAttributeFacts.map((fact) => fact.id).sort(),
    surfaceKind: provider.surfaceKind,
    tag: provider.fact.tag,
  })),
  bindingFactIds,
  consumerFactIds,
}));
```

Finding fields:

```ts
id: sha([
  ctx.runId,
  CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
  file,
  localName,
  subjectFingerprint,
].join("|")),

fingerprint: {
  structural: sha(JSON.stringify({
    ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
    file,
    localName,
    defaultObserved: defaultArgument.observed,
    defaultArgumentKind: defaultArgument.argumentKind,
    providerSurfaceKeys: providers.map(providerSurfaceKey),
    exceeded,
  })),
  nominal: sha(localName),
  positional: sha([file, primarySpan.start, primarySpan.end].join("|")),
}
```

`providerSurfaceKey` should be deterministic and bounded, for example:

```text
<tag>@<start>-<end>:<surfaceKind>
```

Do not include wall-clock time, process ids, object identity, map insertion order, LLM text, config serialization order, or unsorted arrays.

## Wiring Touchpoints

1. **New analyzer + test**
   - Add `packages/adapter-react/src/context-provider-value-surface-drift.ts`.
   - Add `packages/adapter-react/src/context-provider-value-surface-drift.test.ts`.

2. **`core-adapter.ts` factory registration**
   - Import `createContextProviderValueSurfaceDriftAnalyzer`.
   - Append it to `createReactCoreAnalyzers(...)` after existing analyzers for stable metadata order:
     1. compound component API drift
     2. container/presenter role drift
     3. controlled/uncontrolled prop-surface drift
     4. context provider value-surface drift

3. **`index.ts` export**
   - Export `CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID`.
   - Export `createContextProviderValueSurfaceDriftAnalyzer`.

4. **`catalog.ts` fact-kind confirmation**
   - No code change expected.
   - Confirm `FACT_KINDS` already includes the three required P11-S4 fact kinds:
     - `"call-binding"`
     - `"call-argument"`
     - `"jsx-attribute"`
   - `"jsx"` is also already present and should be used to enumerate provider occurrences.

## Tests

Strict TDD before implementation.

### Analyzer unit tests

Add `context-provider-value-surface-drift.test.ts` with helper fact builders for `call-binding`, `call-argument`, `jsx`, `jsx-attribute`, and optional `hook-call`.

Required cases:

1. **Bare createContext, absent default, missing direct provider value reports**
   - `call-binding`: local `AuthContext`, callee `createContext`.
   - no matching `call-argument` index `0`.
   - same-file `jsx`: `AuthContext.Provider` with no `value` attr.
   - emits one `info` finding with `noDefaultArgumentAndProviderNoDirectValue:*` exceeded token.

2. **Member createContext with mixed provider direct-value presence reports**
   - binding callee `React.createContext`.
   - matching `call-argument` index `0` with bounded `argumentKind`.
   - one provider has direct `value`; another has no direct `value`.
   - emits finding with default observed evidence and `mixedProviderDirectValuePresence:ThemeContext`.

3. **Spread provider attributes are ambiguity only**
   - provider has spread attr and no direct `value`.
   - emits `providerSpreadAmbiguous:*`.
   - serialized finding/explanation does not claim spread expansion or runtime absence.

4. **Consistent direct provider value surfaces stay silent**
   - no default argument is observed.
   - every same-file provider has direct `value`.
   - no spread attrs.
   - emits no finding.

5. **Context binding without same-file provider stays silent**
   - createContext binding exists.
   - no same-file `Local.Provider` JSX fact.
   - emits no finding.

6. **Cross-file provider usage is not correlated**
   - binding in `src/context.tsx`.
   - `<AuthContext.Provider>` only in `src/page.tsx`.
   - emits no finding.

7. **Direct value expression shape is not semantic divergence**
   - multiple providers all have direct `value` but expression/valueKind differs.
   - emits no finding unless spread is present.

8. **Duplicate same-file local binding keys are suppressed**
   - two `createContext` bindings with same file/localName.
   - provider exists.
   - emits no finding because scope identity is ambiguous.

9. **Determinism**
   - reverse fact order and nested attribute order.
   - normalized findings match.
   - roles, topology ids, exceeded tokens, and finding order are sorted.

10. **Frozen input**
    - freeze facts/spans/graph arrays.
    - analyzer reads without mutation.

11. **Explanation quality**
    - analyzer-owned explanation has bounded summary, inspect-first metrics, limits, grounding fields, glossary.
    - explanation does not contain prohibited claim language.

### Adapter factory tests

Update `packages/adapter-react/src/core-adapter.test.ts`:

- stable metadata now includes the new rule id as the fourth React analyzer.
- integration path through `createSession` / `analyzeRepo` emits a context provider finding from parsed TSX.
- existing compound/container/controlled tests continue to pass.

### Export/catalog tests

- `index.ts` export should be covered by test imports compiling.
- `catalog.test.ts` already asserts `FACT_KINDS` includes `call-binding`, `call-argument`, and `jsx-attribute`; update only if the expected list changes, which is not expected.

## Rollout Plan

Recommended apply order:

1. Add failing analyzer unit tests.
2. Implement analyzer predicates, observation builder, divergence rules, evidence, severity, fingerprints, and explanation.
3. Wire `core-adapter.ts` registration and `index.ts` exports.
4. Add/update factory integration tests.
5. Confirm catalog fact kinds already cover required facts.
6. Run targeted tests, then full verification.

Suggested targeted verification:

```bash
pnpm test packages/adapter-react/src/context-provider-value-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts packages/adapter-react/src/catalog.test.ts
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

Full verification before archive should also run the project-standard test suite and smoke checks if changed-line budget allows.

## Rollback Plan

1. Remove the analyzer from `createReactCoreAnalyzers`.
2. Remove exports from `packages/adapter-react/src/index.ts`.
3. Delete `context-provider-value-surface-drift.ts` and its tests.
4. Leave `@rai/core` P11-S4 generic facts intact.
5. No migration or cleanup is needed because findings flow through existing append-only finding/snapshot paths and the analyzer performs no direct writes.

## Review / Judgment Risks

| Risk | Why it matters | Design mitigation |
|---|---|---|
| Name collision within file | `(file, localName)` has no lexical scope, so two same-file bindings named `AuthContext` could be over-correlated with providers. | Detect multiple createContext binding facts for the same key and suppress emission for that key. Document same-file/local-name claim boundary. |
| Spread/value indirection | `{...props}` may contain `value`; `value={makeValue()}` may hide object shape; direct expression text does not prove runtime provider API. | Treat spread as `providerSpreadAmbiguous`; treat direct `value` as direct surface only; do not expand spreads, compare object fields, or infer runtime values. |
| Member-callee variance (`React.createContext` vs `createContext`) | Bare `createContext` may be imported from React or shadowed; member `.createContext` could be non-React. | Match bare `createContext` and suffix `.createContext` only as syntax evidence; no import/type claims; explanation says “callee observed,” not semantic React resolution. |
| Provider occurrence with zero attributes | `jsx-attribute` alone cannot observe a no-attribute provider. | Use existing `jsx` facts to enumerate `<Local.Provider>` occurrences and contained `jsx-attribute` facts for classification. |
| Evidence span richness | `AdapterMetricEvidence` has only one structured subject span and role files. | Use primary divergent provider as `subject.span`; put all binding/provider/attribute fact ids in topology; encode provider span tokens in role variants. Defer richer evidence type unless multiple analyzers need it. |
| Noise from intentional default contexts | A missing direct provider value can be intentional when a default exists. | Emit missing-direct-value-without-default only when no default arg was observed; keep single missing direct with observed default silent unless mixed/spread divergence exists. |

## SDD Notes

- `skill_resolution`: `none` — no executor skill paths were injected; design used prompt instructions plus repo/OpenSpec/code reading.
- Artifact store: OpenSpec file `openspec/changes/p11-s5-context-provider-value-surface-drift/design.md`.
- Engram memory tools were unavailable in this session; no memory persistence was claimed.
