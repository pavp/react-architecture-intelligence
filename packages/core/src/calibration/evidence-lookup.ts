import type { Db } from "../db/db.js";
import { FindingsStore } from "../memory/findings-store.js";

/**
 * Metric extractor map: ruleId → function that reads the primary metric
 * from a correctly-kinded evidence object. Returns undefined if evidence.kind
 * does not match the expected kind (defensive discriminated-union guard).
 */
const METRIC_EXTRACTOR: Record<string, (evidence: unknown) => number | undefined> = {
  "react/render-coupling": (ev) => {
    const e = ev as { kind: string; fanIn: number };
    return e.kind === "render-coupling" ? e.fanIn : undefined;
  },
  "react/over-abstraction": (ev) => {
    const e = ev as { kind: string; propCount: number };
    return e.kind === "over-abstraction" ? e.propCount : undefined;
  },
  "react/hook-topology": (ev) => {
    const e = ev as { kind: string; fanIn: number };
    return e.kind === "hook-topology" ? e.fanIn : undefined;
  },
  "react/shared-extraction": (ev) => {
    const e = ev as { kind: string; instances: unknown };
    if (e.kind !== "shared-extraction" || !Array.isArray(e.instances)) return undefined;
    return e.instances.length;
  },
};

/**
 * Look up the primary breach-metric values for all fingerprints that have
 * a negative feedback verdict (reject | wontfix | dismiss) for the given rule.
 *
 * Read-only: issues only SELECT queries via feedback_event + FindingsStore.currentVersion.
 * D2: constructs FindingsStore internally; takes only Db.
 *
 * Returns a number[] of extracted metric values. Skips fps where:
 *   - currentVersion returns null (finding not found)
 *   - evidence.kind does not match the expected kind for this rule
 *   - ruleId not in METRIC_EXTRACTOR (returns [])
 */
export function lookupRejectedEvidence(db: Db, ruleId: string): number[] {
  const extractor = METRIC_EXTRACTOR[ruleId];
  if (!extractor) return [];

  // SELECT DISTINCT fingerprint FROM feedback_event WHERE rule_id=? AND verdict IN (reject,wontfix,dismiss)
  const rows = db
    .prepare(
      `SELECT DISTINCT fingerprint FROM feedback_event
       WHERE rule_id = ? AND verdict IN ('reject', 'wontfix', 'dismiss')`,
    )
    .all(ruleId) as { fingerprint: string }[];

  if (rows.length === 0) return [];

  const store = new FindingsStore(db);
  const metrics: number[] = [];

  for (const { fingerprint } of rows) {
    const finding = store.currentVersion(fingerprint, ruleId);
    if (!finding) continue; // null skip (D5 — not treated as 0)

    const metric = extractor(finding.evidence);
    if (metric === undefined) continue; // kind mismatch skip

    metrics.push(metric);
  }

  return metrics;
}
