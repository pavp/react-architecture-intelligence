import { expect, test } from "vitest";
import { contentHash } from "./content-hash.js";

test("same content yields same hash", () => {
  expect(contentHash("const a = 1;")).toBe(contentHash("const a = 1;"));
});

test("different content yields different hash", () => {
  expect(contentHash("const a = 1;")).not.toBe(contentHash("const a = 2;"));
});

test("hash is a hex string", () => {
  expect(contentHash("x")).toMatch(/^[0-9a-f]{64}$/);
});
