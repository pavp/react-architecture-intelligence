# RAI Status

This is the canonical project status after P9-S3 and P11-S4. Historical status in
`docs/superpowers/STATUS.md` remains useful for archaeology, but new sessions should start here.

## Current state

| Area | Status |
|------|--------|
| Branch | `main` is trunk/default; legacy `feat/rai-mvp-p0-p3` was deleted after the first successful release. |
| Repo | `https://github.com/pavp/react-architecture-intelligence` |
| Product state | P0–P11 complete plus P9-S3; P11 shipped 9 React pattern analyzer slices (S1–S9), all merged to `main`; P11-S10 (API conventions) deferred as ungroundable on syntax-only facts; first installable release `v0.1.3` published through GitHub Release, Homebrew tap, and Scoop bucket. P13-S1 (`rai calibrate` suggest-only) implemented. P13-S2 (evidence-correlated suggestions) implemented. P13-S3 (`rai calibrate --apply` guarded write) implemented. P13-S2.x (`maxFanOut` secondary calibrated knob) implemented and merged (PR #39). P14-S1 (`imports` graph edges) implemented and merged (PR #40). P14-S2 (`passes` graph edges) implemented and merged (PR #41). P14-S3 (`react/prop-drilling` analyzer) implemented and merged (PR #42). P14-S5 (`calls` graph edges) implemented and merged (PR #43). **P14 COMPLETE** (S4 exportKind killed as ungroundable). |
| Next phase | P16 safe code proposals (next priority — actionability on calibrated + deeper-graph findings). P12 CI/PR remains last. |
| Core boundary | `@rai/core` remains framework-agnostic |
| Next adapter | `@rai/adapter-next` loads through CLI composition, not core imports |
| MCP | `analyze_repo`, findings, diagnostics, additive explainability in `explain_finding`, `get_node`, drift/query/refactor tools active |

## Latest verified baseline

Latest release verification after P8:

```bash
pnpm release:check
pnpm test       # 52 files / 326 tests
pnpm typecheck
pnpm build
pnpm lint
git diff --check
gh release view v0.1.3 --repo pavp/react-architecture-intelligence
brew fetch pavp/tap/rai
brew install pavp/tap/rai
rai doctor . --json
```

Latest published release:

- `v0.1.3`: first successful installable release; GitHub Release published with darwin/linux/windows amd64/arm64 archives plus `checksums.txt`.
- Homebrew formula: `pavp/homebrew-tap/Formula/rai.rb` references `0.1.3` and passed `brew fetch pavp/tap/rai`.
- Scoop manifest: `pavp/scoop-bucket/rai.json` references `0.1.3`.
- Failed immutable tags retained for audit: `v0.1.0`, `v0.1.1`, `v0.1.2`.

Latest MCP compatibility fix:

- Commit `fdb7f7f fix(mcp): avoid tuple schema for get node`
- Reason: OpenCode rejected tuple JSON Schema for `rai_get_node.byteRange`.
- Fix: MCP input now uses `{ start, end }`; internal `getNode` still receives `[start, end]`.

## Completed phases

| Phase | Status | Summary |
|-------|--------|---------|
| P0–P3 | Complete | MVP parse → fingerprint → memory → core analyzers → MCP thin slice. |
| P4 | Complete | Breadth + temporal: snapshots, drift, graph tools, backfill, lazy type resolver, more analyzers. |
| P5 | Complete | Codemod proposal/apply safety pipeline, proof persistence, real git workspace adapter. |
| P6 | Complete | Next adapter: detection, variant guard, enrichment, client-boundary-bloat, route-coupling, CLI adapter loading. |
| P7 | Complete | Distribution + install: `rai install`, platform auto-detect, safe config/instruction writes, `rai doctor`, and near-term TypeScript CLI distribution decision. |
| P8 | Complete | Single-binary distribution: Go launcher prototype, release shape/governance, safe publish gates, and first installable `v0.1.3` release. |
| P9 | Complete | Explainability: deterministic explanation envelope, glossary, additive MCP `explain_finding`, `rai explain <file>`, README onboarding, and analyzer-owned human explanation hooks for high-quality adapter explanations. |
| P10 | Complete | React Pattern Intelligence Foundation: generic syntax facts, React catalog scaffold outside core, compound primitive fixtures, and OpenSpec specs. |
| P11-S1 | Complete | First React pattern analyzer slice: `react/compound-component-api-drift` in `@rai/adapter-react`, CLI/MCP adapter composition, drift terminology, and OpenSpec specs `react-pattern-analyzers`, `pattern-drift`, `cli-adapter-loading`. |
| P11-S2 | Complete | Container/presenter role-name divergence slice: `react/container-presenter-role-drift` in `@rai/adapter-react`, grounded in existing component names, file paths, direct render edges, and high-signal presenter hook calls. |
| P11-S3 | Complete | Controlled/uncontrolled prop-surface slice: `react/controlled-uncontrolled-prop-surface-drift` in `@rai/adapter-react`, grounded in observed component prop names with adapter-owned explanation. |
| P11-S4 | Complete | Framework-neutral pattern fact expansion: `call-binding`, `call-argument`, and `jsx-attribute` facts in `@rai/core`, with no new findings or React semantics in core. |
| P11-S5 | Implemented | Context provider value-surface drift slice: `react/context-provider-value-surface-drift` in `@rai/adapter-react`, the first analyzer to consume P11-S4 facts (`call-binding`, `call-argument`, `jsx`, `jsx-attribute`), correlating same-file `createContext` bindings with `<Local.Provider>` value surfaces; no React semantics added to `@rai/core`. |
| P11-S6 | Implemented | Form control surface drift slice: `react/form-control-surface-drift` in `@rai/adapter-react`, detecting same-file form submit-surface divergence (onSubmit + declarative action/method co-presence) and control-binding divergence (mixed controlled/uncontrolled attr pairs on same-type native elements); no `@rai/core` changes. |
| P11-S7 | Implemented | Data-fetching surface drift slice: `react/data-fetching-surface-drift` in `@rai/adapter-react`, detecting same-file co-presence of a raw-fetch `call` callee family (fetch/window.fetch/globalThis.fetch) and a query-hook `hook-call` family (useQuery/useSWR/useMutation and 8 more); query-hook discriminator is hook-call only (ADR-4); no `@rai/core` changes. |
| P11-S8 | Implemented | Overlay control surface drift slice: `react/overlay-control-surface-drift` in `@rai/adapter-react`, detecting same-file JSX-usage-site open-state divergence (open/defaultOpen on distinct overlay elements, Gate A cross-element via spanContains) and handler-name divergence (onOpenChange/onClose/onDismiss across distinct overlay elements, Gate B); reads only jsx/jsx-attribute facts; NEVER reads ctx.graph.components (non-overlap boundary with P11-S3); capitalized OVERLAY_TAGS allow-set (Dialog/Modal/Popover/Drawer/Sheet/Tooltip/AlertDialog/HoverCard/DropdownMenu/ContextMenu/Combobox/Select); no `@rai/core` changes. |
| P11-S9 | Implemented | Design-system usage surface drift slice: `react/design-system-usage-surface-drift` in `@rai/adapter-react`, detecting same-file JSX-usage-site styling-prop surface divergence across distinct usages of the same capitalized non-dotted tag — some usages carry variant-family props (VARIANT_PROPS: variant/size/color/tone/intent/appearance) and other usages carry raw-style props (RAW_STYLE_PROPS: className/style); per-tag cross-usage gate (>=2 usages, some hasVariant AND some hasRaw AND >=1 variant-only OR >=1 raw-only); reads only jsx/jsx-attribute facts; NEVER reads ctx.graph.components (non-overlap boundary with P11-S3); bare variant (valueKind absent) counts as present (OQ3); no `@rai/core` changes. |
| P13-S1 | Implemented | `rai calibrate` suggest-only command: `aggregateFeedback` (SELECT-only over T4 feedback_event), `computeSuggestions` (pure deterministic fn, CALIBRATABLE_RULES allowlist of 4 core rules), `loadProjectConfig` (reads `rai.config.json`, absent→{}, malformed→ProjectConfigError exit 2), config wired into 5 cli.ts resolveConfig({}) sites (analyze/explain/mcp/backfill/buildCliMcpServer); SUGGEST-ONLY guardrail (no config/T4 write); 48 new tests (8+18+8+14 across 4 test files). |
| P13-S2 | Implemented | Evidence-correlated calibration suggestions: `lookupRejectedEvidence(db, ruleId)` (T4→T3 join, SELECT-only), `computeSuggestionsWithEvidence` (pure fn, ceiling/floor arithmetic over observed breach metrics), CLI wiring in `runCalibrateCommand`; zero schema change, zero analyzer change; SUGGEST-ONLY + zero-write guardrail extended to cover T3 finding rows; 26 new tests (9+17 unit + CLI correlated + guardrail). |
| P14-S5 | Implemented | `calls` graph edges (PR #43, squash e0b42b6): `buildGraph` materializes `calls` edges (caller file → defining module) from `call`/`call-binding` facts, grounded by P14-S1 import resolution — `calls` was declared in EdgeKind but never built. `buildImportLocalMap`: per-file `Map<local,{moduleId,mode}>` from relative imports, `resolveImportTarget` memoized once per import fact. `resolveCallee`: exact local match mode-agnostic; namespace-prefix branch GATED to `mode==="namespace"` so a named import used as a member (`import {foo}; foo.bar()`) does NOT emit a spurious edge (already covered by the imports edge). Conservative exclusions (dynamic/computed callee, method on non-import, same-file, external non-relative), self-edge suppressed, minimal shape `{srcId,dstId,kind}`, dedup + deterministic via existing helpers. No type/MCP/DB/analyzer change (calls pre-existed in EdgeKind). 52 parse tests (C1–C14). Judgment-day APPROVED both judges (named-import member-callee false positive found R1 → namespace-gated + C12/C13/C14 → R2 clean). FINAL P14 slice — completes the edge model (renders + uses-hook + imports + passes + calls). |
| P14-S4 | Killed | `exportKind` predicate — exploration found exportKind already first-class in every groundable location (codemod proposal risk, boundary-violation node selector, layered fingerprint, evidence carry-through). Every candidate new use (gate/rank/filter shared-extraction by exportKind) was a noisy heuristic hurting recall (exportKind=none means safer-to-extract, not lower-value). Killed per trust-first / P11-S10 kill bar. No code. |
| P14-S3 | Implemented | `react/prop-drilling` analyzer (PR #42, squash d3c14b6): in `@rai/adapter-react`, FIRST consumer of P14-S2 `passes` edges. Depth-2 name-level prop pass-through — component B fires when an inbound passes edge and outbound passes edge share prop name P AND `B.propNames` includes P (triple intersection: inbound ∩ outbound ∩ propNames). Hardcoded `COMMON_PROP_NAMES` guard subtracts ubiquitous names (id/className/class/value/style/children/key/ref/name/type/disabled/onChange/onClick/onSubmit) — trust-first noise control; domain props survive. One `opportunity` finding per B (info 1 prop / warn 2+); adapter-metric evidence (no new kind) with sorted drilled props + upstream(A)/downstream(C) endpoint roles; 3-part SHA fingerprint whose structural key EXCLUDES A/C (endpoint churn does not re-key memory). Self-edge (src===dst) skipped. Adapter-owned explain hook states honest limits (name-level not value identity; cannot prove non-use; opportunity not bug). Pure sync over AnalysisContext; no core change, no new MCP tool, no new evidence kind; registered in createReactCoreAnalyzers. 16 analyzer tests (G1–G9). Spec merged into canonical react-pattern-analyzers/spec.md (with P11 siblings). Judgment-day APPROVED both judges, 0 critical (self-edge degenerate-finding found R1 → guarded + G9 regression → R2 clean). Third slice of P14. |
| P14-S2 | Implemented | `passes` graph edges (PR #41, squash d39629b): `buildGraph` materializes `passes` edges ("component A renders B passing prop P") from existing `jsx-attribute` PatternFacts — zero new extraction. Adds `"passes"` to `EdgeKind`; widens `GraphEdge` with optional `propNames?: string[]` (blast radius flat: all edge consumers key on `{kind,srcId,dstId}`, `edgeRef` drops extra fields, `freezeGraph` shape-agnostic, no DB edge table). Pass after renders loop: group jsx-attribute by `(file,tag)`, exclude `valueKind==="spread"`, dstId via `byName`, srcId via the single same-file component whose `childComponents` includes the tag (ambiguity guard skips 0 or >1 → precision over recall). propNames accumulated in `Map<srcId|dstId,Set>` and emitted as ONE sorted-unique edge per pair BEFORE `dedupeEdges` (which ignores propNames). Zero non-spread props → no edge; self suppressed; deterministic via `compareEdges`. Observable via existing MCP raw edges query (propNames transparent); framework-free core, no DB/MCP/analyzer change. 61 parse tests (P1–P9). Judgment-day APPROVED both judges, 0 critical (merge-before-dedupe independently verified). Second slice of P14. |
| P14-S1 | Implemented | `imports` graph edges (PR #40, squash 622bb5f): `buildGraph` materializes `imports` edges from already-collected `PatternImportFact` (EdgeKind was declared in types.ts but never built — every prior RepoGraph had zero import edges). `resolveImportTarget` relative-only (`./`,`../`), fs-free against in-memory module-id set, probe exact→`+[.ts,.tsx,.js,.jsx]`→`/index+ext`, file-beats-index; escaping-root guard returns null (no spurious re-anchor). External/unresolved → no edge, no throw. Reuses existing `dedupeEdges` (one edge per ordered pair) + `compareEdges`, self suppressed, cycles both emitted. Observable via existing MCP raw edges query — zero type/MCP change. Framework-free core, GraphEdge shape unchanged, no analyzer/codemod change. 46 parse tests. Judgment-day APPROVED (Round 1 found `..` over-pop bug → fixed + 4 regression tests → Round 2 clean). First slice of P14 deeper graph. |
| P13-S2.x | Implemented | `maxFanOut` secondary calibrated knob (PR #39, squash 74559cb): `lookupRejectedEvidenceRows` (paired `{fanIn,fanOut}` rows, additive — primary `lookupRejectedEvidence` byte-identical), `CALIBRATABLE_SECONDARY_RULES` (renderCoupling.maxFanOut/7, hookTopology.maxFanOut/5, cap 50), `computeSecondarySuggestions`/`computeApplicableSecondarySuggestions`; fanOut-dominant gate (fanOut breach count strictly > fanIn vs current thresholds, tie suppresses), loosen-only `min(max(fanOut),50)` emit only if `> current`, no severity fallback, idempotent apply; independent dual suggestions (maxFanIn + maxFanOut in one run, folded by existing `mergeSuggestionsIntoConfig`); Option A parallel structure; zero schema change, no analyzer change, framework-free core. 28 new tests (core 90 / CLI 35 green). Judgment-day APPROVED. |
| P13-S3 | Implemented | `rai calibrate --apply [--yes]` guarded write: `mergeSuggestionsIntoConfig` pure core helper (fs-free), `atomicWrite` exported from writers.ts, apply sub-flow in `runCalibrateCommand` (preview/noop/idempotent/written), `CalibrateResult.merged`+`.applied` fields, apply-mode banner in `formatCalibrateReport`; CRITICAL guards enforced (merge base = raw input, apply/yes default false, idempotence via canonical-serialized equality); 19 new tests (3 parseArgs + 7 apply scenarios + 2 json + 1 banner + existing 6 GUARDRAIL tests unchanged). Phase-G gate: 73 files / 615 tests. |

### P13-S2 Evidence-Correlated Calibration Suggestions

P13-S2 replaces the blind `current+1` formula with values derived from the actual breach metrics of rejected findings:

- `lookupRejectedEvidence(db, ruleId)` — T4→T3 join: selects distinct fingerprints with reject/wontfix/dismiss verdicts, resolves each to its current `finding` row via `FindingsStore.currentVersion`, extracts the primary breach metric per rule (render-coupling/hook-topology→`fanIn`; over-abstraction→`propCount`; shared-extraction→`instances.length`).
- `computeSuggestionsWithEvidence(stats, currentConfig, evidenceByRule)` — pure deterministic fn; ceiling rules (render-coupling, over-abstraction, hook-topology): `newValue = min(max(values), 50)`; floor rule (shared-extraction): `newValue = min(max(values)+1, 50)`; if `newValue > current` → correlated suggestion citing observed max + rejected count; else falls back to generic `current+1`.
- CLI wiring: `runCalibrateCommand` builds `evidenceByRule` map then calls `computeSuggestionsWithEvidence` in place of `computeSuggestions`.
- SUGGEST-ONLY invariant maintained: zero writes; guardrail extended to assert `finding` row count unchanged after calibrate with T3+T4 seeded.
- New exports: `lookupRejectedEvidence`, `computeSuggestionsWithEvidence`.
- Zero schema change, zero analyzer change.

### P13-S3 `rai calibrate --apply` Guarded Write

P13-S3 adds the guarded opt-in write path to the calibrate command:

- `rai calibrate --apply` — dry-run: computes merged config, prints preview of what would be written, exits 0, writes nothing.
- `rai calibrate --apply --yes` — atomically writes merged `rai.config.json` via temp-file+rename. Validates merged via `ConfigSchema.partial()`. Idempotent: skips write if canonical-serialized equality already holds.
- `mergeSuggestionsIntoConfig(existing, suggestions)` — pure core helper in `packages/core/src/calibration/merge.ts`. Merge base is raw `RaiConfigInput` (NOT the defaulted config). Exported via `packages/core/src/index.ts`. Zero fs/React imports.
- `atomicWrite` exported from `packages/cli/src/install/writers.ts` (one-word change).
- `CalibrateResult` gains `merged?: RaiConfigInput` and `applied?: "preview"|"written"|"noop"|"idempotent"`.
- Apply/yes flags default to `false` — CRITICAL: preserves suggest-only guardrail for default no-flag path.
- 6 existing GUARDRAIL tests unchanged.
- Zero schema change, zero analyzer change.

Latest P13-S3 verification:

```bash
pnpm test       # 73 files / 615 tests (all green)
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
node scripts/check-core-framework-free.mjs  # exit 0 (merge.ts: zero react/fs imports)
git diff --check  # clean
# New files: merge.ts, merge.test.ts (core)
# Modified: cli.ts, cli.calibrate.test.ts, index.ts, writers.ts (export atomicWrite), docs
# No changes: config/schema.ts, analyzers, db schema, doctor.ts
```

Latest P13-S2 verification:

```bash
pnpm test       # 72 files / 595 tests
pnpm test:launcher  # Go launcher tests ok
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
node scripts/check-core-framework-free.mjs  # exit 0 (evidence-lookup + suggest: zero framework/fs imports)
git diff --check  # clean
# New files: evidence-lookup.ts, evidence-lookup.test.ts, suggest-evidence.test.ts (core)
# Modified: suggest.ts (extracted buildGenericSuggestion helper + computeSuggestionsWithEvidence), cli.ts, cli.calibrate.test.ts, index.ts
# No changes: analyzers, config schema, db schema, doctor.ts
```

### P13-S1 `rai calibrate` Suggest-Only

P13-S1 closes the noise-feedback loop:

- `rai calibrate [dir] [--json] [--db <path>]` aggregates T4 `feedback_event` rows per rule, computes threshold-raise or severity-downgrade suggestions, prints a stats table + copy-paste JSON patch block.
- SUGGEST-ONLY: never writes `rai.config.json`, never inserts/updates/deletes feedback rows.
- Project config loading: place `rai.config.json` at project root to override thresholds; 5 cli.ts `resolveConfig({})` sites now load it (analyze/explain/mcp/backfill/buildCliMcpServer). Doctor's synthetic health probes intentionally excluded (D6).
- `rai.config.json` convention: valid `ConfigSchema.partial()` JSON at project root; absent → uses all defaults (backward-compatible).
- New exports from `@rai/core`: `ConfigSchema`, `RaiConfig`, `RaiConfigInput`, `aggregateFeedback`, `RuleFeedbackStats`, `computeSuggestions`, `CalibrationSuggestion`, `CALIBRATABLE_RULES`, `MIN_EVENTS`, `MIN_NEGATIVE_RATE`, `openDb`, `Db`.

Latest P13-S1 verification:

```bash
pnpm test       # 70 files / 564 tests
pnpm test:launcher  # Go launcher tests ok
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
node scripts/check-core-framework-free.mjs  # exit 0 (feedback-aggregate + suggest: zero framework/fs imports)
git diff --check  # clean
# New files: feedback-aggregate.ts, suggest.ts (core), project-config.ts, cli.calibrate.test.ts (cli)
# Modified: cli.ts, index.ts
# No changes: analyzers, config schema, db schema, doctor.ts
```

### P11-S9 Design-System Usage Surface Drift

P11-S9 adds `react/design-system-usage-surface-drift` in `@rai/adapter-react`, the fifth analyzer slice to consume P11-S4 framework-neutral jsx/jsx-attribute facts:

- Detects same-file JSX-usage-site styling prop surface divergence across distinct usages of the same capitalized non-dotted tag: some usages carry variant-family prop names (`VARIANT_PROPS`: variant, size, color, tone, intent, appearance) and other usages carry raw-style prop names (`RAW_STYLE_PROPS`: className, style).
- Per-tag cross-usage gate: requires >=2 distinct JSX usages of the same tag; fires when some usage hasVariant AND some usage hasRaw AND (>=1 variant-only usage OR >=1 raw-only usage). A single element with both, or all elements with both, is SILENT.
- Tag guard (case-sensitive): first char uppercase letter AND `!tag.includes(".")`. Lowercase native tags (button/div) NOT matched (S6 domain). Dotted member tags (Modal.Trigger) NOT matched (S1 domain).
- Bare variant prop (valueKind absent) counts as present (OQ3) — consistent with S8 bare-open precedent.
- Token per divergent tag: `stylingVariantSurfaceDrift:{tag}:{file}`. Prop-set additions require future calibration (OQ4).
- Reads ONLY jsx/jsx-attribute patternFacts. NEVER reads ctx.graph.components (non-overlap boundary with P11-S3 enforced by no ComponentNode import and no graph.components access).
- `info`/`warn` severity by divergence count (1 tag → info; >1 tags → warn), stable SHA fingerprints (structural/nominal/positional), sorted+frozen evidence, adapter-owned bounded explanation hook; no new MCP tool and no `@rai/core` changes.

Latest P11-S9 verification:

```bash
pnpm test packages/adapter-react/src/design-system-usage-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts  # 2 files / 33 tests
pnpm test       # 66 Vitest files / 516 tests
pnpm test:launcher  # Go launcher tests ok
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
node scripts/check-core-framework-free.mjs  # core framework-free guard pass (exit 0)
git diff --check  # clean
git diff --stat packages/core  # empty (zero core changes)
```

## P7 distribution + install

P7 adds adoption tooling without changing the `@rai/core` boundary:

- `rai install` supports `opencode`, `claude-code`, `codex`, and `copilot` with auto-detect or `--platform` overrides.
- Installer supports `--dry-run`, `--yes`, and `--no-instructions`; writes require explicit consent unless dry-run is used.
- JSON MCP configs merge `mcp.rai` while preserving unknown keys; TOML replaces only `[mcp_servers.rai]`.
- Instruction files use `<!-- RAI:BEGIN -->` / `<!-- RAI:END -->` marker ownership and preserve user content outside markers.
- `rai doctor` reports runtime, project root, CLI build, native SQLite/vector readiness, MCP config validity, MCP server construction, and config write suitability.
- Distribution decision: keep near-term CLI in TypeScript, plan prebuilt native bindings next, defer Go wrapper and WASM SQLite/vector to later distribution work.

## P6 real-project smoke

Target: `/Users/macbook/Documents/github/scaffold-nextjs-app`

Result through RAI MCP:

- 21 active opportunities
- 0 conflicts
- 0 suppressed
- 0 engine diagnostics
- severity split: 1 error, 6 warn, 14 info
- top direct duplication: `react/shared-extraction` in `common-grid` family

This validated:

- CLI analysis on a real Next app
- MCP server startup in OpenCode
- `analyze_repo`
- `explain_finding`
- `get_node`
- Next adapter loading without core framework coupling

## Current roadmap

See [`docs/ROADMAP.md`](./ROADMAP.md).

Immediate next work: P11-S7 (`react/data-fetching-surface-drift`) is implemented; pick the next deferred React family (overlays, design-system usage, or API conventions) as an adapter-owned slice that consumes P11-S4 expanded facts. Release publishing remains manual: create a new `vX.Y.Z`/`vX.Y.Z-rc.N` tag from `main` only after checks and maintainer approval.

## P11 React Pattern Analyzers + Pattern Drift

P11 now has six concrete React pattern analyzer slices plus one framework-neutral fact-expansion slice on top of P10 pattern facts, without moving React semantics into `@rai/core`.

### P11-S7 Data-Fetching Surface Drift

P11-S7 adds `react/data-fetching-surface-drift` in `@rai/adapter-react`, the third analyzer slice to consume P11-S4 framework-neutral facts:

- Detects same-file co-presence of a raw-fetch `call` callee family (`fetch`, `window.fetch`, `globalThis.fetch`) and a query-hook `hook-call` family (11 names: `useQuery`, `useLazyQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `useSWR`, `useInfiniteSWR`, `useSWRInfinite`, `useSWRMutation`, `useApolloQuery`, `useLazyApolloQuery`).
- Query-hook discriminator is `hook-call` only (ADR-4): `const { data } = useQuery()` produces a `hook-call` but NOT a `call-binding` (ObjectPattern); the analyzer detects it correctly via the hook-call signal alone.
- `axios.get` and other non-fetch callees are excluded; `useEffect`/`useState` are not in `QUERY_HOOK_NAMES` and are silent.
- Per-file co-presence gate; cross-file co-presence is silent. One finding per qualifying file, severity always `info`, divergenceCount always 1.
- `info`/`warn` severity by divergence count (always `info`), stable SHA fingerprints (structural/nominal/positional), sorted+frozen evidence, adapter-owned bounded explanation hook; no new MCP tool and no `@rai/core` changes.

Latest P11-S7 verification:

```bash
pnpm test packages/adapter-react/src/data-fetching-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts  # 2 files / 27 tests
pnpm test       # 64 Vitest files / 465 tests
pnpm test:launcher  # Go launcher tests ok
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
node scripts/check-core-framework-free.mjs  # core framework-free guard pass (exit 0)
git diff --check  # clean
git diff --stat packages/core  # empty (zero core changes)
```

### P11-S6 Form Control Surface Drift

P11-S6 adds `react/form-control-surface-drift` in `@rai/adapter-react`, the second analyzer slice to consume P11-S4 framework-neutral facts:

- Detects two signal families in the same file: (1) form submit-surface divergence — a `<form>` with `onSubmit` (non-absent valueKind) and any `<form>` with `action` or `method` co-present across the file; (2) control-binding divergence — same-type native elements (`input`, `select`, `textarea`) using both a controlled attr (`value`/`checked`) and its matching uncontrolled counterpart (`defaultValue`/`defaultChecked`).
- Native lowercase tags only (`form`, `input`, `select`, `textarea`); capitalized custom component tags are excluded.
- `CONTROL_BINDING_PAIRS` carries a per-pair tags allow-set so HTML-impossible pairings (e.g. `select:checked`) are not reported.
- `type=hidden`/`type=submit` are not excluded (OQ4 deferred, documented in limits); all `action` attr occurrences count as one submit surface regardless of valueKind including React 19 `action={fn}` (OQ5, documented).
- `info`/`warn` severity by divergence count, stable SHA fingerprints (structural/nominal/positional), sorted+frozen evidence, adapter-owned bounded explanation hook; no new MCP tool and no `@rai/core` changes.

Latest P11-S6 verification:

```bash
pnpm test packages/adapter-react/src/form-control-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts  # 2 files / 30 tests
pnpm test       # 63 Vitest files / 438 tests
pnpm test:launcher  # Go launcher tests ok
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
node scripts/check-core-framework-free.mjs  # core framework-free guard pass (exit 0)
git diff --check  # clean
```

### P11-S5 Context Provider Value-Surface Drift

P11-S5 adds `react/context-provider-value-surface-drift` in `@rai/adapter-react`, the first analyzer slice to consume the P11-S4 framework-neutral facts:

- Correlates same-file local `createContext`/`*.createContext` `call-binding` facts with `<Local.Provider>` `jsx` occurrences by `(file, localName)` only — no cross-file or import/type resolution.
- Classifies each provider value-attribute surface as `direct-value`, `direct-value-with-spread`, `spread-ambiguous`, or `missing-direct-value` from observed `jsx-attribute` facts; `value` with `valueKind: "absent"` still counts as a direct surface.
- Emits `type: "opportunity"` findings only on observed same-file value-surface divergence: missing direct value with no observed `createContext` default argument, mixed provider direct-value presence, and/or spread-ambiguous value surfaces.
- `useContext(...)`/`use(...)` evidence is optional corroboration only and never changes emission/suppression.
- Stays silent for no-provider bindings, cross-file name matches, consistent direct-value surfaces, and same-file `(file, localName)` binding collisions (lexical scope cannot be disambiguated from current facts).
- Deterministic `info`/`warn` severity by divergence-count, stable SHA fingerprints, sorted evidence, adapter-owned explanation with bounded current-source limits; no new MCP tool and no `@rai/core` React semantics.

Latest P11-S5 verification:

```bash
pnpm test packages/adapter-react/src/context-provider-value-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts packages/adapter-react/src/catalog.test.ts  # 3 files / 26 tests
pnpm test       # 62 Vitest files / 416 tests
pnpm test:launcher  # Go launcher tests ok
pnpm typecheck  # all packages Done
pnpm build      # all packages Done
pnpm lint       # core framework-free guard pass
git diff --check  # clean
```

### P11-S4 Framework-Neutral Pattern Fact Expansion

P11-S4 expands generic pattern facts for future adapter-owned analyzers:

- `@rai/core` now records `call-binding`, `call-argument`, and `jsx-attribute` facts in `RepoGraph.patternFacts`.
- The facts are syntax-only: local call bindings, call arguments, and JSX attributes with bounded value/argument kinds.
- P11-S4 emits no new findings, adds no new React rule id, and does not change evidence, fingerprint, MCP, persistence, snapshot, feedback, or memory contracts.
- React interpretation remains adapter-owned; provider/context, forms, overlays, data-fetching, design-system usage, and API-convention findings remain deferred to later P11 slices.
- The expanded facts unlock stronger future grounding for provider/context (`createContext`, `useContext`, provider `value`), forms (`onSubmit`, `method`, `value`), overlays (`open`, `onOpenChange`), and data/API calls.

Latest P11-S4 verification:

```bash
pnpm test packages/core/src/parse/pass1.test.ts packages/core/src/parse/graph-build.test.ts packages/adapter-react/src/catalog.test.ts  # 3 files / 29 tests
pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts  # 4 files / 35 tests
pnpm test && pnpm test:launcher  # 61 Vitest files / 399 tests plus Go launcher tests
pnpm typecheck
pnpm build
rtk proxy pnpm lint
./scripts/smoke.sh --build  # 19 checks
git diff --check
```

### P11-S3 Controlled/Uncontrolled Prop-Surface Drift

P11-S3 adds the third adapter-owned React analyzer:

- `@rai/adapter-react` now also ships `react/controlled-uncontrolled-prop-surface-drift`.
- The analyzer reports only observed current-source prop-surface drift: a component exposes approved controlled/default prop-name pairs for the same state slot.
- Initial approved pairs are `value/defaultValue`, `checked/defaultChecked`, and `open/defaultOpen`.
- Evidence is grounded in existing graph facts: component `propNames`, optional handler props, optional `useState`/`useReducer` hook calls, component file/span, and stable SHA fingerprints.
- Finding and explanation language remain bounded to observed prop names. They do not claim runtime controlled behavior, React warnings, bugs, team intent, root cause, user impact, or required remediation.
- Implementation stays in `packages/adapter-react`; `@rai/core` remains framework-agnostic and no provider/context, forms, data-fetching, design-system, overlay, or broad API-convention findings are emitted.

Latest P11-S3 verification:

```bash
pnpm test packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts  # 2 files / 15 tests
pnpm test packages/adapter-react/src/compound-component-api-drift.test.ts packages/adapter-react/src/container-presenter-role-drift.test.ts packages/adapter-react/src/controlled-uncontrolled-prop-surface-drift.test.ts packages/adapter-react/src/core-adapter.test.ts  # 4 files / 35 tests
pnpm test && pnpm test:launcher  # 61 Vitest files / 396 tests plus Go launcher tests
pnpm typecheck
pnpm build
rtk proxy pnpm lint
./scripts/smoke.sh --build  # 19 checks

git diff --check
```

### P11-S2 Container/Presenter Role Divergence

P11-S2 adds the second adapter-owned React analyzer:

- `@rai/adapter-react` now also ships `react/container-presenter-role-drift`.
- The analyzer reports only observed current-source container/presenter role-name and syntax divergence: a container-like component directly renders a presenter-like component, and the presenter-like component has high-signal hook evidence.
- Evidence is grounded in existing graph facts: component names, file/path role seeds, direct `renders` edges, presenter `hookCalls`, hook-call spans when available, and stable SHA fingerprints.
- Finding language remains bounded to observed role-name/syntax divergence. It does not claim wrong architecture, team intent, root cause, historical change, or required remediation.
- Implementation stays in `packages/adapter-react`; `@rai/core` remains framework-agnostic and no provider/context, controlled/uncontrolled, forms, data-fetching, design-system, overlay, or broad API-convention findings are emitted.

Latest P11-S2 verification:

```bash
pnpm test       # 60 files / 380 tests
pnpm test:launcher
pnpm typecheck
pnpm build
rtk proxy pnpm lint
./scripts/smoke.sh --build  # includes human-readable react/container-presenter-role-drift CLI smoke
git diff --check
```

### P11-S1 Compound Component API Drift

P11-S1 delivers the first concrete React pattern analyzer on top of P10 pattern facts, without changing the `@rai/core` boundary:

- `@rai/adapter-react` ships `react/compound-component-api-drift`, which detects compound-component API divergence from grounded `RepoGraph.patternFacts` syntax evidence.
- The analyzer is pure and deterministic: it reads pattern facts, sorts/freezes evidence, uses stable SHA fingerprints, and performs no fs/network/memory/config/clock/random/LLM writes.
- CLI/MCP composition loads the React adapter through the same registry factory as the Next adapter, so `analyze_repo`, findings, and diagnostics see the React findings without core framework coupling and without a new MCP drift tool.
- Drift terminology stays distinct: current-source findings use repo-local divergence wording; historical change wording stays in existing `get_drift` snapshot results.
- OpenSpec specs added/updated: `react-pattern-analyzers`, `pattern-drift`, and `cli-adapter-loading`.
- Deferred to later P11 slices (no findings emitted yet): provider/context, controlled/uncontrolled, forms, data fetching, design-system usage, overlays beyond compound primitives, and broad API conventions.
- Deferred PR3 follow-ups (optional, non-blocking): backfill/snapshot/`get_drift` parity test coverage and `rai explain <file>` / file-ref parity test coverage.

Latest P11-S1 verification:

```bash
pnpm test       # 59 files / 365 tests
pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## P10 React Pattern Intelligence Foundation

P10 adds deterministic foundation facts for later React pattern analyzers without adding findings yet:

- `RepoGraph.patternFacts` carries sorted/deduped/frozen syntax facts.
- Core extracts imports, exports, calls, hook-like calls, JSX parent/child tags, member assignments, and file-role seeds.
- `@rai/core` remains framework-agnostic: facts describe syntax only and do not include React catalog names or intent claims.
- `packages/adapter-react` holds React catalog scaffolding outside core and currently emits no findings or memory writes.
- Modal/Popover fixtures cover compound primitive syntax evidence for future analyzers.
- OpenSpec specs added: `pattern-fact-extraction` and `react-pattern-catalog`.

Latest P10 verification:

```bash
pnpm test       # 57 files / 351 tests
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

## P9 explainability

P9 makes existing RAI facts easier to understand without changing analyzer truth:

- Core explainability helpers derive bounded summaries, inspect-first guidance, limits, grounding fields, and glossary entries from existing findings.
- MCP `explain_finding` returns raw finding data plus an additive `explanation` envelope.
- CLI `rai explain <file>` shows relevant findings for a file in human-readable output, with JSON support following existing CLI conventions.
- P9-S2 adds an analyzer-owned explanation hook so adapters can provide high-quality human wording without moving adapter semantics into `@rai/core`.
- P9-S3 upgrades current analyzer explanations across `rai explain` and MCP `explain_finding`: known core evidence kinds now lead with observed code facts, and adapter-owned hooks cover `react/compound-component-api-drift`, `react/container-presenter-role-drift`, `next/client-boundary-bloat`, and `next/route-coupling`.
- Deferred explainability cleanup: broad `doctor`, `install`, `backfill`, CLI usage/error, MCP tool description, and README copy audits.
- Root `README.md` gives new users a quick path: install, doctor, analyze, explain, reading guide, glossary, limits, and next step.
- Guardrail: human-facing presentation explains facts; machine-facing JSON/raw evidence stays stable and structured; presentation does not infer intent, ownership, root cause, or remediation not present in evidence.

Latest P9/P11 explainability verification:

```bash
pnpm test       # 60 files / 386 tests
pnpm test:launcher
pnpm typecheck
pnpm build
rtk proxy pnpm lint
./scripts/smoke.sh --build
git diff --check
```

## P8 single-binary distribution

P8-S1 adds a local Go launcher prototype without changing analyzer truth:

- `cmd/rai` is the Go entrypoint; `internal/launcher` resolves dev/archive engine assets and delegates to `node packages/cli/dist/index.js`.
- Delegated commands preserve argv, stdout/stderr passthrough, MCP stdout cleanliness, and child exit codes.
- `rai version` is Go-owned and reports launcher/engine/runtime/platform metadata.
- Archive mode validates `lib/rai/metadata.json` asset schema and platform before starting the TypeScript engine.
- Local scripts: `pnpm build:launcher`, `pnpm test:launcher`, and `scripts/smoke-launcher.sh`.
- P8-S2 adds dry-run release shape only: `.goreleaser.yaml`, `pnpm release:check`, `pnpm release:prepare`, `scripts/install-rai.sh`, and `docs/release-maintainer-checklist.md`.
- P8-S3a adds `docs/repository-workflow.md` plus read-only release checks for `main` trunk/default branch target, retirement of legacy `feat/rai-mvp-p0-p3` after P8, branch naming, Conventional Commit commit/PR titles, PR template use, stable `vX.Y.Z` tags, optional `vX.Y.Z-rc.N` tags, immutable published tags, rollback through new patch/prerelease tags, and manual maintainer gates.
- P8-S3c adds commitlint conventional defaults, flexible scopes, `pnpm lint:pr-title`, and PR-title CI on `pull_request` `opened`, `edited`, `synchronize`, and `reopened` events.
- GoReleaser/manual `vX.Y.Z` tags remain release authority; `semantic-release`, branch/default/tag mutation, and mandatory local hooks remain out of scope.
- P8-S3b replaces GoReleaser Homebrew/Scoop placeholders with real channel repo names `pavp/homebrew-tap` and `pavp/scoop-bucket`, adds read-only publish readiness validation, and adds a manual `workflow_dispatch` release preflight that runs GoReleaser snapshot with `--skip=publish`.
- GoReleaser publishing is enabled in config but guarded by release workflow tag regex, `origin/main` ancestry, exact secrets, `pnpm release:check`, tests, typecheck, build, and GoReleaser-owned release asset preparation.
- `v0.1.3` is the first successful real release. It generated GitHub Release assets, `pavp/homebrew-tap/Formula/rai.rb`, and `pavp/scoop-bucket/rai.json`.
- Homebrew install was verified locally with `brew install pavp/tap/rai`; installed `rai doctor . --json` passed.
- Failed tags `v0.1.0`, `v0.1.1`, and `v0.1.2` are immutable audit history and must not be moved or reused.

## Active guardrails

- Code is source of truth.
- Config tunes behavior.
- Findings are immutable/append-only.
- Memory changes only through explicit feedback tools.
- LLMs narrate; they must not invent findings or write implicit feedback.
- `packages/core` must stay framework-agnostic.
- Adapter code belongs outside core.
- Keep changes reviewable; split work above 400 changed lines unless user accepts exception.

## Useful commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
git status --short
```
