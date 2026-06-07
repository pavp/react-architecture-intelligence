# Tasks: P13-S2 Evidence-Correlated Calibration Suggestions

Change: `p13-s2-evidence-correlated-suggestions` · Persistence: hybrid · Strict TDD ACTIVE (`pnpm test` / vitest)
Spec: 3 requirements (2 ADDED, 1 MODIFIED), 15 scenarios · Design ADRs D1–D5
Test runner: `pnpm test`. RED before GREEN — write failing tests first, then minimal impl to pass.

Legend: `[SEQ]` = sequential (depends on prior), `[PAR]` = parallelizable with siblings in same group.

---

## Group A — Core: Rejected-Finding Evidence Lookup (NEW)
Satisfies spec: **Rejected-Finding Evidence Lookup** (ADDED).
File: `packages/core/src/calibration/evidence-lookup.ts` (NEW), `packages/core/src/calibration/evidence-lookup.test.ts` (NEW).
Design refs: D1, D2, "Verified Metric Extraction Mapping", "Verified Structural Facts".

- [ ] **A1 [SEQ] RED — author `evidence-lookup.test.ts` (failing).** Spin a temp db (mirror `cli.calibrate.test.ts` `openDb` + `afterEach` rm pattern). Seed via raw SQL because FindingsStore is NOT exported from core index. Seed T3 `finding` rows (all 11 NOT NULL cols: id, fingerprint, rule_id, type, analysis_version, fp_algo_version, producing_run_id, commit_sha, severity_raw, evidence_json, created_at) with `evidence_json` matching each rule's discriminated `kind`. Seed T4 `feedback_event` rows. Assertions (one test per spec scenario):
  - returns observed metrics `{6,7,9,12}` for rejected `react/render-coupling` findings via T4→T3 join (`evidence.fanIn`); no row mutated.
  - `react/over-abstraction` → `evidence.propCount` values returned.
  - `react/hook-topology` → `evidence.fanIn` values returned.
  - `react/shared-extraction` → `evidence.instances.length` values returned.
  - null-finding skip: rejected fp whose `currentVersion(fp,ruleId)` is `null` (no T3 row) is SKIPPED, NOT treated as 0.
  - kind-mismatch skip (defensive): fp resolves to a finding whose `evidence.kind` !== the rule's expected kind → SKIP that fp.
  - empty: no rejected feedback for the rule → returns `[]`.
  - verdict filter: only `reject`/`wontfix`/`dismiss` counted; `accept`/`confirm` excluded.
  - VERIFY tests FAIL (module/fn does not exist yet).
- [ ] **A2 [SEQ] GREEN — implement `lookupRejectedEvidence(db: Db, ruleId: string): number[]`.** Per D1/D2: takes ONLY `Db`, constructs `new FindingsStore(db)` internally. Logic:
  1. `SELECT DISTINCT fingerprint FROM feedback_event WHERE rule_id=? AND verdict IN ('reject','wontfix','dismiss')`.
  2. For each fp: `new FindingsStore(db).currentVersion(fp, ruleId)`; if `null` → skip.
  3. Discriminate `finding.evidence.kind` against the rule's expected kind; mismatch → skip.
  4. Extract primary metric per mapping: render-coupling→`evidence.fanIn`; over-abstraction→`evidence.propCount`; hook-topology→`evidence.fanIn`; shared-extraction→`evidence.instances.length`.
  5. Return numeric array. SELECT-only — NO writes.
  Include the ruleId→(expectedKind, extractor) map in this module. VERIFY Group A tests pass GREEN.

## Group B — Core: Evidence-Correlated Suggestion (MODIFY suggest.ts)
Satisfies spec: **Core-Rule Threshold Suggestions** (MODIFIED) + **Evidence-Correlated Suggestion Fallback** (ADDED).
File: `packages/core/src/calibration/suggest.ts` (MODIFY), `packages/core/src/calibration/suggest.test.ts` (MODIFY).
Design refs: D3, D4, D5, "Correlated Arithmetic (exact)". Depends on: nothing in Group A at code level (consumes a pre-fetched `Map`), but logically pairs with it.

