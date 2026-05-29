import { expect, test } from "vitest";
import { pass1 } from "./pass1.js";

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
