# Tasks: P11-S9 — react/design-system-usage-surface-drift

Phase: tasks · Persistence: hybrid · Engram topic: `sdd/p11-s9-design-system-usage-surface-drift/tasks`
Delivery: Strict TDD ACTIVE (`pnpm test` / vitest). Review budget: 800 lines. Chained PR: auto-forecast.

Reads: spec (Engram #652 / `spec.md`), design (Engram #653 / `design.md`).
Template: `packages/adapter-react/src/overlay-control-surface-drift.ts` (+`.test.ts`) — the P11-S8 mirror.

Honors: design ADR-1..ADR-8, all 27 spec scenarios (11 + 2 + 3 + 5 ADDED, 6 in MODIFIED slice-scoping incl. new P11-S9 scenario).

---

## Work unit boundaries (work-unit-commits)

This slice is one cohesive deliverable. Group into ordered commits that each leave the repo coherent:

- **Commit 1** (Tasks 1–2): analyzer behavior + its full test file (RED→GREEN). Tests ship WITH the behavior.
- **Commit 2** (Tasks 3–4): registry/export wiring + ordered-list test update + explain test (if not already folded into Commit 1's test file).
- **Commit 3** (Task 6): docs (`docs/STATUS.md`, `docs/ROADMAP.md`).

Task 5 (verify gate) runs before each commit boundary, not as its own commit. Task 7 is an archive-time note, not a commit.

---

## Task 1 — RED: author the test file covering all scenarios + edge cases

- [x] 1.1 Create `packages/adapter-react/src/design-system-usage-surface-drift.test.ts`.
- [x] 1.2 Reuse the P11-S8 harness VERBATIM (copy from `overlay-control-surface-drift.test.ts`):
  - `runFacts(facts, runId?, components?)` — **3-arg signature** with `components: GraphComponent[] = []` passed into `graph.components as never[]` (this is what proves non-overlap with S3).
  - `interface GraphComponent { name: string; propNames: string[]; file: string }`.
  - `normalizeResult`, `adapterEvidence`, `normalize` (blanks `id` + `producingRunId`), `freezeFacts`, `presented`, `span`, `jsx(id, tag, file, start, end)`, `jsxAttribute(id, tag, name, valueKind, value, file, start, end)`.
  - `valueKind` union MUST include `"spread"` (design §10): `"absent" | "literal" | "expression" | "spread" | "unknown"`.
  - Import `createDesignSystemUsageSurfaceDriftAnalyzer` + `DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID` from `./design-system-usage-surface-drift.js`.
- [x] 1.3 Author the following test cases (each maps to a spec scenario / design edge):

  CRITICAL cross-usage gate cases:
  - [x] (a) **Cross-usage EMITS info**: `<Button variant>` (usage 1, variant-only) + DIFFERENT `<Button className>` (usage 2, raw-only) → 1 finding, `severityRaw: "info"`, `topology.exceeded` contains `stylingVariantSurfaceDrift:Button:<file>`. (Spec: "Variant-on-one-Button and className-on-another-Button is reported".)
  - [x] (b) **Single dual-surface usage SILENT**: one `<Button variant className>` alone, no other `<Button>` → `[]`. Cross-usage is REQUIRED; a single both-surface usage MUST NOT fire (fails `elements.length < 2`). (Spec: "Single usage carrying both variant and raw-style props stays silent".)
  - [x] (c-1) **Uniform variant-only SILENT**: two `<Button variant>` (different values), no raw → `[]` (`elsWithRaw.size === 0`). (Spec: "Uniform variant-only surface across usages stays silent".)
  - [x] (c-2) **Uniform raw-only SILENT**: two `<Card className>`, no variant → `[]` (`elsWithVariant.size === 0`). (Spec: "Uniform raw-style-only surface across usages stays silent".)
  - [x] (c-3) **All-usages-both SILENT**: two `<Button variant className>` (every usage carries BOTH) → `[]` (`variantWithoutRaw || rawWithoutVariant` is false). (Spec: "All usages carrying both surfaces stays silent".)
  - [x] (d) **`<2` usages SILENT**: single `<Button variant>` only → `[]` regardless of props on the single usage. (Spec: "Fewer than two usages of a tag stays silent".)
  - [x] (e) **Lowercase native SILENT**: `<button variant>` + `<button className>` → `[]` (`isCandidateTag` uppercase check; S6 domain). (Spec: "Lowercase native tags are not matched".)
  - [x] (f) **Dotted member SILENT**: `<Modal.Trigger variant>` + `<Modal.Content className>` → `[]` (`!tag.includes(".")`; S1 domain). (Spec: "Dotted member tags are not matched".)
  - [x] (g) **NON-OVERLAP with S3 (CENTRAL acceptance criterion)**: call `runFacts` with `components: [{ name: "MyComponent", propNames: ["variant", "className"], file: "src/comp.tsx" }]` AND `<2` divergent JSX usages (e.g. a single `<Button variant>` only, OR zero jsx facts) → `[]`. Comment: this proves the analyzer NEVER reads `ctx.graph.components` / `component.propNames` (emission is driven by patternFacts alone). Add a second variant with `runFacts([], "run-nonoverlap-zero", [{...propNames...}])` → `[]`. (Spec: "Component declaring variant and className in propNames with no divergent JSX usage stays silent".)
  - [x] (g-2) **Usage divergence detected WITHOUT component-definition input**: `<Badge variant={x}>` + DIFFERENT `<Badge className="...">`, NO `components` entry passed → EMITS 1 finding from JSX-attribute facts alone. (Spec: "Design-system usage divergence is detected without any component-definition input".)
  - [x] (h) **Bare variant (valueKind `absent`) counts**: `<Card variant>` with `jsxAttribute(..., "variant", "absent", "", ...)` + DIFFERENT `<Card className>` → EMITS. Bare prop name counts as a present VARIANT_PROP regardless of absent value (OQ3 / S8 bare-open precedent). (Spec: "Bare variant attribute counts as a variant-style prop name".)
  - [x] (i) **Multiple divergent tags → warn**: `Button` cross-usage + `Card` cross-usage in same file → 1 finding, `severityRaw: "warn"`, `topology.exceeded.length === 2`. (Spec: "Severity escalates on multiple divergent tags".)
  - [x] (i-2) **Single divergent tag → info**: assert the (a) finding has `severityRaw === "info"` (one token). (Spec: "Severity escalates..." — info branch.)
  - [x] (j-1) **No present variant prop SILENT**: two `<Card>` usages, at least one `className`, NONE carry any VARIANT_PROP → `[]`. (Spec: "No present variant prop stays silent".)
  - [x] (j-2) **No present raw-style prop SILENT**: two `<Card>` usages, at least one `variant`, NONE carry any RAW_STYLE_PROP → `[]`. (Spec: "No present raw-style prop stays silent".)
  - [x] (k) **Determinism**: forward vs `[...facts].reverse()` with same `runId` → identical `normalize(...)` output. (Spec: "Identical input produces stable output".)
  - [x] (l) **Structural-FP stability under span shift**: baseline vs all-spans-shifted-by-constant → `fingerprint.structural` EQUAL, `fingerprint.positional` NOT equal. (Spec: "Fingerprints exclude unstable inputs and resist span shifts".)
  - [x] (m) **Frozen evidence / frozen facts**: `freezeFacts([...])`, capture `JSON.stringify(facts)` before, run, assert `JSON.stringify(facts)` unchanged after. (Spec: "Reads frozen pattern facts without mutating them".)
  - [x] (n) **Evidence references observed names only**: assert `evidence.subject.file`, `evidence.topology.exceeded`, and metrics reference only the observed tags/prop names (e.g. `Button`, `variant`, `className`); spot-check no membership/library/theming strings. (Spec: "Evidence references observed prop names and tag names only".)
  - [x] (o) **Cross-file isolation**: `<Button variant>` in `file-a`, `<Button className>` in `file-b` → `[]` per file (`spanContains` requires same file). (Design edge #14.)
  - [x] (p) **spanContains correctness**: two `<Button>` elements with attrs nested in DISTINCT spans (one variant-only, one raw-only) map to the right element → EMITS. (Design §10 case 18.)
- [x] 1.4 Explain tests live in Task 4 (same file). It is acceptable to author them now in the same file.
- [x] 1.5 Run `pnpm test --filter @rai/adapter-react` (or repo `pnpm test`) → confirm RED (module does not exist / assertions fail). Record that it is RED before GREEN.

Dependency: none. Must precede Task 2 (Strict TDD: RED before GREEN).

---

## Task 2 — GREEN: implement the analyzer per design

- [x] 2.1 Create `packages/adapter-react/src/design-system-usage-surface-drift.ts`.
- [x] 2.2 Imports from `@rai/core` (ADR-1, mirror S8 MINUS component type): `explainTerm` + types `AdapterMetricEvidence, AnalysisContext, Analyzer, AnalyzerResult, ExplanationEnvelope, Finding, PatternFact, PatternJsxAttributeFact, PatternJsxFact, PresentedFinding, Severity, Span`; `createHash` from `node:crypto`. **MUST NOT import `ComponentNode`.**
- [x] 2.3 Export `const DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID = "react/design-system-usage-surface-drift";`.
- [x] 2.4 Frozen sets with the mandatory OQ4 comment verbatim ABOVE them (ADR-2):
  - `VARIANT_PROPS = Object.freeze(new Set(["variant","size","color","tone","intent","appearance"]))`.
  - `RAW_STYLE_PROPS = Object.freeze(new Set(["className","style"]))`.
  - OQ4 comment: additions require a P12 calibration cycle; no ad-hoc broadening (each new token broadens FP surface).
- [x] 2.5 Factory `createDesignSystemUsageSurfaceDriftAnalyzer(): Analyzer` returning `{ ruleId, framework: "react", analyze, explain }` (S8 shape).
- [x] 2.6 Tag guard `isCandidateTag(tag)`: `tag.length > 0 && tag[0] === tag[0].toUpperCase() && tag[0] !== tag[0].toLowerCase() && !tag.includes(".")` (ADR-3; the `!== toLowerCase()` clause rejects leading non-letters like `$Foo`).
- [x] 2.7 Fact guards (mirror S8): `isJsxFact` (`kind === "jsx"` AND `isCandidateTag(tag)`); `isJsxAttributeFact` (`kind === "jsx-attribute"` AND `isCandidateTag(tag)` AND `VARIANT_PROPS.has(name) || RAW_STYLE_PROPS.has(name)`).
- [x] 2.8 `analyze` reads ONLY `ctx.graph.patternFacts` (+ `ctx.runId`, `ctx.commitSha`, `ctx.analysisVersion` for the envelope). **NEVER references `ctx.graph.components`.** Sort facts via `compareFacts`; partition; build `files = sortedUnique([...jsx.file, ...attr.file])`; loop per file (S8 parity).
- [x] 2.9 `computeExceeded(file, fileJsx, fileAttrs)` per ADR-4 algorithm:
  - group `fileJsx` by `tag` into `Map<tag, element[]>`; iterate in sorted-tag order.
  - `if elements.length < 2: continue`.
  - per element, via `spanContains(el.span, a.span)` and `a.tag === tag`: add `el.id` to `elsWithVariant` if `VARIANT_PROPS.has(a.name)`, to `elsWithRaw` if `RAW_STYLE_PROPS.has(a.name)`.
  - `if elsWithVariant.size === 0 || elsWithRaw.size === 0: continue` (uniform → SILENT).
  - `variantWithoutRaw = some id in elsWithVariant not in elsWithRaw`; `rawWithoutVariant = some id in elsWithRaw not in elsWithVariant`; `if !(variantWithoutRaw || rawWithoutVariant): continue` (all-both → SILENT).
  - push `stylingVariantSurfaceDrift:${tag}:${file}`; return `sortedUnique(tokens)`.
- [x] 2.10 `severityFor(count) = count > 1 ? "warn" : "info"` (ADR-4).
- [x] 2.11 Evidence collection (ADR-5, sorted/unique):
  - `observedTags = sortedUnique(fileJsx.map(f => f.tag))`.
  - `divergentTags`: COLON-SAFE extraction — strip prefix `stylingVariantSurfaceDrift:` then strip the exact known suffix `":" + file` (`token.slice(prefix.length, token.length - (":" + file).length)`). Do NOT naive-split on `:` (file paths may contain colons). (Design §5 Decision + Risk row.)
  - `divergentVariantProps = sortedUnique(fileAttrs.filter(a => VARIANT_PROPS.has(a.name) && a.tag is divergent).map(a => a.name))`; analogous `divergentRawProps` for RAW_STYLE_PROPS.
- [x] 2.12 Subject `react:design-system-usage-surface:${file}`; `primarySpanFor` = lowest `span.start` among contributing facts (divergent-tag jsx + their tracked attrs), tie-break `compareFacts`; fallback `fileJsx[0].span` else synthetic `{file, start:0, end:0, kind:"jsx", astPath:""}` (ADR-5, S8 parity).
- [x] 2.13 Fingerprint triple (ADR-5):
  - `divergenceTypes = exceeded.map(t => t.slice(0, t.indexOf(":"))).filter(unique).sort()`.
  - `structural = sha(JSON.stringify({ ruleId, file, divergenceTypes, divergentTags, observedVariantProps: divergentVariantProps, observedRawProps: divergentRawProps }))`.
  - `nominal = sha(file)`; `positional = sha([file, primarySpan.start, primarySpan.end].join("|"))`.
- [x] 2.14 Finding envelope (S8 parity): `id = sha([ctx.runId, RULE_ID, file, structuralFp].join("|"))`, `type: "opportunity"`, `fpAlgoVersion: 1`, `producingRunId: ctx.runId`, `commitSha: ctx.commitSha`, `severityRaw`, `createdAt: 0`.
- [x] 2.15 `AdapterMetricEvidence`: `kind: "adapter-metric"`, `adapterId: "react"`, `ruleId`, `subject` (id/name=file/file/span=primarySpan/fingerprint=structuralFp), `roles = uniqueRoles(roles).sort(compareRoles)` (per-element `{role:"styled-element", variant:tag, file}`; per variant prop on divergent tag `{role:"variant-prop", variant:name, file}`; per raw prop `{role:"raw-style-prop", variant:name, file}`), `metrics` (candidateElements, divergentTagCount, divergenceSignals, observedTagCount, variantPropCount, rawPropCount), `thresholds {minUsagesForDrift:2, maxDivergenceSignals:0}`, `topology {directChildIds: sortedUnique(contributingJsxIds), reachableNodeIds: sortedUnique(contributingAttrIds), exceeded: [...exceeded].sort()}`.
- [x] 2.16 Return `findings.sort(compareFindings)`.
- [x] 2.17 Copy helpers from S8: `spanContains`, `compareFacts`, `compareRoles`, `compareFindings`, `uniqueRoles`, `sortedUnique`, `sha`.
- [x] 2.18 Explain hook `explainDesignSystemUsageSurfaceDrift(finding)` (ADR-6): return `null` unless `finding.ruleId === RULE_ID && finding.evidence.kind === "adapter-metric"`. Envelope: `summary`, `whyItMatters`, `inspectFirst`, `limits[]`, `groundingFields = Object.keys(evidence).sort()`, `glossary = groundingFields.map(explainTerm)`.
- [x] 2.19 **Explain wording — FORBIDDEN-SUBSTRING DISCIPLINE (CRITICAL, ADR-6).** The P11-S8 explain test regex is SUBSTRING-based over the serialized JSON — a banned token is forbidden EVEN INSIDE A NEGATION. The serialized explain (summary + whyItMatters + inspectFirst + limits) MUST NOT contain ANY of (case-insensitive):
  `bug`, `wrong`, `must refactor`, `must migrate`, `will conflict`, `runtime behavior`, `two libraries`, `React warning`, `you should`, `root cause`, `design system component`, `component library`, `themed`, `override`, `conflict`, `incorrect`, and avoid bare `runtime`, bare `library`/`libraries`.
  - Use the design §7 limit lines VERBATIM (already self-checked clean): "which package a component comes from", "what these props do when the app runs", "whether the observed difference is intended", spread-attr invisibility line, single-file/no-import-resolution line.
  - Use design §7 `summary`/`whyItMatters`/`inspectFirst` wording (already verified clean).
  - **Gate before finalizing**: mentally (and via Task 4 test) run the serialized JSON against the S8 regex AND the extended substring set (items 10–18). Reword any hit.
- [x] 2.20 Run `pnpm test` (adapter-react) → all Task 1 behavior tests GREEN.

Dependency: Task 1 (RED). Strict TDD gate.

---

## Task 3 — Register: exports + factory composition + ordered-list test

- [x] 3.1 `packages/adapter-react/src/index.ts`: append an export pair (AFTER the `OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID` block, BEFORE the `createReactCoreAnalyzers` re-export):
  ```ts
  export {
    DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
    createDesignSystemUsageSurfaceDriftAnalyzer,
  } from "./design-system-usage-surface-drift.js";
  ```
- [x] 3.2 `packages/adapter-react/src/core-adapter.ts`: add `+1` import line `import { createDesignSystemUsageSurfaceDriftAnalyzer } from "./design-system-usage-surface-drift.js"; // P11-S9` and `+1` array entry `createDesignSystemUsageSurfaceDriftAnalyzer(), // P11-S9` appended LAST in `createReactCoreAnalyzers()` (after `createOverlayControlSurfaceDriftAnalyzer(), // P11-S8`).
- [x] 3.3 `packages/adapter-react/src/core-adapter.test.ts`: import `DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID` and append `{ ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID, framework: "react" }` as the LAST entry of the `.toEqual([...])` ordered list in the "returns React analyzers with stable metadata" test (after the `OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID` entry).
- [x] 3.4 Run `pnpm test` → ordered-list test GREEN.

Dependency: Task 2 (analyzer + exports must exist).

---

## Task 4 — Explain test: bounded-language guarantee + null path

- [x] 4.1 In `design-system-usage-surface-drift.test.ts`, add an explain test mirroring S8 (lines 366-392):
  - Build a finding via `runFacts([...cross-usage...])`; call `analyzer.explain?.(presented(finding))`.
  - Assert `explanation` not null; `summary` is non-empty string; `groundingFields` equals its own sort; `glossary.length === groundingFields.length`; `limits` defined and length > 0.
  - `const serialized = JSON.stringify(explanation);`
  - `expect(serialized).not.toMatch(/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|runtime behavior|two libraries|React warning|you should|root cause/i);` (EXACT S8 regex — copy verbatim).
  - **Extended substring assertion** (design §10 case 15): `expect(serialized).not.toMatch(/design system component|component library|themed|override|conflict|incorrect|runtime|libraries?/i);`
- [x] 4.2 Add explain-null test: `analyzer.explain?.(presented({ ...finding, ruleId: "react/other" }))` → `null` (mirror S8 lines 394-404).
- [x] 4.3 Run `pnpm test` → explain tests GREEN.

Dependency: Task 2 (explain hook). May be authored in Task 1's file; this task confirms the assertions are present and pass.

---

## Task 5 — VERIFY GATE (run all; record exact counts)

- [x] 5.1 `pnpm test` → record new totals (file count + test count). Baseline pre-S9 is `52 files / 326 tests` (STATUS.md); S9 adds one new test file and ~20 tests + one new ordered-list entry. Record the exact post-run numbers for STATUS.md.
- [x] 5.2 `pnpm test:launcher` → pass.
- [x] 5.3 `pnpm typecheck` → clean (confirms no `ComponentNode` import, types align).
- [x] 5.4 `pnpm build` → clean.
- [x] 5.5 `node scripts/check-core-framework-free.mjs` (or `pnpm lint`) → core stays framework-free (confirms zero React rule logic / rule ids / VARIANT_PROPS catalog leaked into `@rai/core`).
- [x] 5.6 `git diff --check` → no whitespace errors.
- [x] 5.7 `git diff --stat packages/core` → **MUST be ZERO changed lines** (ADR / spec "NO `@rai/core` changes"). If non-zero, STOP and revert the core change.

Dependency: Tasks 2–4. Run before each commit boundary.

---

## Task 6 — Docs: STATUS.md + ROADMAP.md (mirror P11-S8 wording)

- [x] 6.1 `docs/STATUS.md`:
  - Update line 12 "Product state" to include P11-S9 (mirror the S8 wording, e.g. "P11-S1 through P11-S9").
  - Update line 13 "Next phase" → **P11-S10: API conventions (the last deferred React pattern family)**, or note "P11 nearing completion — broad API convention family remains". Resolve which during apply per ROADMAP wording.
  - Add a P11-S9 row to the "Completed phases" table (after the P11-S8 row, line 67), mirroring S8 prose: "Design-system usage surface drift slice: `react/design-system-usage-surface-drift` in `@rai/adapter-react`, detecting same-file JSX-usage-site cross-usage divergence between variant-style prop names (VARIANT_PROPS: variant/size/color/tone/intent/appearance) and raw-style prop names (RAW_STYLE_PROPS: className/style) on capitalized non-dotted component tags; cross-usage gate (>=2 usages, some variant + some raw, >=1 variant-only OR >=1 raw-only); reads only jsx/jsx-attribute facts; NEVER reads ctx.graph.components (non-overlap with P11-S3); no `@rai/core` changes."
  - Update the "Latest verified baseline" test-count line (`pnpm test # 52 files / 326 tests`) to the new totals recorded in Task 5.1.
- [x] 6.2 `docs/ROADMAP.md`: update the P11 section (line ~15 and the deferred-families note line ~113) to mark P11-S9 design-system usage as complete/implemented and set the next deferred family to broad API conventions (P11-S10).

Dependency: Task 5 (record exact test counts first).

---

## Task 7 — SPEC SYNC NOTE for ARCHIVE (not a commit; read at archive time)

- [x] 7.1 **The spec delta MODIFIES the "Deferred React Pattern Families Stay Scoped by Slice" requirement.** It copies all prior P11-S1..S8 prose VERBATIM and ADDS a P11-S9 clause + a new "P11-S9 design-system usage slice excludes other deferred families" scenario. Prior scenarios MUST NOT be dropped.
- [x] 7.2 **ARCHIVE MERGE TARGET**: the canonical spec is a DIRECTORY-form spec at `openspec/specs/react-pattern-analyzers/spec.md`, NOT a flat file. At archive, the ADDED requirements (3) are appended and the MODIFIED requirement REPLACES the existing one IN PLACE — preserving ALL prior P11-S1..S8 scenarios and adding P11-S9. Do NOT create a new flat spec file; do NOT drop prior slices' scenarios.
- [x] 7.3 Verify after merge: the canonical spec contains every prior slice scenario (P11-S4/S6/S7/S8 + Future analyzers) PLUS the new P11-S9 scenario, and the four ADDED P11-S9 requirements.

Dependency: archive phase (informational; no code/docs change in apply).

---

## Spec scenario → task coverage map

| Spec requirement / scenario | Covered by |
|------|------|
| Design-System Usage Surface Drift Detection (rule id, tag guard, sets, gate, bare-prop, token, exceeded) | Tasks 2.3–2.16; tests 1.3 (a)(b)(c-1)(c-2)(c-3)(d)(e)(f)(h)(j-1)(j-2) |
| Non-Overlap With Prop-Surface Drift (jsx/jsx-attribute only, never components/propNames, disjoint attrs) | Tasks 2.2 (no ComponentNode), 2.8 (no ctx.graph.components); tests 1.3 (g)(g-2) |
| Evidence, Groundability, Claim Boundaries (severity, observed-names-only, forbidden vocab, limits disclaimers) | Tasks 2.10, 2.15, 2.18–2.19; tests 1.3 (i)(i-2)(n), Task 4 |
| Determinism and Scope Boundaries (pure/sync, fingerprints, frozen, adapter-owned, no core change, no MCP tool) | Tasks 2.8–2.17, 3, 5.5, 5.7; tests 1.3 (k)(l)(m) |
| MODIFIED slice-scoping (+ P11-S9 scenario) | Task 7 (archive merge) |

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~560–640 (new analyzer ~290–330 src mirroring S8's 566-line file but lighter single-gate logic; new test file ~210–260; +3 wiring lines in index.ts/core-adapter.ts; +4 lines core-adapter.test.ts; +6–10 docs lines) |
| 400-line budget risk | **High** vs the repo DEFAULT 400-line budget; **Low** vs this run's explicit 800-line budget |
| Chained PRs recommended | **No** (≈600 fits comfortably under the 800-line budget for this run as a single PR) |
| Decision needed before apply | **No** — single PR under the active 800-line budget. HONEST FLAG: this exceeds the repo's standard 400-line default, so it is a deliberate `size:exception`-style single PR justified by the active 800 budget. If the maintainer reverts to the 400 default, split into Commit 1 (analyzer + test) as PR #1 and Commit 2–3 (wiring + docs) as a small follow-up. |

Work-unit commit plan (single PR, three commits) keeps reviewer cognitive load healthy:
1. `feat(adapter-react): add design-system usage surface drift analyzer` (Tasks 1–2: analyzer + tests).
2. `feat(adapter-react): register design-system usage surface drift analyzer` (Tasks 3–4: wiring + ordered-list + explain test).
3. `docs: record P11-S9 design-system usage surface drift` (Task 6).
