# RAI Roadmap

This is the canonical roadmap after P9-S3 and P11-S4. Older roadmap notes in `docs/superpowers/`,
`docs/gaps.md`, and `docs/future-ideas.md` are historical inputs unless this file links
them as active work.

## Active priority order

Reprioritized 2026-06-07 on a **trust-first** principle: a findings engine lives or dies on
signal-to-noise, and every downstream surface (proposals, reporting, CI) inherits the quality of the
findings it sits on. So calibration leads, the graph substrate comes next, then acting on findings,
then scaling/presenting them. CI/PR integration is intentionally LAST — it has high reach but only
*broadcasts* whatever quality the findings already have; broadcasting noise erodes trust faster than
not broadcasting at all. The phase numbers (P12–P20) are stable identifiers; the rows below are listed
in execution priority, not numeric order.

| Order | Phase | Name | What it adds | Why here |
|-------|-------|------|--------------|----------|
| 1 | P13 | Calibration | **P13-S1 done** (`rai calibrate` suggest-only, `rai.config.json` loading). **P13-S2 done** (evidence-correlated suggestions: T4→T3 join, ceiling/floor arithmetic over observed breach metrics). **P13-S3 done** (`rai calibrate --apply [--yes]` guarded write: pure merge helper, atomic write, idempotence via canonical equality). **P13-S2.x done** (`maxFanOut` secondary calibrated knob for render-coupling + hook-topology: fanOut-dominant gate, loosen-only, independent dual suggestions; PR #39). Calibration coverage closed. Next: **P14**. | Trust. Kills noise first; every later phase inherits this quality. |
| 2 | P14 | Deeper graph | **COMPLETE.** S1 `imports` edges (#40), S2 `passes` edges (#41), S3 `react/prop-drilling` analyzer (#42), S5 `calls` edges (#43). S4 `exportKind` predicate KILLED (already first-class everywhere groundable; any new use a noisy heuristic — same kill bar as P11-S10). The graph now carries renders + uses-hook + imports + passes + calls edges. | Substrate. Richer model that more/better analyses and proposals stand on. |
| 3 | P16 | Safe code proposals | **P16-S1 done** — `react/prop-drilling` preview-only proposal: `PreviewProposal` type + `ProposalBuilder` interface + dispatch seam in core; pure `buildPropDrillingProposalBuilder` builder in adapter-react; CLI composition root wires `proposalBuilders`; preview-only enforced type-level (79 test files / 764 tests). Next: P16-S2 apply-path (requires apply pipeline extension for prop-drilling). | Actionability — findings→fixes, the biggest user leap. Safe only on calibrated findings (P13) + deeper graph (P14). |
| 4 | P15 | Team memory | Shares decisions across developers: committable/importable T4/T5 feedback and “already decided” UX. | Multiplier on calibration — turns one dev's tuning into shared team memory. Needs P13 feedback to be valuable. |
| 5 | P17 | Always-fresh analysis | Keeps findings current without manual `rai analyze`: watch mode, hooks, and incremental local analysis. | Convenience/freshness layer over existing intelligence. Non-blocking. |
| 6 | P18 | Architecture reporting | Leadership/reporting views: sprint digest, architecture changelog, and onboarding reports. | Presentation for leads/onboarding. Value depends on findings being trustworthy (P13) and rich (P14). |
| 7 | P12 | CI/PR integration | Brings RAI into review: `rai check --diff`, GitHub PR comments, and net-new findings only. | Reach, but it amplifies whatever quality exists — deferred to last so it broadcasts trusted signal, not debt. Planning for P12-S1 (`rai check --diff`) is parked (see note below). |
| 8 | P19 | Go Runtime / Engine Parity | Migrating runtime/storage/intelligence pieces to Go only behind golden parity, so results stay identical before any engine replacement. | Pure infrastructure — zero new user value, high risk. Only when scale demands it. |
| 9 | P20 | Advanced intelligence | Longer-term: learned embeddings, consequence-aware prioritization, and cross-repo architectural memory. | Research/frontier. Speculative; depends on everything below being mature. |

### Completed phases

| Phase | Name | What it added |
|-------|------|---------------|
| P7 | Distribution + install | Complete: `rai install`, platform auto-detect, MCP config, agent instructions, `rai doctor`, and native dependency / Go CLI distribution decision. |
| P8 | Single-binary distribution | Complete: P8-S1 local Go launcher prototype, P8-S2 release shape, P8-S3a repository workflow/tag/naming policy, P8-S3c governance automation, P8-S3b safe publish gates, release activation, and first installable `v0.1.3` release. |
| P9 | Explainability | Complete through P9-S3: deterministic human output, glossary for evidence terms, additive `explain_finding`, `rai explain <file>`, README onboarding, analyzer-owned human explanation hooks, and current analyzer human explanation coverage. |
| P10 | React Pattern Intelligence Foundation | Complete: generic pattern fact extraction for imports, exports, calls, hooks, JSX structure, static members, file roles, and a React catalog scaffold outside core. |
| P11 | React Pattern Analyzers + Pattern Drift | Complete (9 slices shipped). P11-S1: `react/compound-component-api-drift`; P11-S2: `react/container-presenter-role-drift`; P11-S3: `react/controlled-uncontrolled-prop-surface-drift`; P11-S4: framework-neutral `call-binding`, `call-argument`, and `jsx-attribute` facts; P11-S5: `react/context-provider-value-surface-drift`; P11-S6: `react/form-control-surface-drift`; P11-S7: `react/data-fetching-surface-drift`; P11-S8: `react/overlay-control-surface-drift`; P11-S9: `react/design-system-usage-surface-drift`. P11-S10 (broad API conventions) DEFERRED — kill-switch exploration found no signal meeting the S6-S9 groundability bar (convention divergence needs a reference convention = semantic/import knowledge unavailable from syntax-only facts; no closed token vocabulary). The groundable React API divergence surface is fully covered by S1–S9. Revisit only if a stable closed-vocabulary signal emerges. |
| P13-S1 | rai calibrate (suggest-only) | Shipped. `rai calibrate [dir] [--json] [--db <path>]` suggests config patches from feedback history without writing anything. `rai.config.json` at project root now loaded by all 5 cli.ts analyze/explain/mcp/backfill/buildCliMcpServer sites. SUGGEST-ONLY guardrail enforced. Usage: `rai calibrate [dir]` (human table + copy-paste patch) or `rai calibrate [dir] --json` (machine-readable {rules, suggestions, currentConfig, configFile}). Config convention: create `rai.config.json` at project root with a valid `ConfigSchema.partial()` JSON object to override any threshold. |
| P13-S2 | Evidence-correlated calibration suggestions | Shipped. `lookupRejectedEvidence(db, ruleId)` joins T4 negative verdicts to T3 finding evidence (SELECT-only). `computeSuggestionsWithEvidence` uses observed breach metrics (ceiling: `min(max, 50)`; floor shared-extraction: `min(max+1, 50)`) instead of blind `current+1`; falls back to generic when evidence absent or `newValue <= current`. CLI `runCalibrateCommand` wired to evidence path. SUGGEST-ONLY guardrail extended: finding row count asserted unchanged. Zero schema change. |
| P16-S1 | Prop-drilling preview-only proposal | Implemented (branch `feat/p16-prop-drilling-preview-proposal`). `PreviewProposal` type (status/kind/ruleId/subject/observations/consider/limits/writeMode) + `ProposalBuilder` interface + `ProposalBuilderInput` in `packages/core/src/codemod/proposal.ts`. `SessionOpts.proposalBuilders?: ProposalBuilder[]` + dispatch seam in `Session.proposeRefactor`: shared-extraction first (unchanged), then builder lookup by ruleId, no-builder → unsupported-rule refusal. Limits from analyzer explain hook verbatim via existing registry seam. `buildPropDrillingProposalBuilder()` pure builder in `packages/adapter-react/src/prop-drilling-proposal.ts`: 1:1 grounded from AdapterMetricEvidence roles/metrics/subject; fixed non-prescriptive consider[] template (Context/shared hook/prop consolidation + "RAI does not know which is correct"); limits passed through verbatim; drilledProps sorted; no patch/diff/write. CLI composition root (`packages/cli/src/adapters.ts`) collects proposal builders via `ReactAdapterModule.buildPropDrillingProposalBuilder`. Preview-only enforced type-level — `PreviewProposal` not assignable to patch input; `applyRefactor` hardcoded to shared-extraction. framework-free guard green. 79 test files / 764 tests. |
| P14-S5 | Calls graph edges | Shipped (PR #43, squash e0b42b6). `buildGraph` materializes `calls` edges (caller file → defining module) from call/call-binding facts, grounded by P14-S1 import resolution. `buildImportLocalMap` (per-file `Map<local,{moduleId,mode}>`, resolveImportTarget memoized once per import fact); `resolveCallee` exact-match mode-agnostic, namespace-prefix branch GATED to `mode==="namespace"` (named import used as member does NOT emit a spurious edge — covered by the imports edge). Conservative exclusions (dynamic/method/same-file/external), self suppressed, minimal shape, dedup + deterministic. No type/MCP/DB/analyzer change (`calls` pre-existed in EdgeKind). 52 parse tests (C1–C14). Judgment-day APPROVED (named-import member-callee false positive gated R1 → R2 clean). Completes P14 edge work. |
| P14-S3 | Prop-drilling analyzer | Shipped (PR #42, squash d3c14b6). `react/prop-drilling` in `@rai/adapter-react` — FIRST consumer of P14-S2 `passes` edges. Depth-2 name-level pass-through: component B fires when an inbound `passes` edge and an outbound `passes` edge share a prop name P AND `B.propNames` includes P. Triple intersection minus a hardcoded `COMMON_PROP_NAMES` guard (id/className/value/style/children/key/ref/name/type/disabled/onChange/onClick/onSubmit/class — ubiquitous names that co-occur without real drilling; domain props survive). One `opportunity` finding per B (info 1 / warn 2+); evidence = sorted drilled props + all upstream/downstream endpoints as roles; 3-part SHA fingerprint excludes A/C from structural key (no endpoint-churn re-keying); self-edge guard; adapter-owned explain hook stating name-level limits. Pure sync, no core/MCP change, no new evidence kind. Judgment-day APPROVED (self-edge degenerate-finding hardened R1 → R2 clean). |
| P14-S2 | Passes graph edges | Shipped (PR #41, squash d39629b). `buildGraph` materializes `passes` edges ("A renders B passing prop P") from existing `jsx-attribute` facts. Adds `"passes"` to `EdgeKind`; widens `GraphEdge` with optional `propNames?: string[]` (blast radius flat — all consumers key on `{kind,srcId,dstId}`, `edgeRef` drops extra fields, no DB edge table). Pass groups jsx-attribute by `(file,tag)`, excludes spread, dstId via `byName`, srcId via single same-file component whose `childComponents` includes the tag (ambiguity guard skips 0 or >1). propNames merged via `Map<srcId|dstId,Set>` and emitted as one sorted-unique edge per pair BEFORE `dedupeEdges`. Zero-prop → no edge; self suppressed; deterministic. Framework-free core, no DB/MCP change. 61 parse tests. Judgment-day APPROVED (both judges, 0 critical). |
| P14-S1 | Imports graph edges | Shipped (PR #40, squash 622bb5f). `buildGraph` materializes `imports` edges from `PatternImportFact` (the `imports` EdgeKind was declared in types.ts but never built). `resolveImportTarget`: relative-only (`./`,`../`), fs-free resolution against the in-memory module-id set, probe order exact→`+[.ts,.tsx,.js,.jsx]`→`/index+ext`, file-beats-index; escaping-root guard (a `..` popping past scan root → null → no edge, no spurious re-anchor). External/unresolved → no edge. Dedup via existing `dedupeEdges`, self suppressed, A→B+B→A both emitted, deterministic `compareEdges`. Observable via existing MCP raw edges query; zero type/MCP change. Path aliases + fan-in analyzer deferred. 46 parse tests. Judgment-day APPROVED (1 over-pop bug found+fixed+regression-tested). |
| P13-S2.x | Secondary calibration knob (`maxFanOut`) | Shipped (PR #39, squash 74559cb). `lookupRejectedEvidenceRows` returns paired `{fanIn,fanOut}` rows. `CALIBRATABLE_SECONDARY_RULES` registers `renderCoupling.maxFanOut` (default 7) + `hookTopology.maxFanOut` (default 5). `computeSecondarySuggestions`/`computeApplicableSecondarySuggestions` fire only when fanOut breach count strictly > fanIn breach count (vs current thresholds; tie suppresses); loosen-only `min(max(fanOut),50)`; no severity fallback; idempotent apply. A rule may emit both `maxFanIn` + `maxFanOut` in one run. Option A (parallel structure) — P13-S2 primary path byte-identical. Zero schema change. 28 new tests. |
| P13-S3 | `rai calibrate --apply` guarded write | Shipped. `mergeSuggestionsIntoConfig` pure core helper (merge base = raw input, not defaulted config). `atomicWrite` exported from writers.ts. Apply sub-flow in `runCalibrateCommand`: preview (--apply no --yes), noop (0 suggestions), idempotent (canonical equality skip), written (--apply --yes). `CalibrateResult.merged`+`.applied`. apply/yes default false (suggest-only guardrail preserved). 19 new tests + 6 GUARDRAIL tests unchanged. 73 files / 615 tests. |

### Parked work

- **P12-S1 (`rai check --diff`)** — full SDD planning (explore → proposal → spec → design → tasks) is complete and persisted under `openspec/changes/p12-s1-rai-check-diff/` and Engram (`sdd/p12-s1-rai-check-diff/*`). Apply has NOT run; no code written. Parked because P12 is now last in priority. The plan is reusable as-is when P12 comes up; re-verify it against the codebase at that time (it may have drifted).

## P7 scope notes — complete

P7 is first because adoption friction blocks all later value.

Delivered capabilities:

- `rai install` defaults to auto-detecting supported platforms.
- Initial supported platforms: `opencode`, `claude-code`, `codex`, `copilot`.
- `--platform` overrides auto-detect.
- `--dry-run`, `--yes`, and `--no-instructions` control safety and output.
- Installer writes MCP config plus bounded RAI routing instructions.
- Existing files are preserved; generated blocks use markers.
- `rai doctor` checks native dependencies, SQLite/vector support, MCP config, paths, and build/runtime health.
- Distribution decision keeps near-term TypeScript CLI, plans prebuilt native bindings next, defers Go wrapper, and defers WASM SQLite/vector until vector support is viable.

## P8 scope notes

P8 targets the remaining distribution pain: using RAI without Node/native build friction.

Planned capabilities:

- Evaluate a Go CLI wrapper as the single-binary distribution path. P8-S1 local prototype is implemented under `cmd/rai` and `internal/launcher`.
- Define boundary between Go CLI, TypeScript engine, and MCP stdio server. Current boundary keeps the TypeScript engine as source of truth and reserves launcher diagnostics for stderr.
- Prototype command pass-through for `install`, `doctor`, `analyze`, and `mcp`. Current launcher preserves argv, stdout/stderr passthrough, and child exit codes.
- Compare packaging options: embedded Node/runtime, sidecar Node server, or subprocess to installed JS engine.
- Define dry-run release shape with disabled publish, portable archive layout, validation script, install-script placeholder, and maintainer checklist.
- Define repository workflow policy: `main` trunk/default branch target, short-lived work-unit branches, branch naming, Conventional Commit commit/PR titles, PR template use, legacy `feat/rai-mvp-p0-p3` retirement after P8, PR gates, release tag policy, rollback policy, and manual mutation gates.
- Add P8-S3c governance automation: commitlint conventional defaults, flexible scopes, `pnpm lint:pr-title`, and PR-title CI without semantic-release, real publish activation, branch/default/tag mutation, or mandatory local hooks.
- Add safe publish gates and activation for real channel repository names, exact secrets, manual release preflight, support matrix, and rollback policy without creating tags or publishing artifacts during apply.
- Decide production path and limitations before replacing current TypeScript CLI distribution.

P8 is verified and archived. `v0.1.3` is the first successful installable release. GitHub Release assets, Homebrew formula, and Scoop manifest were generated through GoReleaser; Homebrew install and `rai doctor . --json` passed locally. GoReleaser/manual `vX.Y.Z` tags remain release authority; explicit maintainer authorization is still required before future tag creation. `semantic-release` is not added in P8. P8-S3c commitlint and PR-title CI workflow enforcement are implemented; local hooks stay optional.

Rule: Go may wrap distribution, but RAI facts and analyzer behavior stay governed by the existing engine contracts unless a future design changes them.

## P9 scope notes — complete through P9-S3

P9 makes RAI outputs usable by developers who are not familiar with internal terms.

Delivered capabilities:

- Human-readable explain output alongside JSON where CLI conventions allow it.
- Glossary for `cosine`, `propOverlap`, `hookOverlap`, `sharedSurface`, `groundingFields`, `span`, `diagnostic`, and related graph/topology terms.
- Grounded summaries that explain what RAI found, why it matters, what to inspect first, and what not to assume.
- `rai explain <file>` for finding inspection without an agent session.
- Analyzer-owned explanation hooks so adapters can provide high-quality human wording without moving adapter semantics into `@rai/core`.
- P9-S2 applies this to `react/container-presenter-role-drift` and adds the human-facing output quality rule.
- P9-S3 extends current analyzer explanation coverage so known core evidence kinds and current React/Next adapter findings lead with observed code facts instead of generic evidence-kind wording.
- README quick start that explains what RAI does, install path, first commands, how to read findings, current limitations, and next step.

Rule: core facts stay structured; human-facing UX explains facts without inventing intent; machine-facing JSON/raw evidence stays stable and structured.

Deferred explainability cleanup: a later slice can audit broad human-facing command copy for `doctor`, `install`, `backfill`, CLI usage/errors, MCP tool descriptions, and README examples.

## P10 scope notes — complete

P10 is foundation only. It does not try to detect every pattern in one slice.

Delivered capabilities:

- Pattern fact extraction for imports, exports, calls, JSX children, hook usage, static members, and file roles.
- React pattern catalog scaffold outside `packages/core`.
- Fixtures for Modal/Popover compound UI primitives.
- Explainable syntax evidence that future analyzers can consume without emitting findings yet.

Rule: P10 facts are syntax observations only. They must not infer React intent, pattern labels, root cause, or remediation.

## P11 scope notes — in progress

P11 turns P10 syntax facts into concrete React pattern detection and drift, one family per slice.

Delivered so far:

- P11-S1: `react/compound-component-api-drift` analyzer in `@rai/adapter-react`, detecting compound-component API divergence from grounded pattern-fact evidence.
- P11-S2: `react/container-presenter-role-drift` analyzer in `@rai/adapter-react`, detecting observed current-source container/presenter role-name and syntax divergence from existing component names, file/path role seeds, direct render edges, and high-signal presenter hook calls.
- P11-S3: `react/controlled-uncontrolled-prop-surface-drift` analyzer in `@rai/adapter-react`, detecting observed controlled/default prop-name pairs (`value/defaultValue`, `checked/defaultChecked`, `open/defaultOpen`) from existing component `propNames` plus optional handler/hook evidence.
- P11-S4: framework-neutral fact expansion in `@rai/core`, adding syntax-only `call-binding`, `call-argument`, and `jsx-attribute` pattern facts without adding findings or React semantics to core.
- P11-S5: `react/context-provider-value-surface-drift` analyzer in `@rai/adapter-react`, the first slice consuming P11-S4 facts — correlating same-file `createContext`/`*.createContext` bindings with `<Local.Provider>` value surfaces and reporting observed same-file value-surface divergence (missing direct value without observed default, mixed direct-value presence, spread ambiguity) with optional `useContext`/`use` corroboration.
- P11-S6: `react/form-control-surface-drift` analyzer in `@rai/adapter-react` — detecting same-file form submit-surface divergence (onSubmit + declarative action/method co-presence) and control-binding divergence (mixed controlled/uncontrolled attr pairs on same-type native elements: input, select, textarea). CONTROL_BINDING_PAIRS carry a tags allow-set (ADR-4); all `action` occurrences count as one surface (OQ5); type=hidden/submit not excluded (OQ4 deferred and documented).
- P11-S7: `react/data-fetching-surface-drift` analyzer in `@rai/adapter-react` — detecting same-file co-presence of a raw-fetch `call` callee family (`fetch`, `window.fetch`, `globalThis.fetch`) and a query-hook `hook-call` family (11 names including `useQuery`, `useSWR`, `useMutation`, and more). Query-hook discriminator is `hook-call` only — `const { data } = useQuery()` (ObjectPattern, no call-binding) is correctly detected via hook-call alone. Per-file gate; cross-file silent; severity always `info`.
- Pure deterministic adapter-owned execution with stable fingerprints and no side effects.
- CLI/MCP adapter composition through the same registry factory as the Next adapter, with no new MCP drift tool.
- Distinct drift terminology: repo-local divergence for current source; historical wording only in existing `get_drift` snapshot results.
- OpenSpec specs `react-pattern-analyzers`, `pattern-drift`, and `cli-adapter-loading`.

- P11-S9: `react/design-system-usage-surface-drift` analyzer in `@rai/adapter-react` — detecting same-file JSX-usage-site styling-prop surface divergence across distinct usages of the same capitalized non-dotted tag. VARIANT_PROPS (variant/size/color/tone/intent/appearance) vs RAW_STYLE_PROPS (className/style) cross-usage gate (>=2 usages, some hasVariant AND some hasRaw AND >=1 variant-only or raw-only). Bare prop counts (OQ3). Never reads ctx.graph.components (non-overlap with P11-S3). Token: `stylingVariantSurfaceDrift:{tag}:{file}`.

Deferred to later P11 slices (specified/implemented by future approved changes, no findings yet):

- broad API conventions (P11-S10 — last deferred family).
- P11-S9 delivered `react/design-system-usage-surface-drift`; P11-S10 follows the same adapter-owned pattern.
- Optional non-blocking follow-ups: snapshot/`get_drift` parity coverage and `rai explain <file>` / file-ref parity coverage.

Rule: P11 analyzers stay adapter-owned and grounded. They explain syntax-derived divergence; they must not assert intended API, semantic symbol resolution, root cause, or required remediation.

## Future-scope guardrails

- RAI can propose patches only when evidence is structural and transformation is mechanical.
- RAI should not auto-apply patches; apply must be explicit and verified.
- RAI should derive team patterns from code/config/feedback, not generic best-practice vibes.
- CI should report net-new findings, not punish old debt.
- Go CLI changes distribution; Go engine changes truth. Do not migrate intelligence/storage modules to Go without golden parity for RepoGraph, spans, fingerprints, findings, DB rows, and MCP JSON.
