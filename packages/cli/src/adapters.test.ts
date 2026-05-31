import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createDefaultAnalyzerRegistry, type Analyzer, type AnalysisDiagnostic } from "@rai/core";
import { composeRegistryFactory, loadInstalledAdapters } from "./adapters.js";

test("loadInstalledAdapters composes Next and React analyzers in stable order", async () => {
  const nextAnalyzer: Analyzer = { ruleId: "next/test", framework: "next", analyze: () => [] };
  const reactAnalyzer: Analyzer = { ruleId: "react/test", framework: "react", analyze: () => [] };
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importers: {
      next: async () => ({ createNextCoreAnalyzers: () => [nextAnalyzer] }),
      react: async () => ({ createReactCoreAnalyzers: () => [reactAnalyzer] }),
    },
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual([]);
  expect(registry.list().map((item) => item.ruleId).filter((ruleId) => ruleId.endsWith("/test"))).toEqual(["next/test", "react/test"]);
});

test("loadInstalledAdapters stays no-op when React adapter is unavailable and preserves Next", async () => {
  const nextAnalyzer: Analyzer = { ruleId: "next/test", framework: "next", analyze: () => [] };
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importers: {
      next: async () => ({ createNextCoreAnalyzers: () => [nextAnalyzer] }),
      react: async () => {
        throw Object.assign(new Error("Cannot find package '@rai/adapter-react'"), { code: "ERR_MODULE_NOT_FOUND" });
      },
    },
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual([]);
  expect(registry.list().map((item) => item.ruleId)).toContain("next/test");
  expect(registry.list().map((item) => item.ruleId)).not.toContain("react/test");
});

test("loadInstalledAdapters stays no-op when Next adapter is unavailable and preserves React", async () => {
  const reactAnalyzer: Analyzer = { ruleId: "react/test", framework: "react", analyze: () => [] };
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importers: {
      next: async () => {
        throw Object.assign(new Error("Cannot find package '@rai/adapter-next'"), { code: "ERR_MODULE_NOT_FOUND" });
      },
      react: async () => ({ createReactCoreAnalyzers: () => [reactAnalyzer] }),
    },
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual([]);
  expect(registry.list().map((item) => item.ruleId)).toContain("react/test");
  expect(registry.list().map((item) => item.ruleId)).not.toContain("next/test");
});

test("loadInstalledAdapters reports deterministic React diagnostics without suppressing Next", async () => {
  const nextAnalyzer: Analyzer = { ruleId: "next/test", framework: "next", analyze: () => [] };
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importers: {
      next: async () => ({ createNextCoreAnalyzers: () => [nextAnalyzer] }),
      react: async () => {
        throw new TypeError("bad react adapter shape");
      },
    },
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual<AnalysisDiagnostic[]>([
    { kind: "adapter-load-skipped", adapterId: "react", packageName: "@rai/adapter-react", errorName: "TypeError", message: "bad react adapter shape" },
  ]);
  expect(registry.list().map((item) => item.ruleId)).toContain("next/test");
});

test("loadInstalledAdapters reports deterministic Next diagnostics without suppressing React", async () => {
  const reactAnalyzer: Analyzer = { ruleId: "react/test", framework: "react", analyze: () => [] };
  const composition = await loadInstalledAdapters({
    rootDir: ".",
    importers: {
      next: async () => {
        throw new TypeError("bad next adapter shape");
      },
      react: async () => ({ createReactCoreAnalyzers: () => [reactAnalyzer] }),
    },
  });

  const registry = composition.registryFactory({ files: [] });

  expect(composition.diagnostics).toEqual<AnalysisDiagnostic[]>([
    { kind: "adapter-load-skipped", adapterId: "next", packageName: "@rai/adapter-next", errorName: "TypeError", message: "bad next adapter shape" },
  ]);
  expect(registry.list().map((item) => item.ruleId)).toContain("react/test");
});

test("@rai/cli declares the React adapter as a workspace dependency", () => {
  const pkg = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as { dependencies: Record<string, string> };

  expect(pkg.dependencies["@rai/adapter-react"]).toBe("workspace:*");
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
