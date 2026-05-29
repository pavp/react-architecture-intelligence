import { expect, test } from "vitest";
import { layeredFingerprint } from "./layered.js";
import type { ComponentNode } from "../types.js";

function comp(over: Partial<ComponentNode>): ComponentNode {
  return {
    id: "x", name: "C", file: "f.tsx", kind: "fn", exportKind: "default",
    span: { file: "f.tsx", start: 0, end: 1, kind: "component", astPath: "p" },
    propNames: ["a"], hookCalls: [], childComponents: [], compositionMarkers: [], conditionalBranches: 0,
    ...over,
  };
}

test("produces all three layers", () => {
  const fp = layeredFingerprint(comp({}));
  expect(fp.structural).toMatch(/^[0-9a-f]{64}$/);
  expect(fp.nominal).toMatch(/^[0-9a-f]{64}$/);
  expect(fp.positional).toMatch(/^[0-9a-f]{64}$/);
});

test("rename changes nominal but NOT structural", () => {
  const a = layeredFingerprint(comp({ name: "Old" }));
  const b = layeredFingerprint(comp({ name: "New" }));
  expect(a.structural).toBe(b.structural);
  expect(a.nominal).not.toBe(b.nominal);
});

test("moving file changes positional but NOT structural", () => {
  const a = layeredFingerprint(comp({ file: "old/f.tsx", span: { file: "old/f.tsx", start: 0, end: 1, kind: "component", astPath: "p" } }));
  const b = layeredFingerprint(comp({ file: "new/f.tsx", span: { file: "new/f.tsx", start: 0, end: 1, kind: "component", astPath: "p" } }));
  expect(a.structural).toBe(b.structural);
  expect(a.positional).not.toBe(b.positional);
});
