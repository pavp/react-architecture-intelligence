import { describe, expect, it, test } from "vitest";
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

// ── P1: one non-spread prop → one passes edge ───────────────────────────────
describe("P1: one non-spread prop emits one passes edge", () => {
	const iconSrc = `export function Icon({ size }: { size: number }) { return <svg />; }`;
	const btnSrc = `import { Icon } from "./Icon";
export function Button() { return <Icon size={16} />; }`;

	it("emits exactly one passes edge from Button to Icon with propNames:[size]", () => {
		const g = buildGraph([
			{ file: "Icon.tsx", source: iconSrc },
			{ file: "Button.tsx", source: btnSrc },
		]);
		const btn = g.components.find((c) => c.name === "Button")!;
		const icon = g.components.find((c) => c.name === "Icon")!;
		const passEdges = g.edges.filter((e) => e.kind === "passes");
		expect(passEdges).toHaveLength(1);
		expect(passEdges[0]).toMatchObject({
			srcId: btn.id,
			dstId: icon.id,
			kind: "passes",
			propNames: ["size"],
		});
	});
});

// ── P2: multiple props sorted unique ────────────────────────────────────────
describe("P2: multiple props produce sorted unique propNames", () => {
	const avatarSrc = `export function Avatar({ name, size, theme }: any) { return <div />; }`;
	const cardSrc = `import { Avatar } from "./Avatar";
export function Card() { return <Avatar name="x" size={32} theme="dark" />; }`;

	it("emits one passes edge with sorted propNames", () => {
		const g = buildGraph([
			{ file: "Avatar.tsx", source: avatarSrc },
			{ file: "Card.tsx", source: cardSrc },
		]);
		const card = g.components.find((c) => c.name === "Card")!;
		const avatar = g.components.find((c) => c.name === "Avatar")!;
		const passEdges = g.edges.filter((e) => e.kind === "passes");
		expect(passEdges).toHaveLength(1);
		expect(passEdges[0]).toMatchObject({
			srcId: card.id,
			dstId: avatar.id,
			kind: "passes",
			propNames: ["name", "size", "theme"],
		});
	});
});

// ── P3: spread-only → no passes edge ────────────────────────────────────────
describe("P3: spread-only props produce no passes edge", () => {
	const childSrc = `export function Child(props: any) { return <div />; }`;
	const wrapperSrc = `import { Child } from "./Child";
export function Wrapper(props: any) { return <Child {...props} />; }`;

	it("emits zero passes edges when only spread attrs present", () => {
		const g = buildGraph([
			{ file: "Child.tsx", source: childSrc },
			{ file: "Wrapper.tsx", source: wrapperSrc },
		]);
		expect(g.edges.filter((e) => e.kind === "passes")).toHaveLength(0);
	});
});

// ── P4: renders with no props → no passes edge; renders edge still present ──
describe("P4: child rendered with zero attributes — no passes edge", () => {
	const badgeSrc = `export function Badge() { return <span />; }`;
	const parentSrc = `import { Badge } from "./Badge";
export function Parent() { return <Badge />; }`;

	it("emits zero passes edges and still has the renders edge", () => {
		const g = buildGraph([
			{ file: "Badge.tsx", source: badgeSrc },
			{ file: "Parent.tsx", source: parentSrc },
		]);
		const parent = g.components.find((c) => c.name === "Parent")!;
		const badge = g.components.find((c) => c.name === "Badge")!;
		expect(g.edges.filter((e) => e.kind === "passes")).toHaveLength(0);
		expect(g.edges).toContainEqual({ srcId: parent.id, dstId: badge.id, kind: "renders" });
	});
});

// ── P5: ambiguity guard — two components same file → no passes edge ──────────
describe("P5: two components in same file rendering same child — no passes edge", () => {
	const iconSrc2 = `export function Icon({ size }: any) { return <svg />; }`;
	const multiSrc = `import { Icon } from "./Icon";
export function Foo() { return <Icon size={16} />; }
export function Bar() { return <Icon size={24} />; }`;

	it("emits zero passes edges for the ambiguous tag", () => {
		const g = buildGraph([
			{ file: "Icon.tsx", source: iconSrc2 },
			{ file: "multi.tsx", source: multiSrc },
		]);
		const passEdgesForIcon = g.edges.filter(
			(e) => e.kind === "passes" && e.dstId === g.components.find((c) => c.name === "Icon")!.id,
		);
		expect(passEdgesForIcon).toHaveLength(0);
	});

	it("does not throw", () => {
		expect(() =>
			buildGraph([
				{ file: "Icon.tsx", source: iconSrc2 },
				{ file: "multi.tsx", source: multiSrc },
			]),
		).not.toThrow();
	});
});