- [ ] **B1 [SEQ] RED — extend `suggest.test.ts` (failing) for `computeSuggestionsWithEvidence`.** New tests (one per scenario):
  - render-coupling current 5, evidence fanIn `{6,7,9,12}` → `renderCoupling.maxFanIn: 12` (max, NOT 6).
  - over-abstraction observed propCount `{9,11,14}` → `overAbstraction.maxProps: 14`.
  - hook-topology observed fanIn `{4,8,10}` → `hookTopology.maxFanIn: 10`.
  - shared-extraction observed instances.length `{3,4,6}` → `shared.minInstances: 7` (INVERTED floor = max+1).
  - cap-at-50: observed max `73` → newValue capped at `50`; patch validates.
  - fallback no-evidence: empty `Map` (or rule absent from map) → generic `current+1`.
  - fallback `newValue <= current` INCLUDING exactly equal: observed max == current 12 → fall back to 13 (current+1), NOT a no-op and NOT a lower value.
  - partial subset: two resolve `{7,9}`, two were null/skipped upstream → value from `{7,9}` (max 9); nulls already excluded by lookup.
  - determinism: same stats+config+evidence twice → identical list + order.
  - rationale cites observed max + count of rejected findings (e.g. "observed max 12 across 4 rejected findings").
  - patch validates against `ConfigSchema.partial()`.
  - VERIFY new tests FAIL (fn does not exist).
- [ ] **B2 [SEQ] GREEN — implement `computeSuggestionsWithEvidence` + extract `buildGenericSuggestion`.** Per D4:
  1. Extract shared private helper `buildGenericSuggestion(stat, currentConfig)` capturing the EXISTING S1 calibratable `current+1` path (and its severity-downgrade fall-through). `computeSuggestions` is refactored to CALL this helper but its OBSERVABLE behavior + signature stay byte-for-byte identical.
  2. New exported pure fn `computeSuggestionsWithEvidence(stats: RuleFeedbackStats[], currentConfig: RaiConfig, evidenceByRule: Map<string, number[]>): CalibrationSuggestion[]`. For each stat past trigger that is a calibratable core rule:
     - `values = evidenceByRule.get(ruleId)`; if present & non-empty:
       - Ceiling rules (render-coupling, over-abstraction, hook-topology): `newValue = Math.min(Math.max(...values), 50)`.
       - Floor rule (shared-extraction minInstances): `newValue = Math.min(Math.max(...values) + 1, 50)`.
       - if `newValue > current` → emit CORRELATED suggestion using `calibratable.buildPatch(newValue)`, validate via `ConfigSchema.partial().safeParse` hard gate, rationale cites observed max + rejected count → `continue`.
       - else (`newValue <= current`) → `buildGenericSuggestion`.
     - absent / empty values → `buildGenericSuggestion`.
     - Non-calibratable (adapter/unknown) → S1 severity downgrade via the generic helper (evidence path NOT entered).
  3. Sort by ruleId (byte order), same as S1. Determinism: `Math.max` is order-independent.
  VERIFY Group B new tests pass GREEN.
- [ ] **B3 [SEQ] NO-REGRESSION — re-run S1 `suggest.test.ts` tests unchanged.** Confirm every pre-existing `computeSuggestions` test still passes BYTE-FOR-BYTE behavior (generic path, severity downgrade, cap, sort). If any S1 test required modification, that is a FAILURE of D4 — revert and isolate the new behavior into `computeSuggestionsWithEvidence` only.

