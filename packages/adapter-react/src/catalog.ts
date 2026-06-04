import type { PatternFact, PatternFactKind } from "@rai/core";

export interface ReactPatternCatalog {
  id: "react-pattern-catalog";
  version: 1;
  signatures: readonly ReactPatternSignature[];
  findings: readonly [];
  writesMemory: false;
}

export interface ReactPatternSignature {
  id: "compound-primitive";
  displayName: string;
  factKinds: readonly PatternFactKind[];
}

export interface CatalogEvidenceSummary {
  factCount: number;
  kinds: PatternFactKind[];
  syntaxOnly: true;
}

const FACT_KINDS: readonly PatternFactKind[] = ["import", "export", "call", "call-binding", "call-argument", "jsx", "jsx-attribute", "hook-call", "member-assignment", "file-role-seed"];

export const REACT_PATTERN_CATALOG: ReactPatternCatalog = Object.freeze({
  id: "react-pattern-catalog",
  version: 1,
  signatures: Object.freeze([
    Object.freeze({
      id: "compound-primitive",
      displayName: "Compound primitive",
      factKinds: FACT_KINDS,
    }),
  ]),
  findings: Object.freeze([]) as [],
  writesMemory: false,
});

export function catalogFactKinds(): PatternFactKind[] {
  return [...FACT_KINDS];
}

export function readCatalogEvidence(facts: readonly PatternFact[]): CatalogEvidenceSummary {
  return {
    factCount: facts.length,
    kinds: [...new Set(facts.map((fact) => fact.kind))].sort(),
    syntaxOnly: true,
  };
}
