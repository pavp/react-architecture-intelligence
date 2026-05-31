import type { AnalysisDiagnostic, Finding, Span } from "../types.js";
import type { RepoGraph } from "../graph/repograph.js";
import type { RaiConfig } from "../config/schema.js";
import type { MemoryReader } from "../memory/memory-reader.js";

export interface TypeInfo { text: string; symbolName?: string | undefined; }

/** Type escalation handle (lazy Pass-2). */
export interface TypeResolver { typeOf(span: Span): TypeInfo | null; }

/** A config-declared boundary between two glob patterns (§1.1). Source: config.boundaries[]. */
export interface BoundaryRule {
  from: string;
  to: string;
  kind?: string;
  reason: string;
}

/** The single seam analyzers implement (§2.4). `analyze` is PURE — no I/O, clock, randomness. */
export interface AnalysisContext {
  graph: Readonly<RepoGraph>;
  memory: MemoryReader;
  config: RaiConfig;
  types: TypeResolver;
  runId: string;
  commitSha: string;
  analysisVersion: number;
  embeddingModelVersion: string;
  boundaryRules: readonly BoundaryRule[];
}

export type AnalyzerResult = Finding[] | { findings: Finding[]; diagnostics?: AnalysisDiagnostic[] | undefined };

export interface Analyzer {
  ruleId: string;
  framework: string;
  analyze(ctx: AnalysisContext): AnalyzerResult;
}
