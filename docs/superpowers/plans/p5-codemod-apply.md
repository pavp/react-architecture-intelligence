# P5 — Codemod Apply — Implementation Plan

**Status:** In progress — Slices 1 and 2 complete
**Branch base:** `feat/rai-mvp-p0-p3`
**Created:** 2026-05-30
**Design source:** [`docs/superpowers/specs/2026-05-29-react-architecture-intelligence-mcp-design.md`](../specs/2026-05-29-react-architecture-intelligence-mcp-design.md) §1, §4.6, §5.2, §7
**Gaps source:** [`docs/gaps.md`](../../gaps.md) §2.2, §3.9

P5 turns RAI from a read-only advisor into a safely gated code modifier. The first delivery is narrow: propose and apply one shared-component extraction only when a current persisted opportunity finding authorizes it.

---

## Scope summary

P5 delivers two capabilities:

1. **`propose_refactor`** — proposal-only MCP tool. It returns a structured extraction proposal from `react/shared-extraction` evidence and never writes files.
2. **`apply_refactor`** — gated mutation path. It binds to a current active opportunity fingerprint, runs a dry-run patch, verifies, commits, and stores rollback proof.

The first codemod target is shared component extraction from `react/shared-extraction`. Other codemods, framework-specific transforms, conflict remediation, and autonomous LLM fixes are out of scope.

---

## Architecture guardrails

- Code is source of truth. Findings and codemod proof artifacts are append-only.
- `propose_refactor` never writes files, never stages changes, and never records feedback.
- `apply_refactor` has no `--force` escape hatch.
- The finding fingerprint is the capability token. Only a current, active, `opportunity` finding at the current `analysis_version` can bind a codemod.
- Absent, stale, suppressed, superseded, `architectural-conflict`, and non-opportunity findings are refused before any write.
- Conflict findings must never be interpreted as refactor opportunities.
- Any source edit invalidates stored spans for that file. Apply must re-run Pass 1 on touched files before trusting spans.
- A dirty worktree refuses before mutation.
- Verification is mandatory: `DRY-RUN -> TYPECHECK -> TESTS -> GIT-clean -> commit + reversal patch`.
- Rollback integrity is a kill condition. If rollback cannot be guaranteed, P5 pauses instead of shipping partial apply.
- `@rai/core` stays framework-agnostic. P6 adapters may register codemods later, but still use the same core gate.

---

## Decisions resolved before implementation

### D1 — First codemod target

Use `react/shared-extraction` only. It already produces the evidence a shared-extraction codemod needs: instances, spans, variance points, shared surface, cosine, prop overlap, hook overlap, and conflict metadata.

### D2 — Proposal before mutation

Ship `propose_refactor` before `apply_refactor`. The proposal tool proves evidence shape, risk classification, and patch intent without creating a write path.

### D3 — `exportKind` risk must be surfaced

P5 must use `ComponentNode.exportKind` in proposal risk. Extraction cost differs by export shape:

| Export kind | Proposal risk |
|---|---|
| `none` | Lowest risk; no existing import sites to update |
| `named` | Import updates may be required |
| `default` | Highest risk; rename conflicts and default import rewrites possible |

If `exportKind` is not present in shared-extraction evidence, Slice 1 adds it before codemod proposal ships.

### D4 — No automatic history mutation

P5 proof artifacts are append-only records of what a codemod did. They do not rewrite existing findings, snapshots, or feedback. New analysis after apply produces new findings through the normal pipeline.

---

## Slices

Each slice is a reviewable work unit. If a slice approaches 400 changed lines, split it into a chained PR.

### Slice 1 — Proposal contract and evidence readiness ✅ DONE

**Goal:** make shared-extraction evidence sufficient for safe proposal generation.

**Tasks:**

- [x] Add proposal result types: target fingerprint, rule id, source instances, generated component name candidate, variance parameters, risk level, refusal reason, and no-write guarantee.
- [x] Surface `exportKind` for each shared-extraction instance or prove it is already available through a stable path.
- [x] Add risk classification for default exports, named exports, missing spans, conflicting filenames, and variance points that cannot become props.
- [x] Add tests for proposal input validation and high-risk classification.

**Strict TDD anchors:**

- missing finding fingerprint refuses
- non-`react/shared-extraction` finding refuses
- conflict evidence refuses
- default-export instance produces high-risk proposal, not silent low-risk output

**Exit criteria:**

- [x] Shared-extraction evidence can describe all files/spans/import risk needed by the first codemod.
- [x] Proposal type is stable and contains no prose-only fields.
- [x] No write path exists in this slice.

---

### Slice 2 — `propose_refactor` MCP tool ✅ DONE

**Goal:** expose proposal-only shared extraction through MCP.

**Tasks:**

- [x] Implement pure proposal builder in `packages/core/src/codemod/`.
- [x] Add `Session.proposeRefactor(...)` in `packages/core/src/mcp/tools.ts`.
- [x] Register `propose_refactor` in `packages/core/src/mcp/server.ts`.
- [x] Update `openspec/specs/mcp-tools.md` with the proposal-only contract.
- [x] Add server/session tests proving no writes and deterministic output.

**Strict TDD anchors:**

- proposal for fixture returns stable component name candidate and variance parameters
- suppressed/conflict/non-opportunity finding refuses
- no source file is modified
- repeated call over same analysis returns byte-identical proposal

**Exit criteria:**

- [x] MCP clients can request a proposal from a finding fingerprint.
- [x] The tool never writes files, stages files, commits, or records feedback.
- [x] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.

