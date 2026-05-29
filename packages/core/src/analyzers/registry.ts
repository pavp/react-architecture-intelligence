import type { Analyzer } from "./analyzer.js";

export class AnalyzerRegistry {
  private analyzers = new Map<string, Analyzer>();

  register(a: Analyzer): void {
    if (this.analyzers.has(a.ruleId)) throw new Error(`analyzer already registered: ${a.ruleId}`);
    this.analyzers.set(a.ruleId, a);
  }

  list(): Analyzer[] {
    return [...this.analyzers.values()];
  }
}
