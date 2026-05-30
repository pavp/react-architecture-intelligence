import type { PresentedFinding } from "../types.js";
import type { RaiConfig } from "../config/schema.js";
import { buildGraph, type SourceFile } from "../parse/graph-build.js";
import { freezeGraph } from "../graph/repograph.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { MemoryReader } from "../memory/memory-reader.js";
import { overlay } from "../memory/overlay.js";
import { EMBED_MODEL_VERSION } from "../similarity/embed.js";
import type { AnalysisContext, BoundaryRule } from "../analyzers/analyzer.js";

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
}

export interface AnalyzeRepoResult {
  presented: PresentedFinding[];
  analysisVersion: number;
  runId: string;
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
    types: { typeOf: () => null }, // lazy Pass-2 wired in P4
    runId: input.runId, commitSha: input.commitSha,
    analysisVersion, embeddingModelVersion: EMBED_MODEL_VERSION,
    boundaryRules: input.config.boundaries as readonly BoundaryRule[],
  };

  // 6. run analyzers (pure)
  const raw = input.registry.list().flatMap((a) => a.analyze(ctx));

  // 7. persist findings (append-only) + 8. overlay with memory
  const presented: PresentedFinding[] = [];
  for (const f of raw) {
    const persisted = { ...f, createdAt: input.asOf };
    input.findings.insert(persisted);
    const w = memory.weight(f.fingerprint.structural, f.ruleId);
    presented.push(overlay(persisted, w, input.config.memory));
  }

  presented.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
  return { presented, analysisVersion, runId: input.runId };
}
