import type { Analyzer } from "./analyzer.js";
import { sharedExtraction } from "./shared-extraction.js";
import { renderCoupling } from "./render-coupling.js";
import { overAbstraction } from "./over-abstraction.js";

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

export function createDefaultAnalyzerRegistry(): AnalyzerRegistry {
  const registry = new AnalyzerRegistry();
  registry.register(sharedExtraction);
  registry.register(renderCoupling);
  registry.register(overAbstraction);
  return registry;
}
