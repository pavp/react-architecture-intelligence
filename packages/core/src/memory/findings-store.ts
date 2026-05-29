import { ulid } from "ulid";
import type { Db } from "../db/db.js";
import type { Finding } from "../types.js";

/** T3 — append-only findings (§3.2). Never UPDATE/DELETE; new versions supersede. */
export class FindingsStore {
  constructor(private db: Db) {}

  insert(f: Finding): string {
    const id = f.id || ulid();
    this.db.prepare(
      `INSERT INTO finding (id, fingerprint, rule_id, type, analysis_version, fp_algo_version,
        producing_run_id, commit_sha, severity_raw, evidence_json, created_at)
       VALUES (@id,@fp,@rule,@type,@av,@fav,@run,@sha,@sev,@ev,@ts)`,
    ).run({
      id, fp: f.fingerprint.structural, rule: f.ruleId, type: f.type,
      av: f.analysisVersion, fav: f.fpAlgoVersion, run: f.producingRunId,
      sha: f.commitSha, sev: f.severityRaw, ev: JSON.stringify(f.evidence), ts: f.createdAt,
    });
    return id;
  }

  currentVersion(structuralFp: string, ruleId: string): Finding | null {
    const row = this.db.prepare(
      `SELECT * FROM finding WHERE fingerprint=? AND rule_id=?
       ORDER BY analysis_version DESC LIMIT 1`,
    ).get(structuralFp, ruleId) as Row | undefined;
    return row ? rowToFinding(row) : null;
  }

  allVersions(structuralFp: string, ruleId: string): Finding[] {
    const rows = this.db.prepare(
      `SELECT * FROM finding WHERE fingerprint=? AND rule_id=? ORDER BY analysis_version ASC`,
    ).all(structuralFp, ruleId) as Row[];
    return rows.map(rowToFinding);
  }

  anyHistoricalVersion(structuralFp: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM finding WHERE fingerprint=? LIMIT 1`).get(structuralFp);
    return !!row;
  }
}

interface Row {
  id: string; fingerprint: string; rule_id: string; type: string;
  analysis_version: number; fp_algo_version: number; producing_run_id: string;
  commit_sha: string; severity_raw: string; evidence_json: string; created_at: number;
}

function rowToFinding(r: Row): Finding {
  return {
    id: r.id,
    ruleId: r.rule_id,
    type: r.type as Finding["type"],
    fingerprint: { structural: r.fingerprint, nominal: "", positional: "" },
    analysisVersion: r.analysis_version,
    fpAlgoVersion: r.fp_algo_version,
    producingRunId: r.producing_run_id,
    commitSha: r.commit_sha,
    severityRaw: r.severity_raw as Finding["severityRaw"],
    evidence: JSON.parse(r.evidence_json),
    createdAt: r.created_at,
  };
}
