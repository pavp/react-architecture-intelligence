import { expect, test } from "vitest";
import { buildGraph } from "./graph-build.js";
import { freezeGraph } from "../graph/repograph.js";

const A = `function Card({ title }) { return <div>{title}</div>; }
export default Card;`;
const B = `function Page() { return <Card title="x" />; }
export default Page;`;

test("collects components from multiple files", () => {
	const g = buildGraph([
		{ file: "Card.tsx", source: A },
		{ file: "Page.tsx", source: B },
	]);
	expect(g.components.map((c) => c.name).sort()).toEqual(["Card", "Page"]);
});

test("creates a renders edge Page -> Card", () => {
	const g = buildGraph([
		{ file: "Card.tsx", source: A },
		{ file: "Page.tsx", source: B },
	]);
	const page = g.components.find((c) => c.name === "Page")!;
	const card = g.components.find((c) => c.name === "Card")!;
	const edge = g.edges.find(
		(e) => e.kind === "renders" && e.srcId === page.id && e.dstId === card.id,
	);
	expect(edge).toBeDefined();
});

test("creates uses-hook edges for component consumers and hook composition", () => {
	const g = buildGraph([
		{
			file: "hooks.ts",
			source: `export function useCheckout() { useCart(); usePrice(); }
function useCart() { useState([]); }
function usePrice() { return 1; }`,
		},
		{
			file: "Page.tsx",
			source: `export function Page() { useCheckout(); return <div />; }`,
		},
	]);
	const page = g.components.find((c) => c.name === "Page")!;
	const checkout = g.hooks.find((h) => h.name === "useCheckout")!;
	const cart = g.hooks.find((h) => h.name === "useCart")!;
	const price = g.hooks.find((h) => h.name === "usePrice")!;

	expect(g.edges).toContainEqual({
		srcId: page.id,
		dstId: checkout.id,
		kind: "uses-hook",
	});
	expect(g.edges).toContainEqual({
		srcId: checkout.id,
		dstId: cart.id,
		kind: "uses-hook",
	});
	expect(g.edges).toContainEqual({
		srcId: checkout.id,
		dstId: price.id,
		kind: "uses-hook",
	});
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
  const view = makeView(Button);
  useReady(view);
  return <Button enabled label="Save" {...view.props} />;
}`;
	const first = buildGraph([{ file: "Page.tsx", source }]);
	const second = buildGraph([{ file: "Page.tsx", source }]);

	expect(first.patternFacts).toEqual(second.patternFacts);
	expect(first.patternFacts).toContainEqual(
		expect.objectContaining({
			kind: "call-binding",
			local: "view",
			callee: "makeView",
		}),
	);
	expect(first.patternFacts).toContainEqual(
		expect.objectContaining({
			kind: "call-argument",
			callee: "useReady",
			argumentIndex: 0,
			argument: "view",
		}),
	);
	expect(first.patternFacts).toContainEqual(
		expect.objectContaining({
			kind: "jsx-attribute",
			tag: "Button",
			name: "label",
			value: "Save",
		}),
	);
	expect(first.patternFacts.map((fact) => fact.id)).toEqual(
		[...first.patternFacts.map((fact) => fact.id)].sort(),
	);
	expect(new Set(first.patternFacts.map((fact) => fact.id)).size).toBe(
		first.patternFacts.length,
	);
	expect(JSON.parse(JSON.stringify(first.patternFacts))).toEqual(
		first.patternFacts,
	);
});

// ── G1: relative import resolves to known module → edge emitted ────────────
test("G1: relative import resolves to known module emits imports edge", () => {
	const g = buildGraph([
		{ file: "A.tsx", source: `import { foo } from "./B";` },
		{ file: "B.tsx", source: `export const foo = 1;` },
	]);
	const importEdge = g.edges.find(
		(e) => e.kind === "imports" && e.srcId === "A.tsx" && e.dstId === "B.tsx",
	);
	expect(importEdge).toBeDefined();
});

test("G1: imports edge has exactly srcId, dstId, kind — no extra fields", () => {
	const g = buildGraph([
		{ file: "A.tsx", source: `import { foo } from "./B";` },
		{ file: "B.tsx", source: `export const foo = 1;` },
	]);
	const importEdge = g.edges.find(
		(e) => e.kind === "imports" && e.srcId === "A.tsx" && e.dstId === "B.tsx",
	);
	expect(importEdge).toBeDefined();
	expect(Object.keys(importEdge!).sort()).toEqual(["dstId", "kind", "srcId"]);
});

// ── G2: extension probe + index-file resolution ─────────────────────────────
test("G2a: import without extension resolves via .ts extension probe", () => {
	const g = buildGraph([
		{ file: "src/A.tsx", source: `import { x } from "./utils";` },
		{ file: "src/utils.ts", source: `export const x = 1;` },
	]);
	expect(g.edges).toContainEqual({ srcId: "src/A.tsx", dstId: "src/utils.ts", kind: "imports" });
});

test("G2b: import without extension resolves via index file when no direct file", () => {
	const g = buildGraph([
		{ file: "src/A.tsx", source: `import { x } from "./ui";` },
		{ file: "src/ui/index.ts", source: `export const x = 1;` },
	]);
	expect(g.edges).toContainEqual({ srcId: "src/A.tsx", dstId: "src/ui/index.ts", kind: "imports" });
});

test("G2c: file beats index — both ui.ts and ui/index.ts present, edge to ui.ts", () => {
	const g = buildGraph([
		{ file: "src/A.tsx", source: `import { x } from "./ui";` },
		{ file: "src/ui.ts", source: `export const x = 1;` },
		{ file: "src/ui/index.ts", source: `export const y = 2;` },
	]);
	const importEdges = g.edges.filter((e) => e.kind === "imports" && e.srcId === "src/A.tsx");
	expect(importEdges).toHaveLength(1);
	expect(importEdges[0]!.dstId).toBe("src/ui.ts");
});

// ── G3: external/package imports → no edge ──────────────────────────────────
test("G3: external package imports produce no imports edges", () => {
	const g = buildGraph([
		{
			file: "A.tsx",
			source: `import React from "react"; import { x } from "@scope/pkg"; import merge from "lodash/merge";`,
		},
		{ file: "B.tsx", source: `export const x = 1;` },
	]);
	expect(g.edges.filter((e) => e.kind === "imports")).toHaveLength(0);
});

// ── G4: unresolved relative → no edge, no throw ─────────────────────────────
test("G4: unresolved relative import produces no edge and does not throw", () => {
	expect(() => {
		const g = buildGraph([
			{ file: "A.tsx", source: `import { x } from "../missing/file";` },
		]);
		expect(g.edges.filter((e) => e.kind === "imports")).toHaveLength(0);
	}).not.toThrow();
});

// ── G5: dedup — multiple statements between same pair → one edge ─────────────
test("G5a: two import statements targeting same module → exactly one imports edge", () => {
	const g = buildGraph([
		{
			file: "A.tsx",
			source: `import { foo } from "./B"; import { bar } from "./B";`,
		},
		{ file: "B.tsx", source: `export const foo = 1; export const bar = 2;` },
	]);
	const importEdges = g.edges.filter(
		(e) => e.kind === "imports" && e.srcId === "A.tsx" && e.dstId === "B.tsx",
	);
	expect(importEdges).toHaveLength(1);
});

// ── G6: self-import suppressed ───────────────────────────────────────────────
test("G6: self-import produces no imports edge", () => {
	const g = buildGraph([
		{ file: "A.tsx", source: `import { x } from "./A";` },
	]);
	expect(g.edges.filter((e) => e.kind === "imports" && e.srcId === e.dstId)).toHaveLength(0);
});

// ── G7: bidirectional cycle — both edges emitted ────────────────────────────
test("G7: bidirectional import cycle emits both directed edges", () => {
	const g = buildGraph([
		{ file: "A.tsx", source: `import { b } from "./B";` },
		{ file: "B.tsx", source: `import { a } from "./A";` },
	]);
	expect(g.edges).toContainEqual({ srcId: "A.tsx", dstId: "B.tsx", kind: "imports" });
	expect(g.edges).toContainEqual({ srcId: "B.tsx", dstId: "A.tsx", kind: "imports" });
});

// ── G8: deterministic ordering ───────────────────────────────────────────────
test("G8: buildGraph produces identical edge order on repeated calls", () => {
	const files = [
		{ file: "A.tsx", source: `import { b } from "./B"; import { c } from "./C";` },
		{ file: "B.tsx", source: `import { c } from "./C";` },
		{ file: "C.tsx", source: `export const c = 1;` },
	];
	const g1 = buildGraph(files);
	const g2 = buildGraph(files);
	expect(g1.edges).toEqual(g2.edges);
});

// ── G9: over-pop / escaping-root → no edge ──────────────────────────────────
test("G9a: root importer ../x with root x.ts present → no imports edge (escapes scan boundary)", () => {
	const g = buildGraph([
		{ file: "A.tsx", source: `import { x } from "../x";` },
		{ file: "x.ts", source: `export const x = 1;` },
	]);
	expect(g.edges.filter((e) => e.kind === "imports")).toHaveLength(0);
});

test("G9b: ../../B from src/A.tsx with root B.ts present → no imports edge (escapes scan boundary)", () => {
	const g = buildGraph([
		{ file: "src/A.tsx", source: `import { b } from "../../B";` },
		{ file: "B.ts", source: `export const b = 1;` },
	]);
	expect(g.edges.filter((e) => e.kind === "imports")).toHaveLength(0);
});

// ── G10: legitimate .. traversal still works ─────────────────────────────────
test("G10: src/feat/A.tsx importing ../util resolves to src/util.ts → edge emitted", () => {
	const g = buildGraph([
		{ file: "src/feat/A.tsx", source: `import { u } from "../util";` },
		{ file: "src/util.ts", source: `export const u = 1;` },
	]);
	expect(g.edges).toContainEqual({ srcId: "src/feat/A.tsx", dstId: "src/util.ts", kind: "imports" });
});

// ── G11: multi-specifier single statement → exactly one edge ─────────────────
test("G11: one import statement with multiple specifiers from ./B → exactly one A→B edge", () => {
	const g = buildGraph([
		{ file: "A.tsx", source: `import { a, b, c } from "./B";` },
		{ file: "B.tsx", source: `export const a = 1; export const b = 2; export const c = 3;` },
	]);
	const importEdges = g.edges.filter(
		(e) => e.kind === "imports" && e.srcId === "A.tsx" && e.dstId === "B.tsx",
	);
	expect(importEdges).toHaveLength(1);
});

test("freezes graph pattern facts", () => {
	const frozen = freezeGraph(buildGraph([{ file: "Page.tsx", source: B }]));
	const firstFact = frozen.patternFacts[0]!;

	expect(Object.isFrozen(frozen.patternFacts)).toBe(true);
	expect(Object.isFrozen(firstFact)).toBe(true);
	expect(() => {
		(frozen.patternFacts as unknown[]).push(firstFact);
	}).toThrow(TypeError);
	expect(() => {
		(firstFact as { id: string }).id = "mutated";
	}).toThrow(TypeError);
});
