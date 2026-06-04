# Exploration: P9-S3 Human Output Coverage Audit

## Status

complete-inline

Artifact was persisted by the parent because the explore subagent lacked write/edit/shell tools.

## Executive summary

- P9-S3 should first cover finding explanations, not every CLI surface.
- Current shared path: `rai explain` human text + MCP `explain_finding` explanation envelope.
- Machine contracts to preserve: raw finding JSON, evidence shapes, fingerprints, MCP raw fields, snapshots, feedback, `rai analyze` JSON, `--json` command schemas.
- Biggest remaining gap after P9-S2: generic fallback wording in `packages/core/src/explainability/explain.ts`, especially:
  - `RAI found <kind> evidence for <ruleId>.`
  - adapter-metric inspect lines like `adapter:`, `rule:`, `metric`, `threshold`, `exceeded topology`.
- Smallest valuable slice: upgrade all current analyzer explanations through `rai explain` / `explain_finding`, using:
  - better core fallback for core evidence kinds;
  - analyzer-owned hooks for adapter-specific rules still generic: `react/compound-component-api-drift`, `next/client-boundary-bloat`, `next/route-coupling`;
  - keep `react/container-presenter-role-drift` as already covered.

## Recommended slice

Implement P9-S3 as **current analyzer human explanation coverage**.

Scope:

1. Improve `explainFinding` summaries/why/inspect/limits for core evidence kinds:
   - `react/shared-extraction`
   - `react/render-coupling`
   - `react/over-abstraction`
   - `react/hook-topology`
   - `react/boundary-violation`
2. Add analyzer-owned explanations for adapter rules lacking them:
   - `react/compound-component-api-drift`
   - `next/client-boundary-bloat`
   - `next/route-coupling`
3. Preserve generic fallback for unknown evidence.
4. Add tests that reject generic/internal wording for known current analyzer outputs.

Do not include broad doctor/install/backfill UX rewrite in this first slice.
Do not change raw evidence, fingerprints, JSON schemas, MCP raw fields, diagnostics shapes, persistence, or snapshots.

## Inventory

### Human-facing outputs

- `rai explain <file>` default text via `renderExplainReport`.
- Explanation envelope text inside `rai explain --json` and MCP `explain_finding`.
- README onboarding/examples.
- CLI usage text for no args/unknown command.
- `rai doctor` non-JSON formatter and remediation strings.
- Install plan/result `message`/`error` strings, even though emitted as JSON.
- Backfill `status`/`message`/commit status text, even though emitted as JSON.
- MCP tool descriptions.
- Analysis diagnostics `message` strings surfaced to users/agents.
- Smoke output is developer-facing only.

### Machine-facing outputs

- `rai analyze` JSON result envelope.
- Raw findings and `evidence`.
- `fingerprint`, `ruleId`, `severityRaw`, `analysisVersion`, `fpAlgoVersion`, `producingRunId`, `commitSha`.
- MCP tool input/output raw fields.
- `rai explain --json` raw `finding`, `evidence`, `memory`, `groundingFields`; explanation text additive.
- `doctor --json` report schema.
- Install plan/result schema and operation fields.
- Backfill result schema.
- DB rows, feedback events, snapshots, codemod proofs.

### Generic/internal gaps after P9-S2

- `explain.ts` generic summary: `RAI found ${finding.evidence.kind} evidence for ${finding.ruleId}.`
- `adapter-metric` fallback exposes internal terms:
  - `adapter: next`
  - `rule: next/client-boundary-bloat`
  - `role route (app)`
  - `metric clientComponentCount: 6`
  - `threshold clientComponentCount: 3`
  - `exceeded topology: ...`
- `react/compound-component-api-drift` uses generic adapter-metric fallback; no analyzer-owned human explanation.
- `next/client-boundary-bloat` and `next/route-coupling` use generic adapter-metric fallback; no analyzer-owned human explanation.
- Core known evidence kinds have decent inspect-first lines, but summaries still lead with kind/rule id instead of meaning.
- `renderExplainReport` label `Evidence terms:` can be acceptable, but may show raw field names for adapter-metric until hooks improve.
- Diagnostics like `next/client-boundary-bloat supports app-router, detected pages-router` are terse but lower-priority; defer.
- Doctor text already fairly human-readable and has `fix:` lines; defer.
- Install/backfill are JSON-first; defer to later P9-S3b.

## Alternatives considered

### All analyzers now

Decision: yes, but only explanation surface.

Why: current analyzer set is small; covers user-visible finding quality end-to-end without broad CLI churn.

### All CLI commands now

