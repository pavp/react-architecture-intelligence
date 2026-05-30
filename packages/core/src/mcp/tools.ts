import { openDb, type Db } from "../db/db.js";
import type { RaiConfig } from "../config/schema.js";
import type { PresentedFinding, Verdict, FeedbackSource } from "../types.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import { sharedExtraction } from "../analyzers/shared-extraction.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { analyzeRepo } from "../engine/pipeline.js";
import type { SourceFile } from "../parse/graph-build.js";

export interface SessionOpts { config: RaiConfig; dbPath?: string; }

/** Engine session backing the MCP tools. One per repo. */
export class Session {
  private db: Db;
  private registry = new AnalyzerRegistry();
  private findings: FindingsStore;
  private feedback: FeedbackStore;
  private lastPresented: PresentedFinding[] = [];

  constructor(private opts: SessionOpts) {
    this.db = openDb(opts.dbPath ?? ":memory:");
    this.registry.register(sharedExtraction);
    this.findings = new FindingsStore(this.db);
    this.feedback = new FeedbackStore(this.db, this.findings);
  }

  // ── analyze_repo (§5.2) — counts + handles, never a finding dump ──────
  analyzeRepo(input: { files: SourceFile[]; asOf: number; analysisVersion?: number; runId?: string; commitSha?: string }) {
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
      },
      topFingerprints: active.map((p) => p.fingerprint.structural),
    };
  }

  // ── find_shared_opportunities (§5.2) — opportunities & conflicts SEPARATED ──
  findSharedOpportunities(input: { includeSuppressed?: boolean }) {
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
      },
    };
  }

  // ── record_feedback (§5.3) — the SOLE memory write door ──────────────
  recordFeedback(input: { fingerprint: string; ruleId: string; verdict: Verdict; source: FeedbackSource; originRunId?: string; reason?: string; asOf?: number }) {
    return this.feedback.record(input);
  }
}

export function createSession(opts: SessionOpts): Session {
  return new Session(opts);
}
