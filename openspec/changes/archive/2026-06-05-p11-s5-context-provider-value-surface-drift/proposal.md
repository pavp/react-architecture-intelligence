# Proposal: P11-S5 Context Provider Value-Surface Drift

## Status

proposed

## Proposal question round

Interactive SDD proposal mode normally pauses for a short product question round before finalizing. This task requested file-only output and supplied authoritative exploration decisions, so this proposal proceeds with these review assumptions instead of blocking:

1. Provider/context drift matters most as an adoption and maintenance signal: teams want to find inconsistent context value surfaces before they become confusing review, onboarding, or support issues.
2. Target users are React maintainers, platform/frontend leads, and reviewers inspecting provider APIs in current source.
3. First slice should report only high-grounding, single-file value-surface divergence from P11-S4 facts, not infer React runtime behavior or intended API shape.
4. Spread provider attributes should be surfaced as ambiguity on the observed `value` surface, not expanded or treated as proof of a missing value.
5. No Provider found is intentionally not a finding because absence of provider usage is not value-surface divergence.

## Intent

Add the first React analyzer slice that consumes P11-S4 framework-neutral facts: `react/context-provider-value-surface-drift`.

The analyzer should live in `@rai/adapter-react`, correlate local `createContext` bindings with same-file `<Local.Provider>` value-attribute surfaces, and report only observed current-source divergence in provider value surfaces.

## Business problem

React context provider APIs often become hard to reason about when a context binding has inconsistent provider value surfaces in the same file: some providers pass `value`, some omit it, some hide it behind spreads, or a provider is rendered without a visible value while the context default surface is absent.

For React teams, this creates practical cost:

- reviewers must manually inspect whether provider usage is consistent;
- maintainers lose confidence in provider contracts during refactors;
- onboarding developers see context usage that is difficult to explain;
- support/debug workflows spend time distinguishing intentional defaults from accidental API drift.

RAI should surface these inconsistencies as grounded opportunities, not as bug claims.

## Target users

- React application maintainers reviewing context/provider-heavy files.
- Frontend/platform leads standardizing shared provider patterns.
- Code reviewers using RAI findings to decide what to inspect before a refactor.
- Teams adopting RAI through CLI/MCP flows that already load the React adapter.

## Scope

### In scope

- Add analyzer id `react/context-provider-value-surface-drift`.
- Keep analyzer family `provider/context`.
- Implement analyzer-owned React interpretation in `packages/adapter-react`; `@rai/core` remains framework-neutral.
- Consume P11-S4 facts:
  - `call-binding` for local identifier bindings initialized by `createContext(...)` or `*.createContext(...)`;
  - `call-argument` for observed `createContext` default-value argument presence/absence and `argumentKind`;
  - `jsx-attribute` for `<Local.Provider>` attributes, especially direct `value`, absent `value`, and spread attributes.
- Use existing `hook-call` facts for `useContext(...)` / `use(...)` only as corroborating evidence when present; hook-call evidence must not be required for emission.
- Correlate only within a single file by local context binding name.
- For each local context binding, derive:
  - default-argument surface: default argument observed or absent, plus bounded `argumentKind`;
  - provider value-attribute surface: each same-file `<Local.Provider>` observed with direct `value`, no direct `value`, or spread/ambiguous value surface.
- Report observed value-surface divergence such as:
  - provider rendered with no directly observed `value` while no `createContext` default argument is observed;
  - multiple providers for the same local binding show divergent direct `value` presence;
  - provider attributes use spread, so `value` name is not directly observable.
- Emit deterministic, stable SHA fingerprints.
- Emit `type: "opportunity"` findings.
- Escalate severity from `info` to `warn` by divergence count according to a deterministic adapter-owned threshold chosen in design/spec.
- Keep analyzer pure, synchronous, side-effect free, and ordered deterministically.
- Compose through the existing adapter registry factory shared with the Next adapter.
- Add strict TDD coverage before implementation in apply.

### Out of scope / non-goals

- No cross-file symbol resolution.
- No import/export symbol resolution.
- No TypeScript type or semantic value inference.
- No JSX spread expansion.
- No assertion that a context default should exist.
- No assertion that a missing provider `value` is a bug.
- No assertion of team intent, intended API, root cause, user impact, or required remediation.
- No useContext consumer-completeness claims.
- No finding for `createContext` bindings with no provider found.
- No new MCP drift tool.
- No React semantics, analyzer rule ids, provider labels, or catalog logic in `@rai/core`.
- No finding schema, persistence, feedback, memory, snapshot, or generic MCP contract changes unless existing analyzer plumbing requires only additive adapter wiring.

## P11 grounding rule

