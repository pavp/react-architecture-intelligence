import { expect, test } from "vitest";
import { resolveConfig, DEFAULT_CONFIG } from "./resolve.js";

test("resolveConfig returns defaults when given empty input", () => {
  const c = resolveConfig({});
  expect(c.shared.minCosine).toBe(DEFAULT_CONFIG.shared.minCosine);
  expect(c.reconcile.tSame).toBe(0.95);
});

test("resolveConfig merges partial overrides", () => {
  const c = resolveConfig({ shared: { minInstances: 5 } });
  expect(c.shared.minInstances).toBe(5);
  expect(c.shared.minCosine).toBe(DEFAULT_CONFIG.shared.minCosine); // untouched
});

test("resolveConfig rejects invalid types", () => {
  // @ts-expect-error invalid on purpose
  expect(() => resolveConfig({ shared: { minCosine: "high" } })).toThrow();
});

test("resolveConfig carries a configVersion string", () => {
  expect(typeof resolveConfig({}).configVersion).toBe("string");
});

test("resolveConfig rejects upward severityMap (info->error raises severity)", () => {
  expect(() => resolveConfig({ memory: { severityMap: { info: "error" } } })).toThrow();
});

test("resolveConfig accepts downward severityMap (error->warn is a valid clamp)", () => {
  expect(() => resolveConfig({ memory: { severityMap: { error: "warn" } } })).not.toThrow();
});

test("resolveConfig provides conservative render-coupling and over-abstraction thresholds", () => {
  const c = resolveConfig({});
  expect(c.renderCoupling.maxFanIn).toBe(5);
  expect(c.renderCoupling.maxFanOut).toBe(7);
  expect(c.renderCoupling.maxDirectChildren).toBe(5);
  expect(c.renderCoupling.maxReachableDepth).toBe(4);
  expect(c.overAbstraction.maxProps).toBe(10);
  expect(c.overAbstraction.maxHooks).toBe(6);
  expect(c.overAbstraction.maxChildren).toBe(8);
  expect(c.overAbstraction.maxCompositionMarkers).toBe(2);
  expect(c.overAbstraction.maxConditionalBranches).toBe(5);
});

test("resolveConfig accepts partial threshold overrides without adding non-metric fields", () => {
  const c = resolveConfig({ renderCoupling: { maxFanIn: 2 }, overAbstraction: { maxProps: 3 } });
  expect(c.renderCoupling.maxFanIn).toBe(2);
  expect(c.renderCoupling.maxFanOut).toBe(DEFAULT_CONFIG.renderCoupling.maxFanOut);
  expect(c.overAbstraction.maxProps).toBe(3);
  expect(c.overAbstraction.maxHooks).toBe(DEFAULT_CONFIG.overAbstraction.maxHooks);
  // @ts-expect-error import/module coupling config is intentionally out of scope.
  expect(() => resolveConfig({ renderCoupling: { maxImports: 1 } })).toThrow();
});