## Group C — CLI wiring (MODIFY cli.ts)
Satisfies spec: **Core-Rule Threshold Suggestions** (MODIFIED) — orchestration of aggregate → lookup → suggest.
File: `packages/cli/src/cli.ts` (MODIFY ~10 lines, `runCalibrateCommand` lines 159-184), `packages/cli/src/cli.calibrate.test.ts` (MODIFY).
Design refs: D1, "Verified Structural Facts" (db in scope, db.close in finally). Depends on: A (lookup) + B (suggest fn) + D (exports).

- [ ] **C1 [SEQ] RED — extend `cli.calibrate.test.ts` (failing) with T3 fixture.** Add a `seedFinding(dbPath, ruleId, fp, evidence)` raw-SQL helper (mirror existing `seedFeedback`, insert all 11 finding cols). NOTE: existing `seedFeedback` writes distinct fps `FP0..FP4`; seed matching T3 finding rows on those SAME fps so the join resolves. Scenarios:
  - seed T3 findings (render-coupling fanIn values) + T4 reject feedback (per OQ4) → assert a CORRELATED suggestion (maxFanIn = observed max, not current+1) appears in `runCalibrateCommand` `--json` result.
  - assert correlated suggestion also surfaces in human output (`run(["calibrate", dir, "--db", dbPath])` stdout).
  - VERIFY tests FAIL (CLI still calls plain `computeSuggestions`).
- [ ] **C2 [SEQ] GREEN — wire evidence path into `runCalibrateCommand`.** After `aggregateFeedback(db)`: for each calibratable rule past trigger, call `lookupRejectedEvidence(db, ruleId)`, build `evidenceByRule: Map<string, number[]>`, then call `computeSuggestionsWithEvidence(rules, currentConfig, evidenceByRule)` in place of `computeSuggestions`. Keep db opened read-only behaviorally (no writes); `db.close()` stays in `finally`. ~10 lines. VERIFY Group C tests GREEN.

## Group D — Exports (MODIFY index.ts)
Satisfies spec: enables CLI consumption; FindingsStore stays unexported (D2).
File: `packages/core/src/index.ts` (MODIFY). Depends on: A2 + B2 (symbols must exist). Required BEFORE C2 can import from `@rai/core`.

- [ ] **D1 [SEQ] Export new core symbols.** Add `export { lookupRejectedEvidence } from "./calibration/evidence-lookup.js"` and add `computeSuggestionsWithEvidence` to the existing `./calibration/suggest.js` export line (line 11). Do NOT export `FindingsStore` (D2 — tests seed via raw SQL). `Db` already exported (line 10).

## Group E — Suggest-Only Guardrail (CENTRAL ACCEPTANCE) — MODIFY guardrail test
Satisfies spec: **Core-Rule Threshold Suggestions** scenario "calibrate run via evidence path writes nothing". Design: "SUGGEST-ONLY Invariant".
File: `packages/cli/src/cli.calibrate.test.ts` (MODIFY — extend existing GUARDRAIL block). Depends on: C2.

- [ ] **E1 [SEQ] Extend the no-write guardrail to exercise the EVIDENCE path.** Seed T3 `finding` rows + T4 `feedback_event` rows, run `runCalibrateCommand`, then assert ALL THREE:
  - NO `rai.config.json` created AND pre-existing config bytes + mtime unchanged (existing INV-1/INV-2 assertions, now with T3 present).
  - `feedback_event` row count UNCHANGED after calibrate.
  - `finding` row count UNCHANGED after calibrate (NEW — the T4→T3 join is read-only; `currentVersion` is SELECT-only).
  This is the central S2 acceptance criterion: S2 introduces ZERO writes.

## Group F — Verification Gate (run all; record exact counts)
Depends on: A–E complete. No code authored here; this is the pass/fail gate.