// ── P6: unresolved dst → no edge, no throw ──────────────────────────────────
describe("P6: unresolved tag (not in byName) produces no edge and no throw", () => {
	const hostSrc = `export function Host() { return <UnknownWidget label="x" />; }`;

	it("does not throw", () => {
		expect(() => buildGraph([{ file: "Host.tsx", source: hostSrc }])).not.toThrow();
	});

	it("emits zero passes edges", () => {
		const g = buildGraph([{ file: "Host.tsx", source: hostSrc }]);
		expect(g.edges.filter((e) => e.kind === "passes")).toHaveLength(0);
	});
});

// ── P7: multiple call-sites → ONE edge with merged sorted propNames ──────────
describe("P7: multiple call-sites to same child — one passes edge with merged propNames", () => {
	const fieldSrc = `export function Field(props: any) { return <div />; }`;
	const formSrc = `import { Field } from "./Field";
export function Form({ isRequired }: any) {
  if (isRequired) return <Field label="Name" required />;
  return <Field label="Name" />;
}`;

	it("emits exactly one passes edge from Form to Field", () => {
		const g = buildGraph([
			{ file: "Field.tsx", source: fieldSrc },
			{ file: "Form.tsx", source: formSrc },
		]);
		const passEdges = g.edges.filter((e) => e.kind === "passes");
		expect(passEdges).toHaveLength(1);
	});

	it("propNames is sorted union of all call-site props", () => {
		const g = buildGraph([
			{ file: "Field.tsx", source: fieldSrc },
			{ file: "Form.tsx", source: formSrc },
		]);
		const edge = g.edges.find((e) => e.kind === "passes")!;
		expect(edge.propNames).toEqual(["label", "required"]);
	});
});

// ── P8: edge shape, determinism, freezeGraph no throw ───────────────────────
describe("P8: edge shape, determinism, and freezeGraph compatibility", () => {
	const itemSrc = `export function Item({ id, label }: any) { return <li />; }`;
	const listSrc = `import { Item } from "./Item";
export function List() { return <Item id={1} label="x" />; }`;

	it("passes edge has exactly {srcId, dstId, kind, propNames}", () => {
		const g = buildGraph([
			{ file: "Item.tsx", source: itemSrc },
			{ file: "List.tsx", source: listSrc },
		]);
		const edge = g.edges.find((e) => e.kind === "passes")!;
		expect(Object.keys(edge).sort()).toEqual(["dstId", "kind", "propNames", "srcId"]);
	});

	it("buildGraph produces identical passes edges on repeated calls", () => {
		const files = [
			{ file: "Item.tsx", source: itemSrc },
			{ file: "List.tsx", source: listSrc },
		];
		const g1 = buildGraph(files);
		const g2 = buildGraph(files);
		const p1 = g1.edges.filter((e) => e.kind === "passes");
		const p2 = g2.edges.filter((e) => e.kind === "passes");
		expect(p1).toEqual(p2);
	});

	it("freezeGraph does not throw when passes edges present", () => {
		const g = buildGraph([
			{ file: "Item.tsx", source: itemSrc },
			{ file: "List.tsx", source: listSrc },
		]);
		expect(() => freezeGraph(g)).not.toThrow();
	});

	it("passes edge is JSON-safe", () => {
		const g = buildGraph([
			{ file: "Item.tsx", source: itemSrc },
			{ file: "List.tsx", source: listSrc },
		]);
		const edge = g.edges.find((e) => e.kind === "passes")!;
		expect(JSON.parse(JSON.stringify(edge))).toEqual(edge);
	});
});

// ── P9: mixed spread and named props → only named prop names emitted ─────────
describe("P9: mixed spread and named props keeps named, drops spread", () => {
	const fieldSrc = `export function Field({ label }: any) { return <input />; }`;
	const formSrc = `import { Field } from "./Field";
export function Form(props: any) { return <Field {...props} label="x" />; }`;

	it("emits one passes edge with only the named prop", () => {
		const g = buildGraph([
			{ file: "Field.tsx", source: fieldSrc },
			{ file: "Form.tsx", source: formSrc },
		]);
		const form = g.components.find((c) => c.name === "Form")!;
		const field = g.components.find((c) => c.name === "Field")!;
		const passEdges = g.edges.filter((e) => e.kind === "passes");
		expect(passEdges).toHaveLength(1);
		expect(passEdges[0]).toMatchObject({
			srcId: form.id,
			dstId: field.id,
			kind: "passes",
			propNames: ["label"],
		});
	});
});

