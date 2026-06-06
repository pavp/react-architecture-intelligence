# Archive Report: P11-S9 — react/design-system-usage-surface-drift

**Change**: `p11-s9-design-system-usage-surface-drift`
**Archived**: 2026-06-06
**Persistence**: hybrid
**Verdict at archive**: PASS WITH WARNINGS (0 CRITICAL, 1 WARNING, 2 SUGGESTIONS)

---

## Engram Observation IDs (traceability)

| Artifact | Engram ID |
|----------|-----------|
| explore | #650 |
| proposal | (in Engram, topic `sdd/p11-s9-design-system-usage-surface-drift/proposal`) |
| spec | #652 |
| design | #653 |
| tasks | (in Engram, topic `sdd/p11-s9-design-system-usage-surface-drift/tasks`) |
| verify-report | #656 |
| archive-report | (this document, saved to Engram topic `sdd/p11-s9-design-system-usage-surface-drift/archive-report`) |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `react-pattern-analyzers` | Updated (DIRECTORY form) | 4 requirements added/modified in `openspec/specs/react-pattern-analyzers/spec.md` |

### ADDED requirements (3 new):
1. **Design-System Usage Surface Drift Detection** — rule id, tag guard, VARIANT_PROPS/RAW_STYLE_PROPS sets, cross-usage gate, bare-prop counting, token format, severity. 11 scenarios.
2. **Design-System Usage Surface Non-Overlap With Prop-Surface Drift** — usage-site only, never reads `ctx.graph.components`. 2 scenarios.
3. **Design-System Usage Surface Evidence, Groundability, and Claim Boundaries** — forbidden vocab, limits disclaimers, severity rules. 3 scenarios.
4. **Design-System Usage Surface Determinism and Scope Boundaries** — pure/sync, fingerprints, no core change, no MCP tool. 5 scenarios.

### MODIFIED requirement (1 replaced in-place):
- **Deferred React Pattern Families Stay Scoped by Slice** — added P11-S9 clause + "P11-S9 design-system usage slice excludes other deferred families" scenario. All prior P11-S1..S8 scenarios preserved verbatim. Updated "(Previously:..." footnote.

### Canonical merge target verified:
- DIRECTORY form: `openspec/specs/react-pattern-analyzers/spec.md` — CORRECT
- No stray flat `react-pattern-analyzers.md` created — CONFIRMED
- Origin header updated to include `p11-s9-design-system-usage-surface-drift`
- All prior slice scenarios (P11-S4/S6/S7/S8 + Future analyzers) preserved — CONFIRMED

---

## Archive Contents

- explore.md ✓
- proposal.md ✓
- spec.md ✓
- design.md ✓
- tasks.md ✓ (7/7 tasks complete, all [x])
- verify-report.md ✓

---

## Archive Location

`openspec/changes/archive/2026-06-06-p11-s9-design-system-usage-surface-drift/`

Source folder `openspec/changes/p11-s9-design-system-usage-surface-drift/` remains on disk
(archive copies, does not move — per known pattern). Orchestrator should `rm -rf` the source
folder after confirming this archive is complete.

---

## Source of Truth Updated

`openspec/specs/react-pattern-analyzers/spec.md` now reflects P11-S1 through P11-S9 behavior:
- `react/compound-component-api-drift` (S1)
- `react/container-presenter-role-drift` (S2)
- `react/controlled-uncontrolled-prop-surface-drift` (S3)
- Generic pattern facts, no new analyzer (S4)
- `react/context-provider-value-surface-drift` (S5)
- `react/form-control-surface-drift` (S6)
- `react/data-fetching-surface-drift` (S7)
- `react/overlay-control-surface-drift` (S8)
- `react/design-system-usage-surface-drift` (S9) ← NEW

---

## WARNING reconciliation

**W1** (test under-enforcement for `runtime`/`library` substrings in explain forbidden-vocab test):
- The current explain text is already clean — this is a test-hardening gap, not a false-green.
- Status at archive: acknowledged as known gap. The verifier noted the fix is trivial
  (`expect(serialized).not.toMatch(/\bruntime\b/i)` etc.). Not blocking archive.

---

## SDD Cycle Complete

`p11-s9-design-system-usage-surface-drift` has been fully planned, implemented, verified, and archived.
The `react/design-system-usage-surface-drift` analyzer is live in `@rai/adapter-react`.
Next: P11-S10 (broad API conventions — the last deferred React pattern family).
