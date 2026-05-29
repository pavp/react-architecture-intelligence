import { expect, test } from "vitest";
import { clusterByCosine } from "./similarity-index.js";

// 3 vectors close together, 1 far
const near1 = new Float32Array([1, 0, 0]);
const near2 = new Float32Array([0.99, 0.14, 0]);
const near3 = new Float32Array([0.98, 0.2, 0]);
const far = new Float32Array([0, 0, 1]);

test("groups near vectors into one cluster, excludes the far one", () => {
  const items = [
    { id: "a", vec: near1 }, { id: "b", vec: near2 },
    { id: "c", vec: near3 }, { id: "d", vec: far },
  ];
  const clusters = clusterByCosine(items, 0.9);
  const big = clusters.find((cl) => cl.length >= 3)!;
  expect(big.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  expect(clusters.flat().filter((x) => x.id === "d").length).toBe(1); // d in its own singleton
});

test("deterministic: same input -> same clustering", () => {
  const items = [{ id: "a", vec: near1 }, { id: "b", vec: near2 }];
  expect(clusterByCosine(items, 0.9)).toEqual(clusterByCosine(items, 0.9));
});

test("high threshold splits everything into singletons", () => {
  const items = [{ id: "a", vec: near1 }, { id: "b", vec: near3 }];
  const clusters = clusterByCosine(items, 0.999);
  expect(clusters.every((cl) => cl.length === 1)).toBe(true);
});
