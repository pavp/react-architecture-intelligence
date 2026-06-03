# Proposal: P9-S2 Human-Readable Explanations

## Intent

Make human-facing RAI explanations easier to understand while preserving structured machine-facing output. Add a safe adapter-owned explanation seam so adapter-specific findings, including `react/container-presenter-role-drift`, can provide high-quality human summaries without putting React-specific semantics into `@rai/core`.

## Motivation

P9 delivered a generic explanation envelope, but adapter metric findings currently read like internal evidence labels (`adapter-metric`, `roles`, `thresholds`, `topology`). P11-S2 added a useful React analyzer, but its default `rai explain` output does not clearly tell a developer what RAI observed.

The desired human reading for P11-S2 is:

> `UserContainer` renders `UserView`. `UserView` looks presenter-like from its name/path, but it also has high-signal hook evidence such as `useState`. Inspect whether that matches the repo's intended convention. This does not mean the architecture is wrong or that refactoring is required.

## Scope

### In scope

- Add an optional analyzer-owned explanation hook to the analyzer contract.
- Use that hook from `Session.explainFinding` when available.
- Keep fallback generic explanations for analyzers without custom explainers.
- Implement a custom explanation for `react/container-presenter-role-drift` in `@rai/adapter-react`.
- Add a canonical explainability rule: human-facing output MUST be clear, bounded, and evidence-first; machine-facing JSON/MCP/raw evidence MUST remain stable and structured.
- Update tests and smoke coverage for the new human-readable output.

### Out of scope

- No changes to analyzer finding facts, evidence shape, fingerprints, persistence, snapshots, memory semantics, or feedback writes.
- No React-specific wording inside `@rai/core`.
- No rewrite of every CLI command in this slice.
- No change to `rai analyze` count envelope or MCP raw fields.
- No LLM-generated explanations.

## Affected areas

- `packages/core/src/analyzers/analyzer.ts` — optional analyzer explanation hook type.
- `packages/core/src/analyzers/registry.ts` — lookup by rule id for explanation dispatch.
- `packages/core/src/mcp/tools.ts` — use analyzer-owned explanation when available.
- `packages/adapter-react/src/container-presenter-role-drift.ts` — custom human explanation.
- Tests under `packages/core`, `packages/adapter-react`, and possibly `packages/cli`.
- `scripts/smoke.sh` — assert the improved text for the new P11-S2 case.
- `openspec/specs/explainability/spec.md` — canonical rule after sync.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| React-specific semantics leak into core | Keep core seam generic; implement React text only in adapter-react. |
| Machine contracts break | Explanation hook returns only the existing additive `ExplanationEnvelope`; raw evidence stays unchanged. |
| Subjective “maximum quality” becomes unbounded | Scope this slice to human-facing explanations and define acceptance criteria. |
| Adapter explanations invent intent/remediation | Tests must ban wrong/root-cause/intent/must-refactor wording. |

## Success criteria

- `rai explain` for a P11-S2 container/presenter finding reads in plain human language.
- MCP `explain_finding` returns the same improved explanation envelope with unchanged raw evidence.
- Core remains framework-agnostic and does not contain React rule IDs or role names.
- Fallback generic explanations still work for analyzers without custom explainers.
- Focused tests, typecheck, build, lint, smoke, and diff checks pass.