// ── C1: named import identifier call → calls edge ────────────────────────────
describe("C1: named import identifier call emits calls edge", () => {
	it("emits exactly one calls edge from caller to math module", () => {
		const g = buildGraph([
			{ file: "math.ts", source: `export function add(a: number, b: number) { return a + b; }` },
			{ file: "App.tsx", source: `import { add } from "./math"; add(1, 2);` },
		]);
		const callEdges = g.edges.filter((e) => e.kind === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0]).toMatchObject({ srcId: "App.tsx", dstId: "math.ts", kind: "calls" });
	});

	it("calls edge has exactly {srcId, dstId, kind} — no propNames or extra fields", () => {
		const g = buildGraph([
			{ file: "math.ts", source: `export function add(a: number, b: number) { return a + b; }` },
			{ file: "App.tsx", source: `import { add } from "./math"; add(1, 2);` },
		]);
		const callEdge = g.edges.find((e) => e.kind === "calls");
		expect(callEdge).toBeDefined();
		expect(Object.keys(callEdge!).sort()).toEqual(["dstId", "kind", "srcId"]);
	});
});

// ── C2: default import call → calls edge ─────────────────────────────────────
describe("C2: default import call emits calls edge", () => {
	it("emits a calls edge when the default import is called", () => {
		const g = buildGraph([
			{ file: "foo.ts", source: `export default function foo() {}` },
			{ file: "App.tsx", source: `import foo from "./foo"; foo();` },
		]);
		const callEdges = g.edges.filter((e) => e.kind === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0]).toMatchObject({ srcId: "App.tsx", dstId: "foo.ts", kind: "calls" });
	});
});

// ── C3: namespace import + prefix call → calls edge ──────────────────────────
describe("C3: namespace import method call emits calls edge via prefix match", () => {
	it("emits a calls edge when utils.format() is called via namespace import", () => {
		const g = buildGraph([
			{ file: "utils.ts", source: `export function format(x: string) { return x; }` },
			{ file: "App.tsx", source: `import * as utils from "./utils"; utils.format("x");` },
		]);
		const callEdges = g.edges.filter((e) => e.kind === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0]).toMatchObject({ srcId: "App.tsx", dstId: "utils.ts", kind: "calls" });
	});
});

// ── C4: call-binding fact → calls edge ───────────────────────────────────────
describe("C4: call-binding fact contributes calls edge", () => {
	it("emits a calls edge from the call-binding fact", () => {
		const g = buildGraph([
			{ file: "factory.ts", source: `export function create(cfg: any) { return cfg; }` },
			{ file: "App.tsx", source: `import { create } from "./factory"; const obj = create({});` },
		]);
		const callEdges = g.edges.filter((e) => e.kind === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0]).toMatchObject({ srcId: "App.tsx", dstId: "factory.ts", kind: "calls" });
	});
});

