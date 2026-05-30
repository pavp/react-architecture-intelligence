# Archive Report: fix-ki1-component-detector

**Date**: 2026-05-30  
**Status**: COMPLETE — Change archived and closed  
**Promoted spec path**: `openspec/specs/parser-component-detection.md`  
**Archive path**: `openspec/changes/archive/2026-05-30-fix-ki1-component-detector/`  

---

## Executive Summary

The fix-ki1-component-detector change has been successfully implemented, tested, verified, and archived. The bug (false-positive admission of capitalized non-components like Next.js route handlers) has been fixed by adding a necessary `returnsJsx` condition to the deterministic parser. The change is isolated to the CODE tier, preserved the integrity model, and passed all gates. All SDD artifacts have been moved to the archive with the promoted capability spec preserved in the active specs folder.

---

## Change Summary

**What was fixed**: KI-1 — false-positive component detection (route handlers)  
**Root cause**: The parser admitted any capitalized function as a component based solely on name + arrow pattern, without checking for JSX presence. Non-JSX functions (e.g., Next.js route handlers returning `Response`) were admitted, collapsed to empty fingerprints, and triggered cosine-1.0 false positives in shared-extraction.

**Solution**: Added `returnsJsx: boolean` flag to `RenderFacts` interface. The parser now requires both:
1. Name condition: capitalized function name (`/^[A-Z]/`)
2. JSX condition: presence of at least one `JSXOpeningElement` in the function body (including wrappers like `memo` / `forwardRef`)

**Implementation**: ~8 net lines in `packages/core/src/parse/pass1.ts`:
- Interface: added `returnsJsx: boolean` to `RenderFacts` (line 159)
- Visitor: set `returnsJsx = true` in the existing `JSXOpeningElement` case (line 180)
- Guard: reject capitalized functions with `returnsJsx === false` inside `walkComponent` (line 32, one new line)

**Scope**: Single PR, ~76 changed lines total. Parser-only change; no cross-tier mutation.

---

## Final Verdict

**PASS** — 0 CRITICAL, 0 WARNING, 1 SUGGESTION

All 6 requirements satisfied. All 6 scenarios covered. All 8 tasks executed and verified.

---

## Gate Results (verbatim, from verify-report)

| Gate | Command | Result | Status |
|------|---------|--------|--------|
| test | `pnpm test` | Test Files 23 passed (23) / Tests 106 passed (106) | PASS |
| typecheck | `pnpm typecheck` | packages/core Done, packages/cli Done | PASS |
| build | `pnpm build` | packages/core Done, packages/cli Done | PASS |
| smoke | `./scripts/smoke.sh --build` | Result: 13 passed, 0 failed | PASS |

**Key metrics**:
- Pre-existing tests: 101 → All GREEN
- New tests added: 5 (1 fail-first route-handler, 2 regression unit, 1 golden e2e, 1 memo)
- Total tests: 106 (23 test files)
- Test duration: 1.38s
- Build output: zero errors

---

## Implementation Fidelity

| Invariant | Status | Evidence |
|-----------|--------|----------|
| `returnsJsx` on `RenderFacts` ONLY (not on `ComponentNode`) | PASS | types.ts unchanged; grep confirms only pass1.ts uses the field |
| Guard at single chokepoint inside `walkComponent` | PASS | pass1.ts:32 `if (!facts.returnsJsx) return;` covers both FunctionDeclaration and VariableDeclaration paths |
| Flat-walk invariant for forwardRef/memo | PASS | No function-boundary tracking; `collectRenderFacts` descends into all nodes regardless of nesting |
| No framework-specific logic (P6 invariant) | PASS | grep confirms zero matches for `next`, `remix`, `react-router` in pass1.ts |
| CODE-tier isolation | PASS | No writes to embed.ts, shared-extraction.ts, engine.ts, or downstream layers |
| Determinism | PASS | `returnsJsx` is a pure function of the AST; golden test passes (route-handler corpus → 0 findings) |

---

## Commits

| SHA | Message |
|-----|---------|
| 974d386 | `fix(parse): add returnsJsx guard to pass1 — KI-1 route-handler false positives` |
| 80ed6a8 | `docs: mark KI-1 fixed in STATUS.md and gaps.md` |