---

### Slice 3 — Capability-token gate for apply

**Goal:** implement the mutation gate without applying code yet.

**Tasks:**

- [ ] Add `mayExecuteCodemod(fp, ctx)` around `FindingsStore.currentVersion(...)` and overlay status.
- [ ] Refuse absent, stale, suppressed, superseded, conflict, and non-opportunity findings.
- [ ] Require current `analysis_version` and matching `ruleId`.
- [ ] Add structured refusal codes.
- [ ] Add tests for every refusal branch.

**Strict TDD anchors:**

- absent fingerprint -> refused
- stale analysis version -> refused with re-analyze guidance
- suppressed by memory -> refused
- `architectural-conflict` -> refused
- current active opportunity -> bound result carries finding evidence

**Exit criteria:**

- [ ] No write path can run without a bound current finding.
- [ ] Refusal behavior matches design §4.6.

---

### Slice 4 — Dry-run transform and patch preview

**Goal:** generate a patch preview for the first shared-extraction codemod without mutating the workspace.

**Tasks:**

- [ ] Add source loading for proposal/apply inputs without storing raw file bytes in findings.
- [ ] Re-run Pass 1 on touched files and reject stale/mismatched spans.
- [ ] Generate extraction patch in memory.
- [ ] Return patch preview plus touched files and rollback preview.
- [ ] Add fixture tests for clean apply preview and span-staleness refusal.

**Strict TDD anchors:**

- clean fixture produces deterministic patch
- edited source with stale span refuses before patch generation
- dry-run leaves workspace unchanged
- impossible variance mapping refuses with explanation code

**Exit criteria:**

- [ ] Dry-run proves the codemod can construct deterministic patches.
- [ ] Workspace remains unchanged after dry-run.

---

### Slice 5 — `apply_refactor` verification pipeline

**Goal:** apply the patch only after all safety gates pass.

**Tasks:**

- [ ] Add dirty-worktree guard before mutation.
- [ ] Apply patch to workspace.
- [ ] Run configured typecheck command.
- [ ] Run configured test command.
- [ ] Check git-clean state for untracked/unexpected files after verification.
- [ ] Create commit with a Conventional Commit message.
- [ ] Generate reversal patch.
- [ ] Auto-rollback on typecheck/test/timeout failure.
- [ ] Register `apply_refactor` in MCP only after the pipeline exists end-to-end.

**Strict TDD anchors:**

- dirty tree refuses before mutation
- typecheck failure restores workspace exactly
- test failure restores workspace exactly
- successful apply creates commit and reversal patch
- timeout aborts and rolls back

**Exit criteria:**

- [ ] Successful shared-extraction codemod typechecks, tests, commits, and produces reversal patch.
- [ ] Failed verification leaves no partial write.
- [ ] No `--force` behavior exists.

---

### Slice 6 — Append-only proof artifacts

**Goal:** persist codemod execution proof so mutation is auditable.

**Tasks:**

- [ ] Add `codemod_proof` storage or equivalent append-only table.
- [ ] Persist originating fingerprint, rule id, analysis version, patch, verification output, reversal patch, timestamps, and result status.
- [ ] Add a read path for recent codemod proofs.
- [ ] Add tests proving append-only behavior.

**Strict TDD anchors:**

- success persists patch, verification, rollback, and fingerprint
- failed apply persists failure proof if any mutation was attempted
- proof rows are append-only; no update/delete path

**Exit criteria:**

- [ ] Every mutation attempt has an auditable proof record.
- [ ] Proof artifacts can reconstruct what changed and how to reverse it.

---

## Non-goals

- No framework-specific codemods in P5.
- No conflict-remediation codemods.
- No multi-rule batch apply.
- No LLM-authored patches without deterministic codemod generation.
- No `--force` option.
- No history backfill or snapshot rewriting.
- No adapter-owned persistence.

---

## P5 exit criteria

- [ ] `propose_refactor` returns deterministic shared-extraction proposals without writing files.
- [ ] `apply_refactor` runs only for current active opportunity findings.
- [ ] Dirty tree, stale span, suppressed finding, conflict finding, and non-opportunity finding all refuse before mutation.
- [ ] Verification pipeline runs dry-run, typecheck, tests, git-clean check, commit, and reversal patch.
- [ ] Typecheck/test/timeout failure rolls back with no partial write.
- [ ] Append-only proof artifacts include patch, verification output, rollback patch, originating fingerprint, and timestamps.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.

---

## Implementation seams

| Area | Current seam |
|---|---|
| Finding gate | `packages/core/src/memory/findings-store.ts` → `currentVersion(...)` |
| Session tools | `packages/core/src/mcp/tools.ts` |
| MCP registration | `packages/core/src/mcp/server.ts` |
| CLI route, if needed later | `packages/cli/src/cli.ts` |
| Shared evidence | `packages/core/src/types.ts`, `packages/core/src/analyzers/shared-extraction.ts` |
| Type info | `packages/core/src/parse/type-resolver.ts` |

---

## Risks

- Rollback integrity is the highest risk. Treat any unreliable rollback as a release blocker.
- Typecheck and tests cannot prove behavioral equivalence; reversal patch is the accepted residual-risk control.
- Default exports and renamed imports make extraction riskier than same-file unexported components.
- Span staleness can corrupt transforms unless Pass 1 is rerun on touched files.
- Shell verification commands need timeout controls so a hung test does not leave a half-applied workspace.
