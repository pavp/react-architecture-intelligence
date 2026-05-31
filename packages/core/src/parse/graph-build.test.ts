import { expect, test } from "vitest";
import { buildGraph } from "./graph-build.js";
import { freezeGraph } from "../graph/repograph.js";

const A = `function Card({ title }) { return <div>{title}</div>; }
export default Card;`;
const B = `function Page() { return <Card title="x" />; }
export default Page;`;

test("collects components from multiple files", () => {
  const g = buildGraph([{ file: "Card.tsx", source: A }, { file: "Page.tsx", source: B }]);
  expect(g.components.map((c) => c.name).sort()).toEqual(["Card", "Page"]);
});

test("creates a renders edge Page -> Card", () => {
  const g = buildGraph([{ file: "Card.tsx", source: A }, { file: "Page.tsx", source: B }]);
  const page = g.components.find((c) => c.name === "Page")!;
  const card = g.components.find((c) => c.name === "Card")!;
  const edge = g.edges.find((e) => e.kind === "renders" && e.srcId === page.id && e.dstId === card.id);
  expect(edge).toBeDefined();
});

test("creates uses-hook edges for component consumers and hook composition", () => {
  const g = buildGraph([
    { file: "hooks.ts", source: `export function useCheckout() { useCart(); usePrice(); }
function useCart() { useState([]); }
function usePrice() { return 1; }` },
    { file: "Page.tsx", source: `export function Page() { useCheckout(); return <div />; }` },
  ]);
  const page = g.components.find((c) => c.name === "Page")!;
  const checkout = g.hooks.find((h) => h.name === "useCheckout")!;
  const cart = g.hooks.find((h) => h.name === "useCart")!;
  const price = g.hooks.find((h) => h.name === "usePrice")!;

  expect(g.edges).toContainEqual({ srcId: page.id, dstId: checkout.id, kind: "uses-hook" });
  expect(g.edges).toContainEqual({ srcId: checkout.id, dstId: cart.id, kind: "uses-hook" });
  expect(g.edges).toContainEqual({ srcId: checkout.id, dstId: price.id, kind: "uses-hook" });
});

test("modules carry a content hash", () => {
  const g = buildGraph([{ file: "Card.tsx", source: A }]);
  expect(g.modules[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);
});

test("carries sorted deduped JSON-safe pattern facts", () => {
  const source = `
import { Button } from "ui";
export { Button };
export function Page() {
  useReady();
  return <Button />;
}`;
  const first = buildGraph([{ file: "Page.tsx", source }]);
  const second = buildGraph([{ file: "Page.tsx", source }]);

  expect(first.patternFacts).toEqual(second.patternFacts);
  expect(first.patternFacts.map((fact) => fact.id)).toEqual([...first.patternFacts.map((fact) => fact.id)].sort());
  expect(new Set(first.patternFacts.map((fact) => fact.id)).size).toBe(first.patternFacts.length);
  expect(JSON.parse(JSON.stringify(first.patternFacts))).toEqual(first.patternFacts);
});

test("freezes graph pattern facts", () => {
  const frozen = freezeGraph(buildGraph([{ file: "Page.tsx", source: B }]));
  const firstFact = frozen.patternFacts[0]!;

  expect(Object.isFrozen(frozen.patternFacts)).toBe(true);
  expect(Object.isFrozen(firstFact)).toBe(true);
  expect(() => { (frozen.patternFacts as unknown[]).push(firstFact); }).toThrow(TypeError);
  expect(() => { (firstFact as { id: string }).id = "mutated"; }).toThrow(TypeError);
});
