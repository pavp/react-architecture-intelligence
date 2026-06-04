# P9-S3a Current Analyzer Human Explanation Coverage

Upgrade the explanations users see in `rai explain` and MCP `explain_finding` for the analyzers RAI already ships, while preserving every machine-facing fact contract. This slice makes known findings understandable without broad CLI copy churn.

## Intent

P9-S3a will close the remaining explanation-quality gap for current analyzer findings:

- lead with what RAI observed in plain language;
- cite concrete evidence a user can inspect first;
- state limits so output does not imply intent, ownership, root cause, user impact, or required remediation;
- keep raw findings, evidence, fingerprints, snapshots, persistence, and MCP raw fields unchanged.

This is a presentation-only change. Analyzer truth remains source-code-derived and deterministic.

## Motivation

P9-S2 added the analyzer-owned explanation hook and covered `react/container-presenter-role-drift`. The remaining current analyzer outputs still have generic or internal wording in shared explanation paths, especially:

- generic summaries such as `RAI found <kind> evidence for <ruleId>`;
- adapter-metric inspect lines such as `adapter:`, `rule:`, `metric`, `threshold`, and `exceeded topology`;
- adapter rules without analyzer-owned explanations:
  - `react/compound-component-api-drift`;
  - `next/client-boundary-bloat`;
  - `next/route-coupling`.

This blocks the P9 goal: developers should understand findings without learning RAI internals first.

## Scope

### In scope

1. Improve core fallback explanations for known core evidence kinds:
   - `react/shared-extraction`;
   - `react/render-coupling`;
   - `react/over-abstraction`;
   - `react/hook-topology`;
   - `react/boundary-violation`.
2. Add analyzer-owned explanation hooks for adapter-owned rules that currently fall back to generic wording:
   - `react/compound-component-api-drift`;
   - `next/client-boundary-bloat`;
   - `next/route-coupling`.
3. Ensure the Next core adapter propagates analyzer-owned explanation hooks into the composed `Analyzer` contract.
4. Preserve generic fallback behavior for unknown evidence keys and unknown analyzer rules.
5. Add tests that reject generic/internal wording for known current analyzer outputs.
6. Verify both human surfaces that share the explanation envelope:
   - CLI `rai explain <file>` default text;
   - MCP `explain_finding.explanation`.

### Explicit non-goals / deferred outputs

These are deferred to a later P9-S3b or separate approved changes:

- broad `rai doctor` formatter rewrite;
- `rai install` copy/message overhaul;
- backfill status/message copy overhaul;
- CLI usage, unknown-command, and error UX pass;
- MCP tool description copy pass;
- README/onboarding rewrite beyond any minimal references required by changed behavior;
- diagnostics message schema or wording changes;
- raw JSON schema changes for `rai analyze`, `rai explain --json`, `doctor --json`, install results, backfill results, MCP tools, DB rows, feedback events, snapshots, or codemod proofs;
- new analyzers or new findings;
- memory writes, feedback behavior changes, or persistence migrations.

## Affected areas

| Area | Planned effect |
|------|----------------|
| `packages/core/src/explainability/explain.ts` | Improve known core evidence summaries, why text, inspect-first text, and limits while keeping unknown fallback bounded. |
| `packages/core/src/explainability/explain.test.ts` | Add/adjust tests for evidence-first known analyzer summaries and generic fallback preservation. |
| `packages/core/src/mcp/tools.ts` / tests | Verify `explain_finding` remains additive and raw fields/fingerprints/evidence stay unchanged while explanation text improves. |
| `packages/adapter-react/src/compound-component-api-drift.ts` / tests | Add analyzer-owned explanation for observed compound-component declared/used/missing parts without asserting intended API or remediation. |
| `packages/adapter-next/src/client-boundary-bloat.ts` / tests | Add analyzer-owned explanation for observed client-boundary topology/threshold evidence. |
| `packages/adapter-next/src/route-coupling.ts` / tests | Add analyzer-owned explanation for observed route component topology/threshold evidence. |
| `packages/adapter-next/src/core-adapter.ts` / tests | Preserve/propagate the analyzer `explain` hook through Next CLI/MCP composition. |
| `packages/cli/src/cli.test.ts` | Optional focused assertion that `rai explain` uses human summaries for at least one adapter rule. |

