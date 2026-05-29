export interface DriftState {
  anchorStructural: string;
  cumulativeDrift: number; // accrued 1 − similarity(current, anchor)
  needsRevalidation?: boolean;
  confirmAnchor?: string; // set by caller to reset on human/cross-run confirm
}

/**
 * Cumulative-drift revalidation (§2.5.2). Per-step "same" can mask accumulated drift, so
 * we accrue distance from the identity-anchor and freeze carry-over past a threshold.
 * Pure: state + step-similarity in, new state out.
 */
export function accrueDrift(st: DriftState, stepSimilarity: number, tRevalidate: number): DriftState {
  if (st.confirmAnchor) {
    return { anchorStructural: st.confirmAnchor, cumulativeDrift: 0, needsRevalidation: false };
  }
  // compose: remaining-similarity multiplies; cumulativeDrift = 1 − product of step sims
  const remaining = (1 - st.cumulativeDrift) * stepSimilarity;
  const cumulativeDrift = 1 - remaining;
  return {
    anchorStructural: st.anchorStructural,
    cumulativeDrift,
    needsRevalidation: cumulativeDrift > tRevalidate,
  };
}
