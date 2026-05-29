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
