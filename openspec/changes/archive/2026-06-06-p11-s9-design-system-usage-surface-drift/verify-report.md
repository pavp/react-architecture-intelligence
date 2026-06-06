# Verify Report: P11-S9 — react/design-system-usage-surface-drift

Phase: verify · Persistence: hybrid · Engram topic: `sdd/p11-s9-design-system-usage-surface-drift/verify-report`

## Verdict: PASS WITH WARNINGS

0 CRITICAL · 1 WARNING · 2 SUGGESTIONS

## Verification gate (run by verifier — exact results)

| Check | Result |
|-------|--------|
| `pnpm test` | 66 files / 516 tests — ALL PASS |
| `pnpm typecheck` | PASS (all 4 packages Done) |
| `pnpm build` | PASS (exit 0) |
| `node scripts/check-core-framework-free.mjs` | PASS (exit 0) |
| `git diff --check` | CLEAN (exit 0) |
| `git diff --stat packages/core` | ZERO changed lines (no `@rai/core` change) |
| grep impl `components`/`ComponentNode` | only in COMMENTS (lines 47-49, 226); NEVER imported, NEVER dereferenced |

## CENTRAL RULING — Groundability: BOUNDED (not smuggled)

Full serialized explain (Button finding):
- `summary` embeds `VARIANT_PROPS_LIST` = "appearance/color/intent/size/tone/variant" and `RAW_STYLE_PROPS_LIST` = "className/style" as **bare prop-name tokens**, framed as "variant-family prop names" / "raw-style prop names" — RAI's own observation-category labels for the literal prop names, NOT a design-system-membership or component-library claim.
- No DS-membership / library / theming / override / runtime / remediation claim anywhere.
- `limits[]` phrase disclaimers WITHOUT banned substrings: "which package a component comes from" (avoids `library`), "what these props do when the app runs" (avoids `runtime`), "whether the observed difference is intended".
- Serialized JSON passes the FULL banned set incl. the bare `runtime` and `library/libraries` substrings the design flagged as risky.

Genuinely bounded — NOT a false-green. The text describes ONLY observed prop names + capitalized non-dotted tag names co-appearing in the file.

## CENTRAL RULING — Non-overlap with P11-S3: ENFORCED + PROVEN (non-hollow)

- **Code**: `analyze()` reads ONLY `ctx.graph.patternFacts` (line 52). `ComponentNode` NOT imported. `ctx.graph.components` NEVER dereferenced. S3 (`controlled-uncontrolled-prop-surface-drift.ts`) imports `ComponentNode` + reads `ctx.graph.components` — confirmed disjoint domain.
- **Tests NON-HOLLOW**: "NON-OVERLAP S3" (test 1, line 210) populates `components=[{Button, propNames:[variant,className,size,style]}]` + provides only 1 JSX usage → `toEqual([])`. Tests 2-3 (lines 226, 236) populate components with variant/className/style propNames + <2 divergent usages → `[]`. EMITS tests pass `components=[]` (default) → emission driven by JSX facts alone. Proven from both directions.

## Other rulings

| Criterion | Ruling | Evidence |
|-----------|--------|----------|
| Cross-usage gate | CORRECT | single-both SILENT (74); distinct variant+className EMIT (19); uniform-variant SILENT (85); uniform-raw SILENT (96); all-both SILENT (107); <2 usages SILENT (121); no-variant SILENT (132); no-raw SILENT (143). Gate: `someVariant && someRaw && (hasVariantOnly \|\| hasRawOnly)` (lines 263-271). All assert COUNT (`toEqual([])`/`toHaveLength`). |
| Tag guard | CORRECT | first-char-uppercase (`!== toLowerCase` rejects non-letters) AND `!tag.includes(".")`. lowercase native SILENT (156, 167); dotted member SILENT (180, 191). |
| Determinism + fingerprints | OK | structural = sha(JSON of ruleId/file/divergenceTypes/divergentTags/observed props) span-free; positional = sha([file,start,end]); nominal = sha(file). Span anchor = lowest span.start. severity count>1?warn:info. Forward-vs-reversed identical (305); structural stable + positional differs on span shift (322); frozen-facts unmutated (349). divergentTags extraction COLON-SAFE. |
| Spec/code/design agreement | YES — no 3-way drift | usage-site jsx-only, per-tag cross-usage gate, VARIANT/RAW sets, capitalized-non-dotted guard, file-scoped, severity by divergent-tag count, zero core change, no new MCP tool. |

## WARNING (1)

**W1** — `design-system-usage-surface-drift.test.ts:413-418`: the explain forbidden-vocab test OMITS the `runtime` and `library/libraries?` substrings that design ADR-6 / tasks 4.1 (§10 case 15) prescribed (`/...|runtime|libraries?/i`). The current explain text passes even the stricter design regex (uses "app runs"/"package"), so this is **NOT a false-green today** — but the test under-enforces vs the design contract, leaving those substrings unguarded against future wording regressions. Fix: add `expect(serialized).not.toMatch(/\bruntime\b/i)` and `expect(serialized).not.toMatch(/\blibrar(?:y|ies)\b/i)`.

## SUGGESTIONS (2)

- **S1** — `divergenceCount` (= `exceeded.length`) drives both the metric and severity; it only ever counts divergent TAGS (1 token per tag). Correct per spec, but a one-line comment clarifying "divergenceCount == divergent-tag count" would aid future readers.
- **S2** — role names emitted are `ds-element` / `variant-prop-binding` / `raw-style-binding`; tasks.md 2.15 draft mentioned `styled-element` / `variant-prop` / `raw-style-prop`. Cosmetic divergence from the task draft; behavior unaffected (roles not asserted). No action required.

## ARCHIVE MERGE TARGET CAVEAT (must heed)

The delta merges into the EXISTING canonical DIRECTORY-form spec `openspec/specs/react-pattern-analyzers/spec.md` — NOT a new flat `react-pattern-analyzers.md` file (this mis-merge happened on P11-S6, corrected on S7/S8). The MODIFIED "Deferred React Pattern Families Stay Scoped by Slice" requirement REPLACES in place, preserving ALL prior P11-S1..S8 scenarios and adding P11-S9 clause + "P11-S9 design-system usage slice excludes other deferred families" scenario. The 3 ADDED requirements append.

## next_recommended: sdd-archive (heed the merge-target caveat above)
