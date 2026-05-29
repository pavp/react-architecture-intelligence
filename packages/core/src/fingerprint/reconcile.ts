export type ReconcileDecision =
  | "SAME_ENTITY" | "RENAME" | "EVOLVED" | "CANDIDATE_MERGE" | "NEW_ENTITY";

export interface ReconcileInput {
  structuralMatch: number; // 0..1 set-similarity over the 5 structural components
  nominalExact: boolean;
  embeddingSim: number; // 0..1 cosine
  config: { tSame: number; tDiv: number; tEmbed: number };
}

export interface ReconcileResult {
  decision: ReconcileDecision;
  carryMemory: boolean; // carry weights to the new finding version?
  needsReview: boolean; // emit as a finding for human/agent decision?
}

/** Reconciliation decision table (§2.5.1). Pure. Thresholds from config (tier-2). */
export function reconcile(i: ReconcileInput): ReconcileResult {
  const { structuralMatch: s, nominalExact: n, embeddingSim: e, config: c } = i;
  if (s >= c.tSame && n) return { decision: "SAME_ENTITY", carryMemory: true, needsReview: false };
  if (s >= c.tSame && !n) return { decision: "RENAME", carryMemory: true, needsReview: false };
  if (s >= c.tDiv && s < c.tSame) return { decision: "EVOLVED", carryMemory: true, needsReview: false };
  if (s < c.tDiv && e >= c.tEmbed) return { decision: "CANDIDATE_MERGE", carryMemory: false, needsReview: true };
  return { decision: "NEW_ENTITY", carryMemory: false, needsReview: false };
}
