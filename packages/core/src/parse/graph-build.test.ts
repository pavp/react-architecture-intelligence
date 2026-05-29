import { expect, test } from "vitest";
import { buildGraph } from "./graph-build.js";

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

test("modules carry a content hash", () => {
  const g = buildGraph([{ file: "Card.tsx", source: A }]);
  expect(g.modules[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);
});
