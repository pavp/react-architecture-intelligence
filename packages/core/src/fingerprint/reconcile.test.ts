import { expect, test } from "vitest";
import { reconcile, type ReconcileInput } from "./reconcile.js";

const cfg = { tSame: 0.95, tDiv: 0.8, tEmbed: 0.92 };

function inp(over: Partial<ReconcileInput>): ReconcileInput {
  return { structuralMatch: 1, nominalExact: true, embeddingSim: 1, config: cfg, ...over };
}

test("high structural + nominal match -> SAME_ENTITY", () => {
  expect(reconcile(inp({})).decision).toBe("SAME_ENTITY");
});

test("high structural + nominal mismatch -> RENAME", () => {
  expect(reconcile(inp({ nominalExact: false })).decision).toBe("RENAME");
});

test("mid structural -> EVOLVED", () => {
  expect(reconcile(inp({ structuralMatch: 0.85 })).decision).toBe("EVOLVED");
});

test("low structural + high embedding -> CANDIDATE_MERGE", () => {
  expect(reconcile(inp({ structuralMatch: 0.5, embeddingSim: 0.95 })).decision).toBe("CANDIDATE_MERGE");
});

test("low structural + low embedding -> NEW_ENTITY", () => {
  expect(reconcile(inp({ structuralMatch: 0.5, embeddingSim: 0.5 })).decision).toBe("NEW_ENTITY");
});

test("SAME_ENTITY and RENAME and EVOLVED carry memory; NEW and CANDIDATE do not", () => {
  expect(reconcile(inp({})).carryMemory).toBe(true);
  expect(reconcile(inp({ nominalExact: false })).carryMemory).toBe(true);
  expect(reconcile(inp({ structuralMatch: 0.85 })).carryMemory).toBe(true);
  expect(reconcile(inp({ structuralMatch: 0.5, embeddingSim: 0.95 })).carryMemory).toBe(false);
  expect(reconcile(inp({ structuralMatch: 0.5, embeddingSim: 0.5 })).carryMemory).toBe(false);
});
