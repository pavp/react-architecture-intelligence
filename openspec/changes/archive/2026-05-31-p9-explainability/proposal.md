# Proposal: P9 Explainability

## Intent

Make RAI findings understandable without requiring users to reverse-engineer JSON fields. This slice adds presentation-only explanations, glossary terms, `rai explain <file>`, and root README onboarding while preserving existing analyzer facts, fingerprints, evidence shapes, and memory semantics.

## Scope

### In Scope
- Add deterministic explanation/glossary helpers over existing structured findings.
- Add bounded human-readable fields to `explain_finding` without removing raw evidence.
- Add `rai explain <file>` UX for finding inspection by file, plus help text/tests.
- Create README quick start with install, first commands, finding-reading guide, glossary, and limitations.

### Out of Scope
- No analyzer predicate, threshold, fingerprint, or evidence-shape changes.
- No implicit feedback writes, remediation advice generation, or LLM-authored findings.
- No broad reporting, CI/PR comments, calibration, or future React pattern intelligence.

## Capabilities

### New Capabilities
- `explainability`: Human-readable presentation of existing RAI facts, including glossary terms, bounded finding summaries, `explain_finding` explanation envelope, `rai explain <file>`, and README onboarding.

### Modified Capabilities
- None. Existing specs do not define MCP explainability or human CLI output; P9 adds a new capability without changing current adapter/distribution contracts.

## Approach

Implement a pure presentation layer in core that maps known finding/evidence fields to deterministic text: what RAI found, why it matters, what to inspect first, and what not to assume. Reuse that contract in MCP and CLI. Keep raw evidence authoritative. README follows cognitive-doc-design: lead with purpose, quick path, compact glossary, and limitations.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/core/src/mcp/tools.ts` | Modified | Add explanation envelope to `explainFinding`. |
| `packages/core/src/mcp/server.ts` | Modified | Update tool wording/schema if needed. |
| `packages/core/src/types.ts` | Modified | Add presentation-only types if useful; no fact changes. |
| `packages/cli/src/cli.ts` | Modified | Add `explain` command and human output path. |
| `packages/*/src/**/*.test.ts` | Modified | Cover deterministic summaries, MCP, CLI, and no-invented-intent guardrails. |
| `README.md` | New | Add onboarding quick start and glossary. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Human text implies facts not present | Med | Generate only from rule/evidence/glossary data; test “what not to assume”. |
| `rai explain <file>` misses nested evidence file refs | Med | Centralize file/span extraction and test multi-file evidence. |
| Additive MCP shape surprises consumers | Low | Preserve raw evidence and existing fields; add only bounded fields. |
| README expands review size | Low | Keep quick-path focused and defer deep docs. |

## Rollback Plan

Revert P9 files and tests. Because analyzer facts, memory writes, and evidence shapes stay unchanged, rollback restores prior JSON/MCP behavior without data migration.

## Dependencies

- Existing exploration: `openspec/changes/p9-explainability/exploration.md` / Engram `sdd/p9-explainability/explore`.
- Current OpenSpec specs show no existing explainability capability, so spec phase should create `openspec/specs/explainability/spec.md`.

## Success Criteria

- [ ] `explain_finding` returns raw evidence plus bounded explanation fields.
- [ ] `rai explain <file>` renders relevant findings and supports deterministic inspection.
- [ ] Glossary covers current core and Next adapter evidence terms.
- [ ] README lets a new user install, run, explain, and understand limitations.
- [ ] Tests prove presentation-only behavior and unchanged core facts.