P11-S5 findings must remain grounded in observed current-source facts. The analyzer may say that a local context binding has observed provider value-surface divergence in one file. It must not say the code is wrong, historically changed, semantically resolved across files, or should be remediated in a specific way.

The P11-S4 facts are syntax observations only. React meaning belongs entirely to `@rai/adapter-react`.

## Proposed analyzer semantics

For each file:

1. Find `call-binding` facts where `callee` is `createContext` or a member form ending in `.createContext`, and the bound `local` is an identifier.
2. Associate same-call `call-argument` facts to determine whether argument index `0` is present and its `argumentKind`.
3. Find `jsx-attribute` facts for tag `<Local.Provider>` or equivalent recorded tag text for the same `local` binding.
4. Summarize each provider occurrence as:
   - `directValue`: direct `value` attribute observed;
   - `missingDirectValue`: no direct `value` attribute observed for that provider tag;
   - `spreadValueUnknown`: spread attribute observed, so direct `value` presence cannot be fully known.
5. Emit only when the summarized surfaces diverge under approved conditions.
6. Include stable evidence for binding local name, file, context call span when available, provider spans when available, default argument surface, provider value surfaces, optional corroborating consumer hooks, metrics, threshold, and exceeded labels.

## Affected areas

| Area | Impact |
|------|--------|
| `packages/adapter-react/src/` | Add provider/context analyzer and wire it into the React adapter analyzer set through existing registry factory composition. |
| `packages/adapter-react/src/*.test.ts` | Add failing-first tests for no-default/no-value, mixed provider value presence, spread ambiguity, healthy cases, determinism, and bounded claim language. |
| `openspec/specs/react-pattern-analyzers/spec.md` | Add requirements for context provider value-surface drift. |
| `openspec/specs/pattern-drift/spec.md` | Clarify this is current-source value-surface divergence, not historical drift. |
| `openspec/specs/cli-adapter-loading/spec.md` | Update only if registry-factory composition needs spec coverage for the new React analyzer. |
| `docs/STATUS.md` / `docs/ROADMAP.md` | Later apply/archive should record P11-S5 completion and remaining P11 families. |
| `packages/core/**` | Avoid by default; core already has required P11-S4 facts and must not gain React semantics. |
| MCP tools | No new MCP drift tool; existing analysis/findings/explain paths should carry the analyzer output. |

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missing `value` sounds like a bug claim | High | Use “observed value-surface divergence” wording; avoid correctness/remediation language. |
| Spread attributes can hide `value` | Medium | Treat spread as ambiguity and evidence, not proof of absence. |
| Local-name matching can overstate symbol identity | High | Scope to one file and local binding name only; explicitly avoid import/cross-file claims. |
| Findings may be noisy for intentionally defaulted contexts | Medium | Require divergence conditions; include default-argument surface; keep no-provider cases silent. |
| Core boundary drift | High | Implement in `@rai/adapter-react`; add/reuse boundary tests; no React semantics in core. |
| Non-deterministic ordering/fingerprints | Medium | Sort by file, local binding, provider spans/surfaces; use stable SHA fingerprint inputs. |
| Registry composition regresses adapter loading | Medium | Use existing registry factory shared with Next adapter; cover with integration tests. |

## Rollback plan

1. Remove `react/context-provider-value-surface-drift` from the React adapter analyzer registration.
2. Revert the provider/context analyzer implementation and tests.
3. Revert OpenSpec deltas and status/roadmap notes for P11-S5 if abandoned before archive.
4. Leave P11-S4 `call-binding`, `call-argument`, and `jsx-attribute` facts intact because they are generic completed foundation work.
5. No data migration should be needed; analyzer output flows through existing finding paths and performs no direct writes.

## Success criteria

- [ ] Analyzer emits `react/context-provider-value-surface-drift` only from same-file local context binding/provider value-surface divergence.
- [ ] Analyzer consumes P11-S4 `call-binding`, `call-argument`, and `jsx-attribute` facts, with `hook-call` evidence used only as optional corroboration.
- [ ] Healthy same-file context/provider surfaces remain silent.
- [ ] No-provider-found cases remain silent.
- [ ] Findings use `type: "opportunity"`, deterministic severity escalation, stable SHA fingerprints, and deterministic evidence order.
- [ ] Finding language avoids intended API, bug, root cause, semantic symbol resolution, consumer completeness, and remediation claims.
- [ ] Analyzer is adapter-owned in `@rai/adapter-react`; `@rai/core` remains framework-neutral and unchanged for React semantics.
- [ ] Existing CLI/MCP analysis paths surface findings without adding a new MCP drift tool.
- [ ] Strict TDD, typecheck, build, lint, and smoke verification pass before archive.
