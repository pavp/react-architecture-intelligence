import { expect, test } from "vitest";
import { accrueDrift, type DriftState } from "./drift.js";

const T = 0.4; // tRevalidate

test("accumulates drift across steps", () => {
  let st: DriftState = { anchorStructural: "anchor", cumulativeDrift: 0 };
  st = accrueDrift(st, 0.95, T); // 5% step
  st = accrueDrift(st, 0.95, T);
  expect(st.cumulativeDrift).toBeCloseTo(0.0975, 3); // 1-(0.95*0.95)
  expect(st.needsRevalidation).toBe(false);
});

test("fires revalidation once cumulative drift exceeds threshold", () => {
  let st: DriftState = { anchorStructural: "anchor", cumulativeDrift: 0 };
  for (let i = 0; i < 20; i++) st = accrueDrift(st, 0.95, T);
  expect(st.needsRevalidation).toBe(true);
});

test("confirm resets the anchor and drift", () => {
  let st: DriftState = { anchorStructural: "a", cumulativeDrift: 0.6, needsRevalidation: true };
  const reset = accrueDrift({ ...st, confirmAnchor: "newAnchor" } as DriftState, 1, T);
  expect(reset.cumulativeDrift).toBe(0);
  expect(reset.anchorStructural).toBe("newAnchor");
  expect(reset.needsRevalidation).toBe(false);
});
