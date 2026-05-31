import type { Analyzer, SourceFile } from "@rai/core";
import { createCompoundComponentApiDriftAnalyzer } from "./compound-component-api-drift.js";

export interface ReactCoreAnalyzerInput {
  rootDir: string;
  files: SourceFile[];
}

export function createReactCoreAnalyzers(_input: ReactCoreAnalyzerInput): Analyzer[] {
  return [createCompoundComponentApiDriftAnalyzer()];
}
