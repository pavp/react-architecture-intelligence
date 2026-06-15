import type { Db } from "../db/db.js";
import { FindingsStore } from "../memory/findings-store.js";

/**
 * Paired metric row: both fanIn and fanOut extracted from a single rejected finding.
 * Used by the secondary-knob pass (maxFanOut calibration) to determine dominance.
 */
export interface RejectedMetricRow {
  fanIn: number;
  fanOut: number;
}

/**
 * Paired metric extractor map: ruleId → function that reads both fanIn and fanOut
 * from a correctly-kinded evidence object. Returns undefined if evidence.kind
 * does not match or if fanOut is missing. Only populated for rules that have a
 * secondary maxFanOut knob (render-coupling, hook-topology).
 */
const PAIRED_METRIC_EXTRACTOR: Record<
  string,
  (evidence: unknown) => RejectedMetricRow | undefined
> = {
  "react/render-coupling": (ev) => {
    const e = ev as { kind: string; fanIn: number; fanOut?: number };
    if (e.kind !== "render-coupling") return undefined;
    if (typeof e.fanOut !== "number") return undefined;
    return { fanIn: e.fanIn, fanOut: e.fanOut };
  },
  "react/hook-topology": (ev) => {
    const e = ev as { kind: string; fanIn: number; fanOut?: number };
    if (e.kind !== "hook-topology") return undefined;
    if (typeof e.fanOut !== "number") return undefined;
    return { fanIn: e.fanIn, fanOut: e.fanOut };
  },
};

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

/**
 * Look up paired breach-metric rows (fanIn + fanOut) for all fingerprints that have
 * a negative feedback verdict (reject | wontfix | dismiss) for the given rule.
 *
 * Only available for rules registered in PAIRED_METRIC_EXTRACTOR (render-coupling,
 * hook-topology). Returns [] for all other rules.
 *
 * Read-only: issues only SELECT queries via feedback_event + FindingsStore.currentVersion.
 * Skips fps where:
 *   - ruleId not in PAIRED_METRIC_EXTRACTOR (returns [])
 *   - currentVersion returns null (finding not found)
 *   - evidence.kind does not match the expected kind for this rule
 *   - evidence.fanOut is not a number
 */
export function lookupRejectedEvidenceRows(db: Db, ruleId: string): RejectedMetricRow[] {
  const extractor = PAIRED_METRIC_EXTRACTOR[ruleId];
  if (!extractor) return [];

  const rows = db
    .prepare(
      `SELECT DISTINCT fingerprint FROM feedback_event
       WHERE rule_id = ? AND verdict IN ('reject', 'wontfix', 'dismiss')`,
    )
    .all(ruleId) as { fingerprint: string }[];

  if (rows.length === 0) return [];

  const store = new FindingsStore(db);
  const result: RejectedMetricRow[] = [];

  for (const { fingerprint } of rows) {
    const finding = store.currentVersion(fingerprint, ruleId);
    if (!finding) continue; // null skip — not treated as 0

    const row = extractor(finding.evidence);
    if (row === undefined) continue; // kind mismatch or missing fanOut

    result.push(row);
  }

  return result;
}
