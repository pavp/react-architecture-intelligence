import { ulid } from "ulid";
import type { Db } from "../db/db.js";
import type { FeedbackEvent, FeedbackSource, Verdict } from "../types.js";
import { FindingsStore } from "./findings-store.js";

export interface RecordFeedbackInput {
  fingerprint: string; // structural layer
  ruleId: string;
  verdict: Verdict;
  source: FeedbackSource;
  originRunId?: string;
  weightHint?: number;
  reason?: string;
  commitSha?: string;
  asOf?: number; // for testability; defaults to Date.now() at the I/O boundary
}

export interface RecordFeedbackResult { accepted: boolean; refusedReason?: string; }

/** T4 — the SOLE memory write path (§3.6). Append-only. Validates before writing. */
export class FeedbackStore {
  constructor(private db: Db, private findings: FindingsStore) {}

  record(input: RecordFeedbackInput): RecordFeedbackResult {
    // 1. phantom guard (§5.3): fingerprint must be a real finding (current OR historical)
    const current = this.findings.currentVersion(input.fingerprint, input.ruleId);
    const known = current !== null || this.findings.anyHistoricalVersion(input.fingerprint);
    if (!known) return { accepted: false, refusedReason: "phantom fingerprint — never observed" };

    // 2. anti-self-loop (§3.6): agent may not give feedback on a finding its own run produced
    if (input.source === "agent" && current && input.originRunId === current.producingRunId) {
      return { accepted: false, refusedReason: "agent self-loop refused (same producing run)" };
    }

    const e: FeedbackEvent = {
      id: ulid(),
      fingerprint: input.fingerprint,
      ruleId: input.ruleId,
      verdict: input.verdict,
      source: input.source,
      originRunId: input.originRunId ?? null,
      weightHint: input.weightHint ?? null,
      reason: input.reason ?? null,
      commitSha: input.commitSha ?? null,
      createdAt: input.asOf ?? Date.now(),
    };
    this.db.prepare(
      `INSERT INTO feedback_event (id, fingerprint, rule_id, verdict, source, origin_run_id,
        weight_hint, reason, commit_sha, created_at)
       VALUES (@id,@fp,@rule,@verdict,@source,@origin,@hint,@reason,@sha,@ts)`,
    ).run({
      id: e.id, fp: e.fingerprint, rule: e.ruleId, verdict: e.verdict, source: e.source,
      origin: e.originRunId, hint: e.weightHint, reason: e.reason, sha: e.commitSha, ts: e.createdAt,
    });
    return { accepted: true };
  }

  eventsFor(fingerprint: string, ruleId: string): FeedbackEvent[] {
    const rows = this.db.prepare(
      `SELECT * FROM feedback_event WHERE fingerprint=? AND rule_id=? ORDER BY created_at ASC`,
    ).all(fingerprint, ruleId) as any[];
    return rows.map((r) => ({
      id: r.id, fingerprint: r.fingerprint, ruleId: r.rule_id, verdict: r.verdict,
      source: r.source, originRunId: r.origin_run_id, weightHint: r.weight_hint,
      reason: r.reason, commitSha: r.commit_sha, createdAt: r.created_at,
    }));
  }
}