Decision: no.

Why: doctor/install/backfill/usage/error copy touches many schemas/tests and risks exceeding review budget. It is also not central to the P9-S2 analyzer explanation seam.

### Only `rai explain` fallback cases

Decision: almost, but include MCP too because the same explanation envelope powers `explain_finding`.

Why: improves both human CLI and agent-facing MCP explanation without raw contract changes.

### Core-only generic formatter

Decision: no for adapter semantics.

Why: moving Next/React rule meaning into core breaks adapter ownership. Use analyzer hooks.

### Docs-only audit

Decision: no.

Why: roadmap asks to upgrade remaining human-facing outputs; tests should lock behavior.

## Likely files

### Core

- `packages/core/src/explainability/explain.ts`
- `packages/core/src/explainability/explain.test.ts`
- `packages/core/src/explainability/glossary.ts` maybe, only if adding glossary terms for current evidence terms.
- `packages/core/src/mcp/tools.test.ts` maybe, to assert `explain_finding` stays additive/uses hooks.

### React adapter

- `packages/adapter-react/src/compound-component-api-drift.ts`
- `packages/adapter-react/src/compound-component-api-drift.test.ts`
- `packages/adapter-react/src/core-adapter.test.ts` maybe, for composed analyzer hook path.

### Next adapter

- `packages/adapter-next/src/client-boundary-bloat.ts`
- `packages/adapter-next/src/route-coupling.ts`
- `packages/adapter-next/src/core-adapter.ts` likely, to pass `explain` through `adaptNextAnalyzer`.
- `packages/adapter-next/src/client-boundary-bloat.test.ts`
- `packages/adapter-next/src/route-coupling.test.ts`
- `packages/adapter-next/src/core-adapter.test.ts` maybe, for composed hook path.

### CLI / smoke tests

- `packages/cli/src/cli.test.ts` maybe, add one assertion that `rai explain` for adapter finding uses human summary.
- `scripts/smoke.sh` optional; existing smoke already covers container/presenter human summary. Avoid expanding unless cheap.

### OpenSpec / docs later

- `openspec/changes/p9-s3-human-output-coverage-audit/proposal.md`
- `openspec/changes/p9-s3-human-output-coverage-audit/specs/explainability/spec.md`
- `openspec/changes/p9-s3-human-output-coverage-audit/tasks.md`
- `docs/STATUS.md` after apply/verify only.

## Proposed change id

`p9-s3-human-output-coverage-audit`

## Risks

- Explanation strings appear in `--json`; raw fields remain stable, but users may snapshot human text. Keep tests targeted and wording deterministic.
- Adapter hooks for Next require `core-adapter.ts` to propagate `explain`; missing this makes unit hooks pass but CLI/MCP still generic.
- Core formatter must not infer best practice, root cause, team intent, ownership, user impact, or required remediation.
- Adapter wording must stay evidence-grounded:
  - compound drift: only observed declared/used/missing compound parts;
  - Next boundary bloat: only observed client boundary topology/thresholds;
  - route coupling: only observed route component topology/thresholds.
- Avoid changing diagnostics/error message schemas unless deliberately in later slice.
- Avoid touching known unrelated local files: `.gitignore`, `.pi/`, `progress.md`, `reviews/`, `sdd/`.
- Workload likely within 1200-line budget if limited to explanations/tests; broad CLI copy pass could exceed it.

## Next recommended

- Spec P9-S3a as current-analyzer explanation coverage.
- Write tests first:
  - known evidence summaries do not start with `RAI found <kind> evidence`;
  - adapter-metric current rules use analyzer-owned explanations;
  - raw evidence/fingerprints unchanged in `explain_finding`;
  - `rai explain` text includes human summaries for at least one adapter rule.
- Implement core known-kind wording.
- Add adapter-owned explain hooks for compound + Next rules and propagate through Next core adapter.
- Run:
  - `pnpm test`
  - `pnpm test:launcher`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm lint`
  - `./scripts/smoke.sh --build`

## Skill resolution

none

## Memory-ready notes

**What**: Explored P9-S3 and identified current analyzer explanation coverage as the smallest reviewable slice.

**Why**: Roadmap asks human output quality upgrades while preserving machine-facing JSON/MCP/raw evidence contracts.

**Where**: `packages/core/src/explainability/explain.ts`, adapter React/Next analyzers, CLI/MCP explanation path.

**Learned**: P9-S2 added analyzer-owned hook and custom container/presenter explanation; remaining adapter-metric rules still fall back to generic/internal wording. Broad doctor/install/backfill UX should be deferred.
