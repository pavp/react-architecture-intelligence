import { expect, test } from "vitest";
import { AnalyzerRegistry, createDefaultAnalyzerRegistry } from "./registry.js";
import type { Analyzer } from "./analyzer.js";

const fake: Analyzer = {
  ruleId: "test/rule", framework: "react",
  analyze: () => [],
};

test("register + list", () => {
  const r = new AnalyzerRegistry();
  r.register(fake);
  expect(r.list().map((a) => a.ruleId)).toEqual(["test/rule"]);
});

test("duplicate ruleId throws", () => {
  const r = new AnalyzerRegistry();
  r.register(fake);
  expect(() => r.register(fake)).toThrow(/already registered/);
});

test("default registry includes hook topology after structural analyzers", () => {
  expect(createDefaultAnalyzerRegistry().list().map((a) => a.ruleId)).toEqual([
    "react/shared-extraction",
    "react/render-coupling",
    "react/over-abstraction",
    "react/hook-topology",
    "react/boundary-violation",
  ]);
});