// ── C5: same-file call → no edge ─────────────────────────────────────────────
describe("C5: same-file call produces no calls edge", () => {
	it("emits zero calls edges when callee is defined in same file", () => {
		const g = buildGraph([
			{ file: "App.tsx", source: `function helper() {} helper();` },
		]);
		expect(g.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
	});
});

// ── C6: external package call → no edge ──────────────────────────────────────
describe("C6: external package call produces no calls edge", () => {
	it("emits zero calls edges for non-relative import sources", () => {
		const g = buildGraph([
			{ file: "App.tsx", source: `import { render } from "react-dom"; render(<div />, document.body);` },
		]);
		expect(g.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
	});
});

// ── C7: method call on non-import object → no false edge ─────────────────────
describe("C7: method call on non-import object produces no calls edge", () => {
	it("emits zero calls edges when the object is not an import local", () => {
		const g = buildGraph([
			{ file: "App.tsx", source: `this.service.save();` },
		]);
		expect(g.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
	});
});

// ── C8: multiple A→B calls collapse to one edge ──────────────────────────────
describe("C8: multiple calls between same module pair collapse to exactly one edge", () => {
	it("emits exactly one calls edge regardless of how many call facts exist", () => {
		const g = buildGraph([
			{ file: "helpers.ts", source: `export function helper1() {} export function helper2() {}` },
			{
				file: "App.tsx",
				source: `import { helper1, helper2 } from "./helpers"; helper1(); helper2();`,
			},
		]);
		const callEdges = g.edges.filter(
			(e) => e.kind === "calls" && e.srcId === "App.tsx" && e.dstId === "helpers.ts",
		);
		expect(callEdges).toHaveLength(1);
	});
});

// ── C9: self-edge suppressed ──────────────────────────────────────────────────
describe("C9: self-edge (srcId === dstId) suppressed in calls edges", () => {
	it("emits zero calls edges when resolved dst equals src file", () => {
		// A.tsx imports from ./A (self-import) and calls the imported fn — no edge
		const g = buildGraph([
			{ file: "A.tsx", source: `import { fn } from "./A"; fn();` },
		]);
		expect(g.edges.filter((e) => e.kind === "calls" && e.srcId === e.dstId)).toHaveLength(0);
	});
});

// ── C10: determinism + existing edges unaffected ──────────────────────────────
describe("C10: determinism and existing edge kinds unaffected", () => {
	const mathSrc = `export function add(a: number, b: number) { return a + b; }`;
	const appSrc = `import { add } from "./math"; add(1, 2);`;

	it("two identical buildGraph calls produce calls edges in same order", () => {
		const files = [
			{ file: "math.ts", source: mathSrc },
			{ file: "App.tsx", source: appSrc },
		];
		const g1 = buildGraph(files);
		const g2 = buildGraph(files);
		expect(g1.edges.filter((e) => e.kind === "calls")).toEqual(
			g2.edges.filter((e) => e.kind === "calls"),
		);
	});

	it("existing imports/renders edges are unchanged after adding call facts", () => {
		const iconSrc = `export function Icon({ size }: any) { return <svg />; }`;
		const btnSrc = `import { Icon } from "./Icon";
export function Button() { return <Icon size={16} />; }`;
		const g = buildGraph([
			{ file: "Icon.tsx", source: iconSrc },
			{ file: "Button.tsx", source: btnSrc },
		]);
		const rendersEdges = g.edges.filter((e) => e.kind === "renders");
		const importsEdges = g.edges.filter((e) => e.kind === "imports");
		expect(rendersEdges).toHaveLength(1);
		expect(importsEdges).toHaveLength(1);
	});
});

// ── C11: dynamic/computed callee (empty callee name) → no calls edge ──────────
describe("C11: dynamic computed callee produces no calls edge", () => {
	it("emits zero calls edges when the callee is a computed member expression", () => {
		// `handlers[key]()` has no static callee identifier → callee is "" → skipped
		const g = buildGraph([
			{ file: "App.tsx", source: `import { handlers } from "./handlers"; const key = "x"; handlers[key]();` },
		]);
		expect(g.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
	});
});

// ── C12: named-import member callee → NO calls edge (prefix branch is namespace-only) ──
describe("C12: named import member callee does not emit a spurious calls edge", () => {
	it("emits zero calls edges when foo is a named import and foo.bar() is called", () => {
		// foo is imported as a named specifier (mode="named"), not a namespace.
		// The prefix branch `foo.bar`.startsWith(`foo.`) must NOT fire here.
		const g = buildGraph([
			{ file: "foo.ts", source: `export const foo = { bar() {} };` },
			{ file: "App.tsx", source: `import { foo } from "./foo"; foo.bar();` },
		]);
		expect(g.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
	});
});

// ── C13: namespace import member callee → calls edge (prefix branch fires) ────
describe("C13: namespace import method call still emits calls edge after mode gating", () => {
	it("emits exactly one calls edge when ns.format() called via namespace import", () => {
		// This confirms the namespace-prefix branch is not over-gated.
		// (Same scenario as C3 — kept here to explicitly document the positive case
		// alongside the negative C12 to prevent regression.)
		const g = buildGraph([
			{ file: "utils.ts", source: `export function format(x: string) { return x; }` },
			{ file: "App.tsx", source: `import * as utils from "./utils"; utils.format("x");` },
		]);
		const callEdges = g.edges.filter((e) => e.kind === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0]).toMatchObject({ srcId: "App.tsx", dstId: "utils.ts", kind: "calls" });
	});
});

// ── C14: named import direct call → calls edge (exact match stays mode-agnostic) ──
describe("C14: named import direct call still emits calls edge after mode gating", () => {
	it("emits exactly one calls edge when named import is called directly", () => {
		// Exact-match branch is mode-agnostic — must still work for named imports.
		const g = buildGraph([
			{ file: "foo.ts", source: `export function foo() {}` },
			{ file: "App.tsx", source: `import { foo } from "./foo"; foo();` },
		]);
		const callEdges = g.edges.filter((e) => e.kind === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0]).toMatchObject({ srcId: "App.tsx", dstId: "foo.ts", kind: "calls" });
	});
});
