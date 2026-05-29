import { expect, test } from "vitest";
import { embedComponent, EMBED_MODEL_VERSION, cosine } from "./embed.js";
import type { ComponentNode } from "../types.js";

function comp(over: Partial<ComponentNode>): ComponentNode {
  return {
    id: "x", name: "C", file: "f", kind: "fn", exportKind: "none",
    span: { file: "f", start: 0, end: 1, kind: "component", astPath: "p" },
    propNames: [], hookCalls: [], childComponents: [], compositionMarkers: [], conditionalBranches: 0,
    ...over,
  };
}

test("embedding is deterministic for the same component", () => {
  const a = comp({ propNames: ["label", "onClick"], hookCalls: ["useTheme"] });
  expect(embedComponent(a)).toEqual(embedComponent(a));
});

test("model version is exposed", () => {
  expect(typeof EMBED_MODEL_VERSION).toBe("string");
});

test("similar components have higher cosine than dissimilar ones", () => {
  const a = comp({ propNames: ["label", "onClick", "variant"], hookCalls: ["useTheme"] });
  const b = comp({ propNames: ["label", "onClick", "size"], hookCalls: ["useTheme"] });
  const c = comp({ propNames: ["rows", "columns", "onSort"], hookCalls: ["useTable", "usePagination"] });
  expect(cosine(embedComponent(a), embedComponent(b))).toBeGreaterThan(cosine(embedComponent(a), embedComponent(c)));
});

test("identical-shape components have cosine 1", () => {
  const a = comp({ propNames: ["x"], hookCalls: ["useY"] });
  const b = comp({ propNames: ["x"], hookCalls: ["useY"] });
  expect(cosine(embedComponent(a), embedComponent(b))).toBeCloseTo(1, 6);
});
