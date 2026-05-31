# Design: P9 Explainability

## Technical Approach

Add a deterministic presentation layer over existing `PresentedFinding` and `Evidence` values. Core keeps analyzer facts, fingerprints, evidence, diagnostics, and memory writes unchanged; new helpers only summarize and label those facts. MCP `explain_finding` and CLI `rai explain <file>` reuse the same helpers so human text has one source of truth. README onboarding stays quick-path focused: what RAI does, install, first commands, how to read findings, glossary, and limits.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|-------------------------|-----------|
| Shared presentation boundary | Create core explainability helpers and export them from `packages/core/src/index.ts`. | CLI-only formatting; analyzer-authored prose. | MCP and CLI need identical wording; analyzers must stay fact producers, not narrators. |
| Explanation contract | Add an additive envelope with `summary`, `whyItMatters`, `inspectFirst`, `limits`, `groundingFields`, and `glossary`. | Replace raw evidence; free prose blob. | Existing consumers keep raw fields; bounded fields make reviewable, testable claims. |
| File matching | Centralize file/span extraction from primary spans and nested evidence refs. | Match only `finding.evidence.kind` primary span; duplicate CLI-only traversal. | `shared-extraction` and boundary/adapter evidence can reference multiple files. |
| README shape | Lead with quick path, then compact guide/glossary/limitations. | Full architecture manual. | New users need recognition over recall; deep docs remain outside P9. |

## Data Flow

```text
analyzeRepo/readSources ──→ PresentedFinding[]
        │
        ├─ MCP explain_finding(fp) ──→ explainFinding(f) ──→ raw + envelope
        │
        └─ CLI rai explain <file> ──→ matchFindingFiles(f, file)
                                    └─ renderFindingExplanation(f)
```

No path writes feedback. `record_feedback` remains the only memory write door.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/explainability/glossary.ts` | Create | Known term definitions and unknown/raw fallback. |
| `packages/core/src/explainability/explain.ts` | Create | Build deterministic explanation envelope from finding, rule/evidence keys, glossary, memory state. |
| `packages/core/src/explainability/file-refs.ts` | Create | Extract files/spans from all current evidence variants for CLI filtering. |
| `packages/core/src/explainability/*.test.ts` | Create | Guard glossary coverage, no invented intent, file matching, stable output. |
| `packages/core/src/types.ts` | Modify | Add presentation-only types for explanation envelope; no evidence/finding shape changes. |
| `packages/core/src/index.ts` | Modify | Export explainability helpers/types for CLI reuse. |
| `packages/core/src/mcp/tools.ts` | Modify | Add explanation envelope to `Session.explainFinding` response beside existing raw fields. |
| `packages/core/src/mcp/server.ts` | Modify | Update `explain_finding` tool description to mention bounded explanation plus raw evidence. |
| `packages/core/src/mcp/tools.test.ts` | Modify | Replace “no prose” assertion with bounded/additive explanation assertions. |
| `packages/core/src/mcp/server.test.ts` | Modify | Cover updated MCP wording/serialized response if existing assertions require it. |
| `packages/cli/src/cli.ts` | Modify | Add `explain` command, parser support, help text, human renderer, optional JSON if following existing flag style. |
| `packages/cli/src/cli.test.ts` | Modify | Cover parse, file hits/no hits, human output, JSON path if added, and no memory writes. |
| `README.md` | Create | Quick start, command path, finding-reading guide, glossary, limitations. |

## Interfaces / Contracts

`explainFinding` response stays additive: existing `finding`, `evidence`, `groundingFields`, and `memory` remain. New `explanation` uses only existing facts and glossary text. Unknown evidence keys render as raw/unknown; helpers MUST NOT infer intent, ownership, root cause, or remediation.

`rai explain <file>` runs normal analysis, filters active findings whose extracted refs match the requested file, prints human output by default, reports “no relevant findings” when empty, and performs no feedback or memory mutation.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Glossary, envelope, unknown evidence, file refs | Vitest pure helper tests with fixtures. |
| Integration | MCP additive response and CLI explain UX | Existing MCP/CLI tests using fixtures and in-memory session. |
| Docs | README command accuracy and limitations | Review-focused markdown assertions if useful; otherwise include in implementation checklist. |

## Migration / Rollout

No migration required. This is presentation-only and rollback removes additive helpers/fields/README.

## Open Questions

- [ ] None.