- [ ] **F1 [SEQ] `pnpm test`** — record NEW totals (files + tests passing). Confirm new evidence-lookup + suggest-evidence + cli-evidence tests all pass and no S1 regressions.
- [ ] **F2 [PAR] `pnpm test:launcher`** — record result (should be unaffected; confirm no regression).
- [ ] **F3 [PAR] `pnpm typecheck`** — clean.
- [ ] **F4 [PAR] `pnpm build`** — clean.
- [ ] **F5 [PAR] `node scripts/check-core-framework-free.mjs`** (or `pnpm lint`) — confirm `evidence-lookup.ts` + `suggest.ts` stay framework-free (keys on ruleId strings + evidence `kind` data, NO React imports).
- [ ] **F6 [PAR] `git diff --check`** — no whitespace errors.
- [ ] **F7 [PAR] `git diff --stat`** — confirm scope: 1 NEW core file (evidence-lookup.ts) + 1 NEW test (evidence-lookup.test.ts) + MODIFY suggest.ts + suggest.test.ts + cli.ts + cli.calibrate.test.ts + index.ts. CONFIRM NO schema/migration/analyzer change.

## Group G — Docs
Depends on: F (must be green before claiming "shipped").

- [ ] **G1 [SEQ] Update `docs/STATUS.md`** — mark P13-S2 evidence-correlated suggestions shipped (replace the "Next phase" P13-S2 line at ~line 13; add a P13-S2 section mirroring the P13-S1 section style with verification counts from F1). Note next: P13-S3 `--apply`, or S2.x secondary knobs.
- [ ] **G2 [PAR] Update `docs/ROADMAP.md`** — move P13-S2 to done; surface P13-S3 (`--apply`) / S2.x as next.

## Group H — Spec-Sync Note for Archive (no code)

- [ ] **H1 [SEQ] ARCHIVE MERGE NOTE.** At ARCHIVE, the delta (2 ADDED + 1 MODIFIED requirement) merges into the EXISTING canonical `openspec/specs/calibration/spec.md` — IN PLACE, **directory form already exists from S1**. This is NOT a new capability and NOT a flat file.
  - ADDED "Rejected-Finding Evidence Lookup" and "Evidence-Correlated Suggestion Fallback" → append to the existing calibration capability.
  - MODIFIED "Core-Rule Threshold Suggestions" → REPLACE in place, PRESERVING its S1 scenarios and ADDING the S2 correlated scenarios.
  - Do NOT create a second calibration capability or a flat `calibration.md`.

---

## Review Workload Forecast

- **Estimated changed lines:** ~210 (design estimate, refined against verified file targets):
  - `evidence-lookup.ts` (NEW) ~45 + `evidence-lookup.test.ts` (NEW) ~75
  - `suggest.ts` (MODIFY: extract helper + new fn) ~40 net
  - `suggest.test.ts` (MODIFY: ~10 new test cases) ~50
  - `cli.ts` (MODIFY) ~10
  - `cli.calibrate.test.ts` (MODIFY: T3 helper + correlated + guardrail) ~40
  - `index.ts` (MODIFY) ~1
  - Docs (STATUS/ROADMAP) excluded from code budget.
  - Test-heavy but cohesive; ~200–230 code+test lines.
- **400-line budget risk:** **Low** — well within the 400 default and the 800 session budget. Honest assessment: a single PR fits comfortably even on the strict 400 budget.
- **Chained PRs recommended:** **No** — one cohesive read-only computation slice; splitting core/cli/docs would fragment a single deliverable behavior with no rollback benefit.
- **Decision needed before apply:** **No** — proceed as a single PR with work-unit commits.

### Suggested work-unit commits (single PR)
1. `feat(core): add rejected-finding evidence lookup for calibration` — A1+A2+D1(lookup export).
2. `feat(core): evidence-correlated calibration suggestions` — B1+B2+B3+D1(suggest export).
3. `feat(cli): wire evidence-correlated suggestions into calibrate` — C1+C2+E1.
4. `docs: record P13-S2 evidence-correlated calibration` — G1+G2.

(F verification runs across the whole PR before push; tests stay in the same commit as the behavior they verify per work-unit-commits.)
