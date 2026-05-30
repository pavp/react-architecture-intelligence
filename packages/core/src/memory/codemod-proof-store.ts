import { ulid } from "ulid";
import type { Db } from "../db/db.js";

export type CodemodProofStatus = "applied" | "rolled-back" | "refused";

export interface CodemodProofInput {
  fingerprint: string;
  ruleId: string;
  analysisVersion: number;
  patch: string;
  verificationOutput: string;
  rollbackPatch: string;
  status: CodemodProofStatus;
  commitSha: string | null;
  createdAt: number;
}

export interface CodemodProofRow extends CodemodProofInput {
  id: string;
}

export class CodemodProofStore {
  constructor(private db: Db) {}

  insert(input: CodemodProofInput): string {
    const id = ulid();
    this.db.prepare(
      `INSERT INTO codemod_proof (id, fingerprint, rule_id, analysis_version, patch,
        verification_output, rollback_patch, status, commit_sha, created_at)
       VALUES (@id, @fp, @rule, @analysisVersion, @patch, @verificationOutput,
        @rollbackPatch, @status, @commitSha, @createdAt)`,
    ).run({
      id,
      fp: input.fingerprint,
      rule: input.ruleId,
      analysisVersion: input.analysisVersion,
      patch: input.patch,
      verificationOutput: input.verificationOutput,
      rollbackPatch: input.rollbackPatch,
      status: input.status,
      commitSha: input.commitSha,
      createdAt: input.createdAt,
    });
    return id;
  }

  recent(limit: number): CodemodProofRow[] {
    const rows = this.db.prepare(
      `SELECT * FROM codemod_proof ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).all(limit) as Row[];
    return rows.map(rowToProof);
  }
}

interface Row {
  id: string;
  fingerprint: string;
  rule_id: string;
  analysis_version: number;
  patch: string;
  verification_output: string;
  rollback_patch: string;
  status: CodemodProofStatus;
  commit_sha: string | null;
  created_at: number;
}

function rowToProof(row: Row): CodemodProofRow {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    ruleId: row.rule_id,
    analysisVersion: row.analysis_version,
    patch: row.patch,
    verificationOutput: row.verification_output,
    rollbackPatch: row.rollback_patch,
    status: row.status,
    commitSha: row.commit_sha,
    createdAt: row.created_at,
  };
}
