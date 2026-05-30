import { createHash } from "node:crypto";
import type { Db } from "../db/db.js";

export interface SnapshotRow {
  commitSha: string;
  fingerprint: string;
  ruleId: string;
  severityRaw: string;
  /** The raw evidence object — will be hashed internally. */
  evidence: unknown;
  createdAt: number;
}

/**
 * Deterministic SHA-256 of an evidence object.
 * Key order is normalised so `{ b:2, a:1 }` and `{ a:1, b:2 }` produce the same digest.
 */
export function digestEvidence(evidence: unknown): string {
  const stable = stableStringify(evidence);
  return createHash("sha256").update(stable).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj).sort();
  const parts = sorted.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]));
  return "{" + parts.join(",") + "}";
}

/** Derived snapshot table writer. Idempotent via INSERT OR REPLACE. */
export class SnapshotStore {
  private readonly insertStmt: ReturnType<Db["prepare"]>;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR REPLACE INTO snapshot
         (commit_sha, fingerprint, rule_id, severity_raw, evidence_digest, created_at)
       VALUES (@sha, @fp, @rule, @sev, @digest, @ts)`,
    );
  }

  insert(row: SnapshotRow): void {
    const digest = digestEvidence(row.evidence);
    this.insertStmt.run({
      sha: row.commitSha,
      fp: row.fingerprint,
      rule: row.ruleId,
      sev: row.severityRaw,
      digest,
      ts: row.createdAt,
    });
  }
}