## Integrity and boundary rules

- `@rai/core` MUST remain framework-agnostic.
- Adapter-specific semantics MUST stay in adapter-owned explanation hooks.
- Explanation hooks MUST be deterministic and side-effect free.
- Explanation hooks MUST NOT mutate findings, evidence, memory, config, snapshots, diagnostics, feedback, or persistence.
- Human explanation text MUST be additive over raw facts.
- Unknown evidence MUST remain explicit as raw evidence; RAI MUST NOT fabricate meaning.
- Findings stay immutable and append-only.
- LLMs narrate only; they do not create findings or implicit feedback.

## Risks

| Risk | Mitigation |
|------|------------|
| Human text changes appear in `rai explain --json` and MCP responses, so consumers may snapshot text. | Treat explanation text as deterministic presentation. Keep raw fields stable and tests focused on required meaning, not brittle full paragraphs. |
| Adapter meaning could leak into `@rai/core`. | Put compound/Next rule language in adapter-owned hooks only. Core fallback only handles framework-agnostic evidence shapes. |
| Next hooks may pass unit tests but not CLI/MCP composition if `core-adapter.ts` drops `explain`. | Add composed-adapter or MCP/CLI path coverage that proves analyzer-owned explanations survive composition. |
| Wording may overstate cause or remediation. | Tests and review should reject claims about team intent, root cause, ownership, user impact, wrong architecture, or required refactoring. |
| Broad CLI copy cleanup could exceed review budget. | Keep P9-S3a limited to current analyzer explanation coverage and defer doctor/install/backfill/error UX. |

## Rollback

Rollback is low-risk because this slice is presentation-only:

1. Revert changed explanation hooks and core fallback wording.
2. Revert related tests.
3. Confirm raw findings, evidence, fingerprints, MCP raw fields, persistence, and snapshots were not migrated or changed.
4. Re-run `pnpm test && pnpm test:launcher` to restore the previous explanation baseline.

No data migration, schema migration, or feedback rewrite is planned.

## Success criteria

- `rai explain <file>` and MCP `explain_finding.explanation` use plain-language, evidence-first explanations for all current analyzer rules in scope.
- Known core evidence summaries no longer lead with generic `RAI found <kind> evidence for <ruleId>` wording.
- `react/compound-component-api-drift`, `next/client-boundary-bloat`, and `next/route-coupling` use analyzer-owned explanations rather than generic adapter-metric fallback wording.
- Adapter explanations cite observed subjects, files, roles, metrics, thresholds, or topology evidence.
- Explanation limits explicitly state what RAI does not know.
- Unknown evidence still uses bounded raw-key fallback.
- Machine-facing contracts remain available and structured:
  - raw finding;
  - raw evidence;
  - fingerprint;
  - rule id;
  - severity/status;
  - grounding fields;
  - memory overlay;
  - snapshots/persistence.
- No new findings, analyzers, feedback writes, persistence writes, or schema migrations are introduced.

## Strict TDD validation notes

Implementation MUST follow strict TDD:

1. Start with failing tests for explanation behavior.
2. Add minimal code to pass.
3. Refactor only after green tests.
4. Keep tests behavior-focused and deterministic.

Required validation:

```bash
pnpm test && pnpm test:launcher
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

Recommended focused test assertions before full validation:

- core known evidence summaries do not start with `RAI found <kind> evidence`;
- known adapter rules do not expose generic/internal adapter-metric lines as primary inspect guidance;
- `explain_finding` preserves raw `finding`, `evidence`, and fingerprint values;
- Next adapter composition preserves analyzer-owned `explain` hooks;
- `rai explain` renders at least one adapter-owned human summary through the real CLI path;
- unknown evidence still reports raw keys without invented meaning.

## Review workload forecast

Expected implementation should fit within the active 1200-line SDD budget if it stays limited to explanation hooks, focused tests, and the Next adapter hook propagation. If implementation scope expands into doctor/install/backfill/errors or broad docs, pause before apply and ask for a delivery decision.
