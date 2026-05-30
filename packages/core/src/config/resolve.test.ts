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
