import { expect, test, describe } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pass1 } from "./pass1.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/core/src/parse -> repo root is four levels up
const FIX = join(__dirname, "../../../../fixtures");

const SRC = `
import { memo } from "react";
function Button({ label, onClick }) {
  const theme = useTheme();
  return <button onClick={onClick}>{label}</button>;
}
export default memo(Button);
`;

test("extracts a component with its prop names", () => {
  const r = pass1("Button.tsx", SRC);
  const btn = r.components.find((c) => c.name === "Button");
  expect(btn).toBeDefined();
  expect(btn!.propNames.sort()).toEqual(["label", "onClick"]);
});

test("extracts hook calls", () => {
  const r = pass1("Button.tsx", SRC);
  const btn = r.components.find((c) => c.name === "Button")!;
  expect(btn.hookCalls).toContain("useTheme");
});

test("extracts custom hook declarations with composed hook calls", () => {
  const r = pass1("hooks.ts", `export function useCheckout() { const cart = useCart(); const price = usePrice(); return { cart, price }; }
function useCart() { return useState([]); }`);
  const hook = r.hooks.find((h) => h.name === "useCheckout");

  expect(hook).toBeDefined();
  expect(hook!.hookCalls).toEqual(["useCart", "usePrice"]);
  expect(hook!.exportKind).toBe("named");
  expect(hook!.span.kind).toBe("hook");
});

test("is pure: same source yields deeply equal output", () => {
  expect(pass1("Button.tsx", SRC)).toEqual(pass1("Button.tsx", SRC));
});

test("records a Span with byte offsets and an astPath", () => {
  const btn = pass1("Button.tsx", SRC).components.find((c) => c.name === "Button")!;
  expect(btn.span.start).toBeGreaterThanOrEqual(0);
  expect(btn.span.end).toBeGreaterThan(btn.span.start);
  expect(typeof btn.span.astPath).toBe("string");
});

test("detects an exported function-declaration component", () => {
  const r = pass1("Card.tsx", `export function Card({ title }) { return <div>{title}</div>; }`);
  const c = r.components.find((x) => x.name === "Card");
  expect(c).toBeDefined();
  expect(c!.propNames).toEqual(["title"]);
  expect(c!.exportKind).toBe("named");
});

test("detects an exported const arrow component", () => {
  const r = pass1("Card.tsx", `export const Card = ({ title }) => <div>{title}</div>;`);
  expect(r.components.find((x) => x.name === "Card")?.exportKind).toBe("named");
});

test("detects an export-default function component", () => {
  const r = pass1("Card.tsx", `export default function Card({ title }) { return <div>{title}</div>; }`);
  expect(r.components.find((x) => x.name === "Card")?.exportKind).toBe("default");
});

test("separate default export sets exportKind on the named component", () => {
  const r = pass1("Button.tsx", `function Button({ label }) { return <button>{label}</button>; }
export default memo(Button);`);
  expect(r.components.find((x) => x.name === "Button")?.exportKind).toBe("default");
});

test("default-valued destructured props are captured", () => {
  const r = pass1("F.tsx", `function F({ a, b } = {}) { return <div/>; }`);
  expect(r.components.find((x) => x.name === "F")?.propNames.sort()).toEqual(["a", "b"]);
});

test("collects all nested composition markers", () => {
  const r = pass1("W.tsx", `const W = memo(forwardRef(({ x }, ref) => <div>{x}</div>));
export default W;`);
  const w = r.components.find((x) => x.name === "W")!;
  expect(w.compositionMarkers.sort()).toEqual(["forwardRef", "memo"]);
});

describe("pattern facts", () => {
  test("extracts generic syntax facts with spans", () => {
    const source = `
import DefaultThing, { named as alias, other } from "pkg";
import * as Namespace from "namespace-lib";
export { alias as renamed } from "re-export-lib";
export const Widget = () => {
  const value = makeThing(useThing());
  Thing.Item = Item;
  return <Namespace.Root><Namespace.Trigger /></Namespace.Root>;
};
`;

    const result = pass1("src/Widget.tsx", source);

    expect(result.patternFacts).toContainEqual(expect.objectContaining({
      kind: "import",
      file: "src/Widget.tsx",
      source: "pkg",
      specifiers: [
        { imported: "default", local: "DefaultThing", mode: "default" },
        { imported: "named", local: "alias", mode: "named" },
        { imported: "other", local: "other", mode: "named" },
      ],
    }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({
      kind: "import",
      source: "namespace-lib",
      specifiers: [{ imported: "*", local: "Namespace", mode: "namespace" }],
    }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({
      kind: "export",
      exported: "renamed",
      local: "alias",
      source: "re-export-lib",
      mode: "named",
    }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "call", callee: "makeThing" }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "hook-call", name: "useThing" }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "member-assignment", object: "Thing", property: "Item", value: "Item" }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "jsx", tag: "Namespace.Root", parentTag: "" }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "jsx", tag: "Namespace.Trigger", parentTag: "Namespace.Root" }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "file-role-seed", seed: "extension:tsx", source: "path" }));
    expect(result.patternFacts.every((fact) => fact.span.file === "src/Widget.tsx" && fact.span.end > fact.span.start)).toBe(true);
  });

  test("keeps ambiguous syntax raw without catalog intent", () => {
    const result = pass1("src/ambiguous.tsx", `
import { Root as AliasRoot } from "ui-kit";
export { AliasRoot as PublicRoot };
Namespace.Part = AliasRoot;
`);
    const text = JSON.stringify(result.patternFacts);

    expect(result.patternFacts).toContainEqual(expect.objectContaining({
      kind: "import",
      specifiers: [{ imported: "Root", local: "AliasRoot", mode: "named" }],
    }));
    expect(result.patternFacts).toContainEqual(expect.objectContaining({ kind: "member-assignment", object: "Namespace", property: "Part", value: "AliasRoot" }));
    expect(text).not.toMatch(/compound|controlled|provider/i);
  });
});

describe("KI-1 fix", () => {
  test("SC-1: route handler GET is NOT admitted as a component", () => {
    const source = readFileSync(join(FIX, "duplication/route-handlers/GET.ts"), "utf8");
    const result = pass1("GET.ts", source);
    expect(result.components.length).toBe(0);
  });

  test("SC-2: forwardRef component IS detected (regression guard)", () => {
    const source = readFileSync(join(FIX, "truepositives/forwardref-components/Button.tsx"), "utf8");
    const result = pass1("Button.tsx", source);
    expect(result.components.length).toBe(1);
    expect(result.components[0]!.name).toBe("Button");
    expect(result.components[0]!.kind).toBe("forwardRef");
  });

  test("SC-3: memo component IS detected", () => {
    const result = pass1("Badge.tsx", `const Badge = memo(() => <span className="badge">•</span>);`);
    expect(result.components.length).toBe(1);
    expect(result.components[0]!.kind).toBe("memo");
  });

  test("SC-4: plain JSX-returning function component IS detected", () => {
    const result = pass1("Header.tsx", `export function Header({ title }: { title: string }) { return <header><h1>{title}</h1></header>; }`);
    expect(result.components.length).toBe(1);
    expect(result.components[0]!.name).toBe("Header");
    expect(result.components[0]!.kind).toBe("fn");
  });
});
