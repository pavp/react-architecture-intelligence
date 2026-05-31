import { AnalyzerRegistry, createDefaultAnalyzerRegistry, type AnalysisDiagnostic, type Analyzer, type RegistryFactory, type SourceFile } from "@rai/core";

const NEXT_ADAPTER_PACKAGE = "@rai/adapter-next";

export interface AdapterComposition {
  registryFactory: RegistryFactory;
  diagnostics: AnalysisDiagnostic[];
}

interface AdapterModule {
  createNextCoreAnalyzers(input: { rootDir: string; files: SourceFile[] }): Analyzer[];
}

export interface LoadInstalledAdaptersInput {
  rootDir: string;
  importer?: (() => Promise<AdapterModule>) | undefined;
}

export async function loadInstalledAdapters(input: LoadInstalledAdaptersInput): Promise<AdapterComposition> {
  const importer = input.importer ?? importNextAdapter;
  try {
    const mod = await importer();
    return {
      diagnostics: [],
      registryFactory: composeRegistryFactory({ createAnalyzers: [({ files }) => mod.createNextCoreAnalyzers({ rootDir: input.rootDir, files })] }),
    };
  } catch (error) {
    if (isModuleNotFound(error)) return { diagnostics: [], registryFactory: composeRegistryFactory({ createAnalyzers: [] }) };
    return {
      diagnostics: [adapterLoadDiagnostic(error)],
      registryFactory: composeRegistryFactory({ createAnalyzers: [] }),
    };
  }
}

async function importNextAdapter(): Promise<AdapterModule> {
  try {
    return await import(NEXT_ADAPTER_PACKAGE) as AdapterModule;
  } catch (error) {
    if (!isModuleNotFound(error)) throw error;
    return await import("@rai/adapter-next") as AdapterModule;
  }
}

export function composeRegistryFactory(input: {
  createBaseRegistry?: (() => AnalyzerRegistry) | undefined;
  createAnalyzers: ((input: { files: SourceFile[] }) => Analyzer[])[];
}): RegistryFactory {
  return ({ files }) => {
    const registry = (input.createBaseRegistry ?? createDefaultAnalyzerRegistry)();
    for (const createAnalyzers of input.createAnalyzers) {
      for (const analyzer of createAnalyzers({ files })) registry.register(analyzer);
    }
    return registry;
  };
}

function adapterLoadDiagnostic(error: unknown): AnalysisDiagnostic {
  if (error instanceof Error) {
    return { kind: "adapter-load-skipped", adapterId: "next", packageName: NEXT_ADAPTER_PACKAGE, errorName: error.name || error.constructor.name || "Error", message: error.message || "Adapter load failed" };
  }
  return { kind: "adapter-load-skipped", adapterId: "next", packageName: NEXT_ADAPTER_PACKAGE, errorName: "NonErrorThrown", message: String(error) || "Adapter load failed" };
}

function isModuleNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND" || error.message.includes(NEXT_ADAPTER_PACKAGE);
}
