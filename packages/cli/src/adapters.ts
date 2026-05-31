import { type AnalyzerRegistry, createDefaultAnalyzerRegistry, type AnalysisDiagnostic, type Analyzer, type RegistryFactory, type SourceFile } from "@rai/core";

const NEXT_ADAPTER_PACKAGE = "@rai/adapter-next";
const REACT_ADAPTER_PACKAGE = "@rai/adapter-react";

type AdapterId = "next" | "react";

export interface AdapterComposition {
  registryFactory: RegistryFactory;
  diagnostics: AnalysisDiagnostic[];
}

interface NextAdapterModule {
  createNextCoreAnalyzers(input: { rootDir: string; files: SourceFile[] }): Analyzer[];
}

interface ReactAdapterModule {
  createReactCoreAnalyzers(input: { rootDir: string; files: SourceFile[] }): Analyzer[];
}

interface InstalledAdapterDescriptor<TModule> {
  adapterId: AdapterId;
  packageName: string;
  importAdapter: () => Promise<TModule>;
  createAnalyzers: (mod: TModule, input: { rootDir: string; files: SourceFile[] }) => Analyzer[];
}

export interface LoadInstalledAdaptersInput {
  rootDir: string;
  importer?: (() => Promise<NextAdapterModule>) | undefined;
  importers?: {
    next?: (() => Promise<NextAdapterModule>) | undefined;
    react?: (() => Promise<ReactAdapterModule>) | undefined;
  } | undefined;
}

export async function loadInstalledAdapters(input: LoadInstalledAdaptersInput): Promise<AdapterComposition> {
  const diagnostics: AnalysisDiagnostic[] = [];
  const createAnalyzers: ((input: { files: SourceFile[] }) => Analyzer[])[] = [];

  for (const descriptor of adapterDescriptors(input)) {
    try {
      const mod = await descriptor.importAdapter();
      createAnalyzers.push(({ files }) => descriptor.createAnalyzers(mod, { rootDir: input.rootDir, files }));
    } catch (error) {
      if (isModuleNotFound(error, descriptor.packageName)) continue;
      diagnostics.push(adapterLoadDiagnostic(descriptor.adapterId, descriptor.packageName, error));
    }
  }

  return { diagnostics, registryFactory: composeRegistryFactory({ createAnalyzers }) };
}

function adapterDescriptors(input: LoadInstalledAdaptersInput): InstalledAdapterDescriptor<NextAdapterModule | ReactAdapterModule>[] {
  return [
    {
      adapterId: "next",
      packageName: NEXT_ADAPTER_PACKAGE,
      importAdapter: input.importer ?? input.importers?.next ?? importNextAdapter,
      createAnalyzers: (mod, analyzerInput) => (mod as NextAdapterModule).createNextCoreAnalyzers(analyzerInput),
    },
    {
      adapterId: "react",
      packageName: REACT_ADAPTER_PACKAGE,
      importAdapter: input.importers?.react ?? importReactAdapter,
      createAnalyzers: (mod, analyzerInput) => (mod as ReactAdapterModule).createReactCoreAnalyzers(analyzerInput),
    },
  ];
}

async function importNextAdapter(): Promise<NextAdapterModule> {
  return await import(NEXT_ADAPTER_PACKAGE) as NextAdapterModule;
}

async function importReactAdapter(): Promise<ReactAdapterModule> {
  return await import(REACT_ADAPTER_PACKAGE) as ReactAdapterModule;
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

function adapterLoadDiagnostic(adapterId: string, packageName: string, error: unknown): AnalysisDiagnostic {
  if (error instanceof Error) {
    return { kind: "adapter-load-skipped", adapterId, packageName, errorName: error.name || error.constructor.name || "Error", message: error.message || "Adapter load failed" };
  }
  return { kind: "adapter-load-skipped", adapterId, packageName, errorName: "NonErrorThrown", message: String(error) || "Adapter load failed" };
}

function isModuleNotFound(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") && error.message.includes(packageName);
}
