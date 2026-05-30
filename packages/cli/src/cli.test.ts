import { expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs, runAnalyze } from "./cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUTTONS = resolve(HERE, "../../../fixtures/duplication/buttons");

test("parseArgs routes analyze with a directory", () => {
  expect(parseArgs(["analyze", "src"])).toEqual({ cmd: "analyze", dir: "src" });
});

test("parseArgs defaults the directory to '.'", () => {
  expect(parseArgs(["analyze"])).toEqual({ cmd: "analyze", dir: "." });
});

test("parseArgs routes mcp", () => {
  expect(parseArgs(["mcp", "/repo"])).toEqual({ cmd: "mcp", dir: "/repo" });
});

test("parseArgs returns help for no args", () => {
  expect(parseArgs([]).cmd).toBe("help");
});

test("parseArgs returns help for an unknown command", () => {
  expect(parseArgs(["frobnicate"]).cmd).toBe("help");
});

test("runAnalyze on the buttons fixture finds one opportunity", () => {
  const r = runAnalyze(BUTTONS);
  expect(r.counts.byType.opportunity).toBe(1);
  expect(r.counts.bySeverity.warn).toBe(1);
});
