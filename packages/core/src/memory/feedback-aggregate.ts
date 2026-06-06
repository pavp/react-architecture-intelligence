import type { Db } from "../db/db.js";
import type { Verdict } from "../types.js";

export interface RuleFeedbackStats {
  ruleId: string;
  totalEvents: number;
  distinctFingerprints: number;
  byVerdict: Record<Verdict, number>;
  negativeRate: number; // (reject + wontfix + dismiss) / totalEvents
}

const ALL_VERDICTS: Verdict[] = ["accept", "reject", "wontfix", "confirm", "dismiss"];
const NEGATIVE_VERDICTS: Verdict[] = ["reject", "wontfix", "dismiss"];

/**
 * Read-only aggregation over T4 (feedback_event). SELECT-only — no writes.
 * Returns one RuleFeedbackStats per rule_id, sorted by ruleId (byte order).
 */
export function aggregateFeedback(db: Db): RuleFeedbackStats[] {
  // Count events per rule_id + verdict
  const verdictRows = db
    .prepare(
      `SELECT rule_id, verdict, COUNT(*) as cnt
       FROM feedback_event
       GROUP BY rule_id, verdict`,
    )
    .all() as { rule_id: string; verdict: string; cnt: number }[];

  // Count distinct fingerprints per rule_id
  const fpRows = db
    .prepare(
      `SELECT rule_id, COUNT(DISTINCT fingerprint) as cnt
       FROM feedback_event
       GROUP BY rule_id`,
    )
    .all() as { rule_id: string; cnt: number }[];

  if (verdictRows.length === 0) return [];

  // Build a map of rule_id -> stats
  const statsMap = new Map<string, RuleFeedbackStats>();

  // Initialize from verdict rows
  for (const row of verdictRows) {
    if (!statsMap.has(row.rule_id)) {
      const byVerdict = Object.fromEntries(
        ALL_VERDICTS.map((v) => [v, 0]),
      ) as Record<Verdict, number>;
      statsMap.set(row.rule_id, {
        ruleId: row.rule_id,
        totalEvents: 0,
        distinctFingerprints: 0,
        byVerdict,
        negativeRate: 0,
      });
    }
    const stat = statsMap.get(row.rule_id)!;
    const v = row.verdict as Verdict;
    if (ALL_VERDICTS.includes(v)) {
      stat.byVerdict[v] = (stat.byVerdict[v] ?? 0) + row.cnt;
    }
    stat.totalEvents += row.cnt;
  }

  // Fill distinctFingerprints
  for (const row of fpRows) {
    const stat = statsMap.get(row.rule_id);
    if (stat) stat.distinctFingerprints = row.cnt;
  }

  // Compute negativeRate
  for (const stat of statsMap.values()) {
    const negativeCount = NEGATIVE_VERDICTS.reduce(
      (sum, v) => sum + (stat.byVerdict[v] ?? 0),
      0,
    );
    stat.negativeRate = stat.totalEvents > 0 ? negativeCount / stat.totalEvents : 0;
  }

  // Sort by ruleId (byte order — plain < / > comparison, not localeCompare)
  return [...statsMap.values()].sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  );
}
