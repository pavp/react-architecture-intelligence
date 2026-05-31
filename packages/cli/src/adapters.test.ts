import { expect, test } from "vitest";
import { createDefaultAnalyzerRegistry, type Analyzer, type AnalysisDiagnostic } from "@rai/core";
import { composeRegistryFactory, loadInstalledAdapters } from "./adapters.js";

test("loadInstalledAdapters composes Next analyzers when adapter module is available", async () => {
  const analyzer: Analyzer = { ruleId: "next/test", framework: "next", analyze: () => [] };
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importer: async () => ({ createNextCoreAnalyzers: () => [analyzer] }),
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual([]);
  expect(registry.list().map((item) => item.ruleId)).toContain("next/test");
});

test("loadInstalledAdapters stays no-op when Next adapter is unavailable", async () => {
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importer: async () => {
      throw Object.assign(new Error("Cannot find package '@rai/adapter-next'"), { code: "ERR_MODULE_NOT_FOUND" });
    },
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual([]);
  expect(registry.list().map((item) => item.ruleId).filter((ruleId) => ruleId.startsWith("next/"))).toEqual([]);
});

test("loadInstalledAdapters reports deterministic diagnostics for unexpected import failures", async () => {
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importer: async () => {
      throw new TypeError("bad adapter shape");
    },
  });

  expect(composition.diagnostics).toEqual<AnalysisDiagnostic[]>([
    { kind: "adapter-load-skipped", adapterId: "next", packageName: "@rai/adapter-next", errorName: "TypeError", message: "bad adapter shape" },
  ]);
});

test("composeRegistryFactory keeps baseline analyzers and appends adapter analyzers per file set", () => {
  const seen: number[] = [];
  const adapterAnalyzer: Analyzer = { ruleId: "next/dynamic", framework: "next", analyze: () => [] };
  const factory = composeRegistryFactory({
    createBaseRegistry: createDefaultAnalyzerRegistry,
    createAnalyzers: [({ files }) => {
      seen.push(files.length);
      return [adapterAnalyzer];
    }],
  });

  const first = factory({ files: [{ file: "a.tsx", source: "export function A() { return <div />; }" }] });
  const second = factory({ files: [{ file: "a.tsx", source: "" }, { file: "b.tsx", source: "" }] });

  expect(first.list().map((analyzer) => analyzer.ruleId)).toContain("react/shared-extraction");
  expect(second.list().map((analyzer) => analyzer.ruleId)).toContain("next/dynamic");
  expect(seen).toEqual([1, 2]);
});
