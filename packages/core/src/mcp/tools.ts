import { openDb, type Db } from "../db/db.js";
import type { RaiConfig } from "../config/schema.js";
import type { PresentedFinding, Verdict, FeedbackSource, FindingType, PresentedStatus, Severity } from "../types.js";
import { createDefaultAnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { analyzeRepo } from "../engine/pipeline.js";
import type { SourceFile } from "../parse/graph-build.js";

export interface SessionOpts { config: RaiConfig; dbPath?: string; }

export interface CloseSessionDecision {
  fingerprint: string;
  ruleId: string;
  verdict: Verdict;
  reason?: string | undefined;
}

export interface CloseSessionInput {
  discussed?: string[] | undefined;
  summary?: string | undefined;
  decisions?: CloseSessionDecision[] | undefined;
  asOf?: number | undefined;
}

export interface CloseSessionPromptItem {
  fingerprint: string;
  ruleId: string;
  type: FindingType;
  severity: Severity;
  status: PresentedStatus;
}

export interface CloseSessionDecisionResult {
  fingerprint: string;
  ruleId: string;
  accepted: boolean;
  refusedReason?: string | undefined;
}

export interface CloseSessionResult {
  items: CloseSessionPromptItem[];
  question: string;
  results: CloseSessionDecisionResult[];
  summary?: string | undefined;
}

export interface GetDriftInput {
  baseCommit: string;
  headCommit?: string | undefined;
  ruleId?: string | undefined;
  fingerprint?: string | undefined;
}

export interface DriftEntry {
  fingerprint: string;
  rule_id: string;
  severity_raw: string;
  evidence_digest: string;
}

export interface PersistedEntry extends DriftEntry {
  stability: "changed" | "stable";
}

export type DriftResult =
  | { status: "ok"; added: DriftEntry[]; removed: DriftEntry[]; persisted: PersistedEntry[] }
  | { status: "unknown_commit"; commit: string; message: string }
  | { status: "insufficient_history"; snapshotCount: number; requiredSnapshots: 2; added: []; removed: []; message: string };

/** Engine session backing the MCP tools. One per repo. */
export class Session {
  private db: Db;
  private registry = createDefaultAnalyzerRegistry();
  private findings: FindingsStore;
  private feedback: FeedbackStore;
  private lastPresented: PresentedFinding[] = [];

  constructor(private opts: SessionOpts) {
    this.db = openDb(opts.dbPath ?? ":memory:");
    this.findings = new FindingsStore(this.db);
    this.feedback = new FeedbackStore(this.db, this.findings);
  }

  // ── analyze_repo (§5.2) — counts + handles, never a finding dump ──────
  analyzeRepo(input: { files: SourceFile[]; asOf: number; analysisVersion?: number | undefined; runId?: string | undefined; commitSha?: string | undefined }) {
    const res = analyzeRepo({
      files: input.files, registry: this.registry, findings: this.findings, feedback: this.feedback,
      config: this.opts.config, runId: input.runId ?? "run-" + input.asOf, commitSha: input.commitSha ?? "head",
      asOf: input.asOf, analysisVersion: input.analysisVersion,
    });
    this.lastPresented = res.presented;
    const active = res.presented.filter((p) => p.status !== "suppressed");
    return {
      runId: res.runId,
      analysisVersion: res.analysisVersion,
      counts: {
        byType: {
          opportunity: active.filter((p) => p.type === "opportunity").length,
          conflict: active.filter((p) => p.type === "architectural-conflict").length,
        },
        bySeverity: {
          error: active.filter((p) => p.severity === "error").length,
          warn: active.filter((p) => p.severity === "warn").length,
          info: active.filter((p) => p.severity === "info").length,
        },
        suppressed: res.presented.filter((p) => p.status === "suppressed").length,
        diagnostics: res.diagnostics.length,
      },
      topFingerprints: active.map((p) => p.fingerprint.structural),
      diagnostics: res.diagnostics,
    };
  }

  // ── find_shared_opportunities (§5.2) — opportunities & conflicts SEPARATED ──
  findSharedOpportunities(input: { includeSuppressed?: boolean | undefined }) {
    const pool = input.includeSuppressed ? this.lastPresented : this.lastPresented.filter((p) => p.status !== "suppressed");
    return {
      opportunities: pool.filter((p) => p.type === "opportunity"),
      conflicts: pool.filter((p) => p.type === "architectural-conflict"),
    };
  }

  // ── explain_finding (§5.2) — evidence + groundingFields, NO prose (§5-Fix-1) ──
  explainFinding(input: { fingerprint: string }) {
    const f = this.lastPresented.find((p) => p.fingerprint.structural === input.fingerprint);
    if (!f) throw new Error("unknown fingerprint in current analysis");
    const events = this.feedback.eventsFor(input.fingerprint, f.ruleId);
    return {
      finding: f,
      evidence: f.evidence,
      groundingFields: Object.keys(f.evidence), // the closed license set Claude may cite
      memory: {
        weight: f.weight?.value ?? 0,
        confidence: f.weight?.confidence ?? 0,
        eventCount: events.length,
        net: (f.weight && f.weight.value < 0 ? "suppress" : f.weight && f.weight.value > 0 ? "amplify" : "neutral") as
          "suppress" | "amplify" | "neutral",
        lastReason: [...events].reverse().find((e) => e.reason !== null)?.reason ?? null,
      },
    };
  }

  // ── record_feedback (§5.3) — the SOLE memory write door ──────────────
  recordFeedback(input: { fingerprint: string; ruleId: string; verdict: Verdict; source: FeedbackSource; originRunId?: string | undefined; reason?: string | undefined; asOf?: number | undefined }) {
    return this.feedback.record(input);
  }

  // ── close_session — stateless closure helper over current lastPresented ──
  closeSession(input: CloseSessionInput): CloseSessionResult {
    const promptItems = this.currentCloseSessionFindings(input.discussed).map((finding) => ({
      fingerprint: finding.fingerprint.structural,
      ruleId: finding.ruleId,
      type: finding.type,
      severity: finding.severity,
      status: finding.status,
    }));
    const results = input.decisions?.map((decision) => this.recordCloseSessionDecision(decision, input.asOf)) ?? [];
    return {
      items: promptItems,
      question: "Which findings should be accepted, rejected, confirmed, dismissed, or marked wontfix?",
      results,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
    };
  }

  // ── getDrift (§5.4) — read-only set-algebra over snapshot table ────────
  getDrift(input: GetDriftInput): DriftResult {
    // Resolve headCommit: when omitted, use most recent analyzed commit by created_at DESC
    let headCommit = input.headCommit;
    if (!headCommit) {
      const row = this.db.prepare(
        "SELECT commit_sha FROM snapshot ORDER BY created_at DESC, rowid DESC LIMIT 1"
      ).get() as { commit_sha: string } | undefined;
      if (!row) {
        return { status: "unknown_commit", commit: "", message: "run analyze_repo({commit}) to backfill" };
      }
      headCommit = row.commit_sha;
    }

    // Count distinct commits
    const { cnt } = this.db.prepare(
      "SELECT COUNT(DISTINCT commit_sha) AS cnt FROM snapshot"
    ).get() as { cnt: number };

    if (cnt < 2) {
      return {
        status: "insufficient_history",
        snapshotCount: cnt,
        requiredSnapshots: 2,
        added: [],
        removed: [],
        message: "No historical snapshots available yet. Run analysis on at least two commits.",
      };
    }

    // Verify baseCommit present
    const baseExists = this.db.prepare(
      "SELECT 1 AS found FROM snapshot WHERE commit_sha=? LIMIT 1"
    ).get(input.baseCommit) as { found: number } | undefined;
    if (!baseExists) {
      return { status: "unknown_commit", commit: input.baseCommit, message: "run analyze_repo({commit}) to backfill" };
    }

    // Verify headCommit present
    const headExists = this.db.prepare(
      "SELECT 1 AS found FROM snapshot WHERE commit_sha=? LIMIT 1"
    ).get(headCommit) as { found: number } | undefined;
    if (!headExists) {
      return { status: "unknown_commit", commit: headCommit, message: "run analyze_repo({commit}) to backfill" };
    }

    // Build optional filter fragment
    const filterParts: string[] = [];
    const filterArgs: unknown[] = [];
    if (input.ruleId) {
      filterParts.push("rule_id=?");
      filterArgs.push(input.ruleId);
    }
    if (input.fingerprint) {
      filterParts.push("fingerprint=?");
      filterArgs.push(input.fingerprint);
    }
    const filterSql = filterParts.length > 0 ? " AND " + filterParts.join(" AND ") : "";

    // Load base and head sets
    const baseRows = this.db.prepare(
      `SELECT fingerprint, rule_id, severity_raw, evidence_digest FROM snapshot WHERE commit_sha=?${filterSql}`
    ).all(input.baseCommit, ...filterArgs) as DriftEntry[];

    const headRows = this.db.prepare(
      `SELECT fingerprint, rule_id, severity_raw, evidence_digest FROM snapshot WHERE commit_sha=?${filterSql}`
    ).all(headCommit, ...filterArgs) as DriftEntry[];

    // Set-algebra keyed by (fingerprint, rule_id)
    const baseMap = new Map<string, DriftEntry>();
    for (const r of baseRows) baseMap.set(`${r.fingerprint}::${r.rule_id}`, r);

    const headMap = new Map<string, DriftEntry>();
    for (const r of headRows) headMap.set(`${r.fingerprint}::${r.rule_id}`, r);

    const added: DriftEntry[] = [];
    const removed: DriftEntry[] = [];
    const persisted: PersistedEntry[] = [];

    for (const [key, headEntry] of headMap) {
      const baseEntry = baseMap.get(key);
      if (!baseEntry) {
        added.push(headEntry);
      } else {
        persisted.push({
          ...headEntry,
          stability: headEntry.evidence_digest === baseEntry.evidence_digest ? "stable" : "changed",
        });
      }
    }

    for (const [key, baseEntry] of baseMap) {
      if (!headMap.has(key)) {
        removed.push(baseEntry);
      }
    }

    return { status: "ok", added, removed, persisted };
  }

  private currentCloseSessionFindings(discussed: string[] | undefined): PresentedFinding[] {
    if (!discussed) return this.lastPresented;
    const discussedSet = new Set(discussed);
    return this.lastPresented.filter((finding) => discussedSet.has(finding.fingerprint.structural));
  }

  private recordCloseSessionDecision(decision: CloseSessionDecision, asOf: number | undefined): CloseSessionDecisionResult {
    const finding = this.lastPresented.find((presented) =>
      presented.fingerprint.structural === decision.fingerprint && presented.ruleId === decision.ruleId,
    );
    if (!finding) {
      return {
        fingerprint: decision.fingerprint,
        ruleId: decision.ruleId,
        accepted: false,
        refusedReason: "unknown current finding",
      };
    }
    const recorded = this.feedback.record({
      fingerprint: decision.fingerprint,
      ruleId: decision.ruleId,
      verdict: decision.verdict,
      source: "human",
      reason: decision.reason,
      asOf,
    });
    return {
      fingerprint: decision.fingerprint,
      ruleId: decision.ruleId,
      accepted: recorded.accepted,
      ...(recorded.refusedReason !== undefined ? { refusedReason: recorded.refusedReason } : {}),
    };
  }
}

export function createSession(opts: SessionOpts): Session {
  return new Session(opts);
}
