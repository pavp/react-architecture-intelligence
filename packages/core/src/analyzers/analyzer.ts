import type { Finding, Span } from "../types.js";
import type { RepoGraph } from "../graph/repograph.js";
import type { RaiConfig } from "../config/schema.js";
import type { MemoryReader } from "../memory/memory-reader.js";

export type FrameworkId = "react" | "next" | "tanstack" | "remix" | "expo";

/** Type escalation handle (lazy Pass-2). MVP: minimal — returns null until P4 wires ts-morph. */
export interface TypeResolver { typeOf(span: Span): unknown | null; }

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
}

export interface Analyzer {
  ruleId: string;
  framework: FrameworkId;
  analyze(ctx: AnalysisContext): Finding[];
}
