import type { AnalysisDiagnostic, Finding, PresentedFinding } from "../types.js";
import type { RaiConfig } from "../config/schema.js";
import { buildGraph, type SourceFile } from "../parse/graph-build.js";
import { freezeGraph, type RepoGraph } from "../graph/repograph.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { MemoryReader } from "../memory/memory-reader.js";
import { overlay } from "../memory/overlay.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";
import type { Analyzer, AnalyzerResult, AnalysisContext, BoundaryRule } from "../analyzers/analyzer.js";
import { SnapshotStore } from "../memory/snapshot-store.js";
import { createTypeResolver, type TypeResolverHooks } from "../parse/type-resolver.js";

export interface AnalyzeRepoInput {
  files: SourceFile[];
  registry: AnalyzerRegistry;
  findings: FindingsStore;
  feedback: FeedbackStore;
  config: RaiConfig;
  runId: string;
  commitSha: string;
  asOf: number; // explicit time anchor (§3.3 determinism)
  analysisVersion?: number | undefined;
  typeResolverHooks?: TypeResolverHooks | undefined;
}

export interface AnalyzeRepoResult {
  presented: PresentedFinding[];
  diagnostics: AnalysisDiagnostic[];
  analysisVersion: number;
  runId: string;
  graph: Readonly<RepoGraph>;
}

/** analyzeRepo orchestration (§2.5). Pure analyzers, impure persistence around them. */
export function analyzeRepo(input: AnalyzeRepoInput): AnalyzeRepoResult {
  const analysisVersion = input.analysisVersion ?? 1;

  // 2-3. build graph (Pass-1). (Incremental dirty-diff is a P4 optimization; MVP rebuilds.)
  const graph = freezeGraph(buildGraph(input.files));

  // 5. frozen AnalysisContext
  const memory = new MemoryReader(
    (input.findings as any).db, input.findings, input.feedback,
    { asOf: input.asOf, configVersion: input.config.configVersion, halfLifeDays: input.config.memory.halfLifeDays },
  );
  const ctx: AnalysisContext = {
    graph, memory, config: input.config,
    types: createTypeResolver({ files: input.files, graph, hooks: input.typeResolverHooks }),
    runId: input.runId, commitSha: input.commitSha,
    analysisVersion, embeddingModelVersion: EMBED_MODEL_VERSION,
    boundaryRules: input.config.boundaries as readonly BoundaryRule[],
  };

  // 6. run analyzers (pure)
  const raw: Finding[] = [];
  const diagnostics: AnalysisDiagnostic[] = [];
  for (const analyzer of input.registry.list()) {
    const result = runAnalyzerSafely(analyzer, ctx);
    raw.push(...result.findings);
    diagnostics.push(...result.diagnostics);
  }

  // 7. persist findings (append-only) + 8. overlay with memory
  const presented: PresentedFinding[] = [];
  const persistedFindings: Finding[] = [];
  for (const f of raw) {
    const persisted = { ...f, createdAt: input.asOf };
    input.findings.insert(persisted);
    persistedFindings.push(persisted);
    const w = memory.weight(f.fingerprint.structural, f.ruleId);
    presented.push(overlay(persisted, w, input.config.memory));
  }

  // 9. snapshot population — derived view (§3.5). Skip if no SHA; wrap in try/catch for integrity.
  if (!input.commitSha) {
    diagnostics.push({ kind: "snapshot-skipped", message: "no git SHA available" });
  } else {
    try {
      const db = (input.findings as any).db;
      const snapStore = new SnapshotStore(db);
      for (const f of persistedFindings) {
        snapStore.insert({
          commitSha: input.commitSha,
          fingerprint: f.fingerprint.structural,
          ruleId: f.ruleId,
          severityRaw: f.severityRaw,
          evidence: f.evidence,
          createdAt: input.asOf,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({ kind: "snapshot-skipped", message });
    }
  }

  presented.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
  return { presented, diagnostics, analysisVersion, runId: input.runId, graph };
}

function runAnalyzerSafely(analyzer: Analyzer, ctx: AnalysisContext): { findings: Finding[]; diagnostics: AnalysisDiagnostic[] } {
  try {
    return normalizeAnalyzerResult(analyzer.analyze(ctx));
  } catch (error) {
    return {
      findings: [],
      diagnostics: [{
        ruleId: analyzer.ruleId,
        kind: "analyzer-error",
        ...normalizeAnalyzerError(error),
      }],
    };
  }
}

function normalizeAnalyzerResult(result: AnalyzerResult): { findings: Finding[]; diagnostics: AnalysisDiagnostic[] } {
  if (Array.isArray(result)) return { findings: result, diagnostics: [] };
  return { findings: result.findings, diagnostics: result.diagnostics ?? [] };
}

function normalizeAnalyzerError(error: unknown): { errorName: string; message: string } {
  if (error instanceof Error) {
    const errorName = error.name || error.constructor.name || "Error";
    const message = error.message || "Analyzer failed";
    return { errorName, message };
  }
  const message = String(error) || "Analyzer failed";
  return { errorName: "NonErrorThrown", message };
}