Both commits are on branch `feat/rai-mvp-p0-p3`, not pushed, no associated PR.

---

## Promoted Spec

**Path**: `openspec/specs/parser-component-detection.md`  
**Type**: Capability spec (RFC 2119)  
**Origin**: fix-ki1-component-detector (commit 974d386)

The spec documents the durable, framework-agnostic component-admission contract. It is a living spec (not a change log) and serves as reference for future parser enhancements.

**Key content**:
- Component admission requires both name and JSX conditions (REQ-1, REQ-2)
- forwardRef/memo wrappers are preserved via flat-walk invariant (REQ-3)
- Accepted residual: SC-5 inline-helper-arrow false-negative (documented, not a blocker)
- No framework-specific logic; P6 invariant preserved

---

## Accepted Residual (SC-5)

**Scenario**: An inline helper arrow returning JSX while the outer function returns `null` will be **admitted as a component** because the flat walk visits the inner JSX and sets `returnsJsx = true`.

**Example**:
```tsx
export const Outer = () => {
  const renderItem = (x: string) => <li>{x}</li>;  // inner JSX found
  return null;  // outer function renders nothing
};
```

`Outer` MAY be admitted as a component.

**Why accepted**:
- False-negative direction (keeps a non-component), NOT false positive
- Cannot resurrect KI-1 cosine-1.0 cascade (function carries JSX facts, non-empty embedding)
- Fixing requires function-depth/return-position tracking (structural enhancement, out of scope)
- Safe direction; can be tightened in future via P6 work

**Future path**: Add depth tracking to `collectRenderFacts` to distinguish outer-body JSX from nested-closure JSX.

---

## Non-Destructive Merge Note

The spec promoted into `openspec/specs/parser-component-detection.md` is **additive**. The `openspec/specs/` directory previously contained only `.gitkeep`; there were no existing KI-1 or parser specs to overwrite. The merge is non-destructive and does not require manual conflict resolution. All prior SDD artifacts for this change have been moved to the archive folder and are preserved as an audit trail.

---

## Archive Folder Structure

```
openspec/changes/archive/2026-05-30-fix-ki1-component-detector/
├── explore.md              (exploration phase: option B validated)
├── proposal.md             (change intent and scope)
├── spec.md                 (6 requirements, 6 scenarios)
├── design.md               (exact line refs, guard placement, flat-walk invariant)
├── tasks.md                (8 tasks: fail-first TDD, fixtures, golden test)
├── apply-progress.md       (all tasks done, 2 commits, gate results)
├── verify-report.md        (0 CRITICAL, 0 WARNING, 1 SUGGESTION; PASS verdict)
└── archive-report.md       (this file)
```

All files are committed to git and preserved as audit trail.

---

## Traceability

| Phase | Artifact | Topic Key (Engram) |
|-------|----------|-------------------|
| Explore | exploration output | `sdd/fix-ki1-component-detector/explore` |
| Propose | proposal.md | `sdd/fix-ki1-component-detector/proposal` |
| Spec | spec.md | `sdd/fix-ki1-component-detector/spec` |
| Design | design.md | `sdd/fix-ki1-component-detector/design` |
| Tasks | tasks.md | `sdd/fix-ki1-component-detector/tasks` |
| Apply | apply-progress.md | `sdd/fix-ki1-component-detector/apply-progress` |
| Verify | verify-report.md | `sdd/fix-ki1-component-detector/verify-report` |
| Archive | archive-report.md | `sdd/fix-ki1-component-detector/archive-report` |

All observations have been saved to Engram with full traceability.

---

## Next Steps

None. The change is complete, archived, and closed. The fixed behavior is now part of the codebase on branch `feat/rai-mvp-p0-p3`. Future steps (PR review, merge to main) are outside SDD scope.

If follow-up work is needed (e.g., depth-tracking enhancement for SC-5 tightening), a new `/sdd-new` change should be initiated with a fresh proposal.

---

**Report generated**: 2026-05-30 — sdd-archive phase  
**Author**: Archive executor  
**Status**: CLOSED
