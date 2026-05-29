import { expect, test } from "vitest";
import { structuralFingerprint } from "./structural.js";
import type { ComponentNode } from "../types.js";

function comp(over: Partial<ComponentNode>): ComponentNode {
  return {
    id: "x", name: "C", file: "f", kind: "fn", exportKind: "none",
    span: { file: "f", start: 0, end: 1, kind: "component", astPath: "p" },
    propNames: [], hookCalls: [], childComponents: [], compositionMarkers: [], conditionalBranches: 0,
    ...over,
  };
}

test("same shape -> same fingerprint regardless of order", () => {
  const a = comp({ propNames: ["a", "b"], hookCalls: ["useX", "useY"], childComponents: ["Z"] });
  const b = comp({ propNames: ["b", "a"], hookCalls: ["useY", "useX"], childComponents: ["Z"] });
  expect(structuralFingerprint(a)).toBe(structuralFingerprint(b));
});

test("different prop set -> different fingerprint", () => {
  const a = comp({ propNames: ["a"] });
  const b = comp({ propNames: ["a", "c"] });
  expect(structuralFingerprint(a)).not.toBe(structuralFingerprint(b));
});

test("adding a conditional branch -> different fingerprint", () => {
  expect(structuralFingerprint(comp({ conditionalBranches: 0 })))
    .not.toBe(structuralFingerprint(comp({ conditionalBranches: 1 })));
});

test("composition marker changes the fingerprint", () => {
  expect(structuralFingerprint(comp({ compositionMarkers: [] })))
    .not.toBe(structuralFingerprint(comp({ compositionMarkers: ["memo"] })));
});

test("prop TYPES are irrelevant (only names matter) — body excluded", () => {
  const a = comp({ propNames: ["a"], name: "Foo", id: "1" });
  const b = comp({ propNames: ["a"], name: "Bar", id: "2" });
  expect(structuralFingerprint(a)).toBe(structuralFingerprint(b));
});
