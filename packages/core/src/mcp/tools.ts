import { openDb, type Db } from "../db/db.js";
import type { RaiConfig } from "../config/schema.js";
import type { PresentedFinding, Verdict, FeedbackSource, FindingType, PresentedStatus, Severity, Evidence, HookNode, Span } from "../types.js";
import { createDefaultAnalyzerRegistry } from "../analyzers/registry.js";
import { FindingsStore } from "../memory/findings-store.js";
import { FeedbackStore } from "../memory/feedback-store.js";
import { analyzeRepo } from "../engine/pipeline.js";
import type { SourceFile } from "../parse/graph-build.js";
import type { RepoGraph } from "../graph/repograph.js";
import type { ComponentNode, GraphEdge } from "../types.js";
import { buildSharedExtractionProposal, type SharedExtractionProposal, type PreviewProposal, type ProposalBuilder } from "../codemod/proposal.js";
import { RULE_ID as SHARED_EXTRACTION_RULE_ID } from "../analyzers/shared-extraction.js";
import { mayExecuteCodemod, type CodemodGateResult } from "../codemod/capability-gate.js";
import { previewSharedExtractionPatch, type DryRunPatchPreview } from "../codemod/dry-run.js";
import { runApplyRefactorPipeline, type ApplyPipelineResult, type ApplyWorkspace } from "../codemod/apply-pipeline.js";
import { CodemodProofStore } from "../memory/codemod-proof-store.js";
import { createTypeResolver } from "../parse/type-resolver.js";
import { explainFinding as explainPresentedFinding } from "../explainability/explain.js";
import type { TypeInfo, TypeResolver } from "../analyzers/analyzer.js";
import type { AnalyzerRegistry } from "../analyzers/registry.js";

export interface RegistryFactoryInput { files: SourceFile[]; }
export type RegistryFactory = (input: RegistryFactoryInput) => AnalyzerRegistry;

export interface SessionOpts { config: RaiConfig; dbPath?: string; registryFactory?: RegistryFactory | undefined; proposalBuilders?: ProposalBuilder[] | undefined; }

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

const QUERY_ARCHITECTURE_QUESTIONS = ["renders", "rendered-by", "fan-in", "fan-out", "reachability"] as const;
type QueryArchitectureQuestion = typeof QUERY_ARCHITECTURE_QUESTIONS[number];
const MAX_QUERY_ARCHITECTURE_DEPTH = 5;
const RAW_GRAPH_QUERY_KINDS = ["nodes", "edges"] as const;
type RawGraphQueryKind = typeof RAW_GRAPH_QUERY_KINDS[number];
const MAX_RAW_GRAPH_QUERY_LIMIT = 100;

export interface QueryArchitectureInput {
  question: string;
  target: string;
  depth?: number | undefined;
}

export interface NodeRef {
  id: string;
  name: string;
  file: string;
}

export interface EdgeRef {
  srcId: string;
  dstId: string;
  kind: string;
}

export type QueryArchitectureResult =
  | { status: "ok"; answer: Record<string, unknown>; nodes: NodeRef[]; edges: EdgeRef[] }
  | { status: "no_analysis"; message: string }
  | { status: "unknown_question"; question: string; validQuestions: QueryArchitectureQuestion[] }
  | { status: "unknown_target"; target: string };

export interface GetNodeInput {
  fingerprint?: string | undefined;
  file?: string | undefined;
  byteRange?: [number, number] | undefined;
}

export type GraphNodeDetail =
  | { kind: "component"; id: string; name: string; file: string; span: Span; exportKind: ComponentNode["exportKind"]; componentKind: ComponentNode["kind"]; propNames: string[]; hookCalls: string[]; childComponents: string[]; compositionMarkers: string[]; conditionalBranches: number }
  | { kind: "hook"; id: string; name: string; file: string; span: Span; exportKind: HookNode["exportKind"]; hookCalls: string[] }
  | { kind: "module"; id: string; file: string; contentHash: string };

export type GetNodeResult =
  | { status: "ok"; node: Exclude<GraphNodeDetail, { kind: "module" }>; span: Span; astPath: string; typeInfo?: TypeInfo | undefined }
  | { status: "no_analysis"; message: string }
  | { status: "not_found"; input: GetNodeInput };

export interface RawGraphQueryInput {
  cypherLike: string;
  limit: number;
}

export type RawGraphQueryResult =
  | { status: "ok"; rows: unknown[]; truncated: boolean }
  | { status: "no_analysis"; message: string }
  | { status: "unsupported_query"; supportedQueries: RawGraphQueryKind[] };

export type ProposeRefactorResult =
  | SharedExtractionProposal
  | PreviewProposal
  | { status: "refused"; reason: "unknown-current-finding" | "suppressed-finding" | "unsupported-rule" };

export type FindProposalsResult =
  | { actionable: Array<{ fingerprint: string; ruleId: string; subject?: string }>; count: number }
  | { status: "no_analysis"; message: string };

export type ApplyRefactorResult =
  | ApplyPipelineResult
  | DryRunPatchPreview
  | Exclude<CodemodGateResult, { status: "bound" }>;

/** Engine session backing the MCP tools. One per repo. */
export class Session {
  private db: Db;
  private registry = createDefaultAnalyzerRegistry();
  private findings: FindingsStore;
  private feedback: FeedbackStore;
  private proofs: CodemodProofStore;
  private lastPresented: PresentedFinding[] = [];
  private lastGraph: Readonly<RepoGraph> | null = null;
  private lastTypeResolver: TypeResolver | null = null;
  private lastRegistry: AnalyzerRegistry | null = null;
  private lastAnalysisVersion = 0;

  constructor(private opts: SessionOpts) {
    this.db = openDb(opts.dbPath ?? ":memory:");
    this.findings = new FindingsStore(this.db);
    this.feedback = new FeedbackStore(this.db, this.findings);
    this.proofs = new CodemodProofStore(this.db);
  }

  // ── analyze_repo (§5.2) — counts + handles, never a finding dump ──────
  analyzeRepo(input: { files: SourceFile[]; asOf: number; analysisVersion?: number | undefined; runId?: string | undefined; commitSha?: string | undefined }) {
    const registry = this.opts.registryFactory?.({ files: input.files }) ?? this.registry;
    const res = analyzeRepo({
      files: input.files, registry, findings: this.findings, feedback: this.feedback,
      config: this.opts.config, runId: input.runId ?? "run-" + input.asOf, commitSha: input.commitSha ?? "head",
      asOf: input.asOf, analysisVersion: input.analysisVersion,
    });
    this.lastPresented = res.presented;
    this.lastGraph = res.graph;
    this.lastRegistry = registry;
    this.lastTypeResolver = createTypeResolver({ files: input.files, graph: res.graph });
    this.lastAnalysisVersion = res.analysisVersion;
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

  // ── propose_refactor (P5 Slice 2 + P16-S1) — proposal-only, no writes ──
  proposeRefactor(input: { fingerprint: string }): ProposeRefactorResult {
    const finding = this.lastPresented.find((p) => p.fingerprint.structural === input.fingerprint);
    if (!finding) return { status: "refused", reason: "unknown-current-finding" };
    if (finding.status === "suppressed") return { status: "refused", reason: "suppressed-finding" };

    // Shared-extraction path: preserved as hardcoded default (not routed through injected builders).
    if (finding.ruleId === SHARED_EXTRACTION_RULE_ID) {
      return buildSharedExtractionProposal(finding);
    }

    // Injected builder dispatch: find matching builder by ruleId.
    const builder = this.opts.proposalBuilders?.find((b) => b.ruleId === finding.ruleId);
    if (!builder) return { status: "refused", reason: "unsupported-rule" };

    // Limits flow from the analyzer's explain hook via the existing registry seam — no React import needed.
    const limits = this.lastRegistry?.get(finding.ruleId)?.explain?.(finding)?.limits ?? [];
    return builder.build({ finding, limits });
  }

  // ── find_proposals (P16-S2) — read-only actionable-finding discovery ──────
  findProposals(opts?: { ruleId?: string | undefined; includeSuppressed?: boolean | undefined }): FindProposalsResult {
    if (!this.lastPresented.length) {
      return { status: "no_analysis", message: "run analyze_repo before find_proposals" };
    }
    const pool = opts?.includeSuppressed
      ? this.lastPresented
      : this.lastPresented.filter((p) => p.status !== "suppressed");

    const actionable = pool
      .filter((p) => this.isActionable(p))
      .filter((p) => opts?.ruleId === undefined || p.ruleId === opts.ruleId)
      .map((p) => {
        const subject = (p.evidence as { subject?: { name?: string } }).subject?.name;
        const entry: { fingerprint: string; ruleId: string; subject?: string } = {
          fingerprint: p.fingerprint.structural,
          ruleId: p.ruleId,
        };
        if (subject !== undefined) entry.subject = subject;
        return entry;
      })
      .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint) || a.ruleId.localeCompare(b.ruleId));

    return { actionable, count: actionable.length };
  }

  // ── apply_refactor (P5 Slice 5b2) — gated mutation through injected workspace ──
  applyRefactor(input: { fingerprint: string; sources: SourceFile[]; targetFile: string; workspace: ApplyWorkspace; commitMessage?: string | undefined; asOf?: number | undefined }): ApplyRefactorResult {
    const gate = mayExecuteCodemod(input.fingerprint, {
      ruleId: SHARED_EXTRACTION_RULE_ID,
      analysisVersion: this.lastAnalysisVersion,
      findings: this.findings,
      feedback: this.feedback,
      memoryConfig: this.opts.config.memory,
    });
    if (gate.status !== "bound") return gate;

    const proposal = buildSharedExtractionProposal(gate.finding);
    const preview = previewSharedExtractionPatch({ proposal, sources: input.sources, targetFile: input.targetFile });
    if (preview.status !== "ok") return preview;

    const result = runApplyRefactorPipeline({
      gate,
      preview,
      workspace: input.workspace,
      commitMessage: input.commitMessage ?? `refactor: apply ${SHARED_EXTRACTION_RULE_ID}`,
    });
    if (result.status === "applied" || result.status === "rolled-back") {
      this.proofs.insert({
        fingerprint: input.fingerprint,
        ruleId: SHARED_EXTRACTION_RULE_ID,
        analysisVersion: this.lastAnalysisVersion,
        patch: preview.patch,
        verificationOutput: JSON.stringify(result.verification),
        rollbackPatch: preview.rollbackPatch,
        status: result.status,
        commitSha: result.status === "applied" ? result.commitSha : null,
        createdAt: input.asOf ?? Date.now(),
      });
    }
    return result;
  }

  // ── query_architecture (§5.2) — bounded graph questions over last analysis ──
  queryArchitecture(input: QueryArchitectureInput): QueryArchitectureResult {
    if (!isQueryArchitectureQuestion(input.question)) {
      return { status: "unknown_question", question: input.question, validQuestions: [...QUERY_ARCHITECTURE_QUESTIONS] };
    }
    if (!this.lastGraph) {
      return { status: "no_analysis", message: "run analyze_repo before query_architecture" };
    }

    const target = this.findComponent(input.target);
    if (!target) return { status: "unknown_target", target: input.target };

    const edges = this.renderEdges();
    if (input.question === "renders") return this.renderChildren(target, edges);
    if (input.question === "rendered-by") return this.renderParents(target, edges);
    if (input.question === "fan-in") return this.renderCount(target, edges, "fan-in");
    if (input.question === "fan-out") return this.renderCount(target, edges, "fan-out");
    return this.renderReachability(target, edges, input.depth);
  }

  // ── get_node (§5.4 Band C) — detail lookup from latest analyzed graph ──
  getNode(input: GetNodeInput): GetNodeResult {
    if (!this.lastGraph) {
      return { status: "no_analysis", message: "run analyze_repo before get_node" };
    }
    const node = this.findGraphNode(input);
    if (!node) return { status: "not_found", input };

    const detail = toGraphNodeDetail(node);
    const typeInfo = this.lastTypeResolver?.typeOf(node.span) ?? undefined;
    return {
      status: "ok",
      node: detail,
      span: node.span,
      astPath: node.span.astPath,
      ...(typeInfo ? { typeInfo } : {}),
    };
  }

  // ── raw_graph_query (§5.4 Band C) — bounded allowlisted graph escape hatch ──
  rawGraphQuery(input: RawGraphQueryInput): RawGraphQueryResult {
    if (!this.lastGraph) {
      return { status: "no_analysis", message: "run analyze_repo before raw_graph_query" };
    }
    const query = rawGraphQueryKind(input.cypherLike);
    if (!query) return { status: "unsupported_query", supportedQueries: [...RAW_GRAPH_QUERY_KINDS] };

    const limit = normalizeRawGraphLimit(input.limit);
    const rows = query === "nodes" ? this.rawNodeRows() : this.rawEdgeRows();
    return { status: "ok", rows: rows.slice(0, limit), truncated: rows.length > limit };
  }

  hasSnapshot(commitSha: string): boolean {
    const row = this.db.prepare("SELECT 1 AS found FROM snapshot WHERE commit_sha=? LIMIT 1").get(commitSha) as { found: number } | undefined;
    return row !== undefined;
  }

  // ── explain_finding (§5.2) — raw facts plus bounded explanation ──
  explainFinding(input: { fingerprint: string }) {
    const f = this.lastPresented.find((p) => p.fingerprint.structural === input.fingerprint);
    if (!f) throw new Error("unknown fingerprint in current analysis");
    const events = this.feedback.eventsFor(input.fingerprint, f.ruleId);
    const analyzerExplanation = this.lastRegistry?.get(f.ruleId)?.explain?.(f) ?? null;
    return {
      finding: f,
      evidence: f.evidence,
      groundingFields: Object.keys(f.evidence), // the closed license set Claude may cite
      explanation: analyzerExplanation ?? explainPresentedFinding(f),
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

  /** Mirrors the actionability predicate in proposeRefactor (lines 224+229).
   * For shared-extraction findings, conflict-typed findings are refused with
   * "conflict-not-executable" by buildSharedExtractionProposal, so they are
   * not actionable. Injected builders do not have this conflict-type guard. */
  private isActionable(finding: { ruleId: string; type: FindingType }): boolean {
    if (finding.ruleId === SHARED_EXTRACTION_RULE_ID) {
      return finding.type !== "architectural-conflict";
    }
    return this.opts.proposalBuilders?.some((b) => b.ruleId === finding.ruleId) ?? false;
  }

  private findComponent(target: string): ComponentNode | null {
    const graph = this.lastGraph;
    if (!graph) return null;
    return graph.components.find((component) => component.id === target || component.name === target) ?? null;
  }

  private renderEdges(): GraphEdge[] {
    return this.lastGraph?.edges.filter((edge) => edge.kind === "renders") ?? [];
  }

  private nodeRef(component: ComponentNode): NodeRef {
    return { id: component.id, name: component.name, file: component.file };
  }

  private edgeRef(edge: GraphEdge): EdgeRef {
    return { srcId: edge.srcId, dstId: edge.dstId, kind: edge.kind };
  }

  private findGraphNode(input: GetNodeInput): ComponentNode | HookNode | null {
    const graph = this.lastGraph;
    if (!graph) return null;
    const nodes = [...graph.components, ...graph.hooks];
    if (input.fingerprint) {
      const finding = this.lastPresented.find((presented) => presented.fingerprint.structural === input.fingerprint);
      const span = spanFromEvidence(finding?.evidence);
      if (span) return nodes.find((node) => sameSpan(node.span, span)) ?? null;
    }
    if (input.file && input.byteRange) {
      const [start, end] = input.byteRange;
      return nodes.find((node) => node.file === input.file && spansOverlap(node.span, start, end)) ?? null;
    }
    if (input.file) return nodes.find((node) => node.file === input.file) ?? null;
    return null;
  }

  private rawNodeRows(): unknown[] {
    const graph = this.lastGraph;
    if (!graph) return [];
    return [
      ...graph.components.map((node) => toGraphNodeDetail(node)),
      ...graph.hooks.map((node) => toGraphNodeDetail(node)),
      ...graph.modules.map((node) => ({ kind: "module" as const, ...node })),
    ].sort(compareRawRows);
  }

  private rawEdgeRows(): unknown[] {
    return this.lastGraph?.edges.slice().sort(compareEdge).map((edge) => this.edgeRef(edge)) ?? [];
  }

  private componentsForEdges(edges: GraphEdge[], includeTarget: ComponentNode): NodeRef[] {
    const ids = new Set<string>([includeTarget.id]);
    for (const edge of edges) {
      ids.add(edge.srcId);
      ids.add(edge.dstId);
    }
    return [...ids]
      .map((id) => this.findComponent(id))
      .filter((component): component is ComponentNode => component !== null)
      .map((component) => this.nodeRef(component))
      .sort(compareNodeRef);
  }

  private renderChildren(target: ComponentNode, edges: GraphEdge[]): QueryArchitectureResult {
    const selectedEdges = edges.filter((edge) => edge.srcId === target.id).sort(compareEdge);
    const children = selectedEdges
      .map((edge) => this.findComponent(edge.dstId))
      .filter((component): component is ComponentNode => component !== null)
      .map((component) => this.nodeRef(component))
      .sort(compareNodeRef);
    return {
      status: "ok",
      answer: { question: "renders", target: this.nodeRef(target), children },
      nodes: this.componentsForEdges(selectedEdges, target),
      edges: selectedEdges.map((edge) => this.edgeRef(edge)),
    };
  }

  private renderParents(target: ComponentNode, edges: GraphEdge[]): QueryArchitectureResult {
    const selectedEdges = edges.filter((edge) => edge.dstId === target.id).sort(compareEdge);
    const parents = selectedEdges
      .map((edge) => this.findComponent(edge.srcId))
      .filter((component): component is ComponentNode => component !== null)
      .map((component) => this.nodeRef(component))
      .sort(compareNodeRef);
    return {
      status: "ok",
      answer: { question: "rendered-by", target: this.nodeRef(target), parents },
      nodes: this.componentsForEdges(selectedEdges, target),
      edges: selectedEdges.map((edge) => this.edgeRef(edge)),
    };
  }

  private renderCount(target: ComponentNode, edges: GraphEdge[], question: "fan-in" | "fan-out"): QueryArchitectureResult {
    const selectedEdges = edges.filter((edge) => question === "fan-in" ? edge.dstId === target.id : edge.srcId === target.id).sort(compareEdge);
    return {
      status: "ok",
      answer: { question, target: this.nodeRef(target), count: selectedEdges.length },
      nodes: this.componentsForEdges(selectedEdges, target),
      edges: selectedEdges.map((edge) => this.edgeRef(edge)),
    };
  }

  private renderReachability(target: ComponentNode, edges: GraphEdge[], requestedDepth: number | undefined): QueryArchitectureResult {
    const maxDepth = normalizeDepth(requestedDepth);
    const visited = new Set<string>([target.id]);
    const selectedEdges: GraphEdge[] = [];
    let frontier = [target.id];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const srcId of frontier) {
        const outgoing = edges.filter((edge) => edge.srcId === srcId).sort(compareEdge);
        for (const edge of outgoing) {
          selectedEdges.push(edge);
          if (!visited.has(edge.dstId)) {
            visited.add(edge.dstId);
            next.push(edge.dstId);
          }
        }
      }
      frontier = next;
    }

    const reachable = [...visited]
      .filter((id) => id !== target.id)
      .map((id) => this.findComponent(id))
      .filter((component): component is ComponentNode => component !== null)
      .map((component) => this.nodeRef(component))
      .sort(compareNodeRef);
    const uniqueEdges = uniqueGraphEdges(selectedEdges).sort(compareEdge);
    return {
      status: "ok",
      answer: { question: "reachability", target: this.nodeRef(target), depth: maxDepth, reachable },
      nodes: this.componentsForEdges(uniqueEdges, target),
      edges: uniqueEdges.map((edge) => this.edgeRef(edge)),
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

    // Verify baseCommit present (must happen before cnt check — spec: absent commit → unknown_commit regardless of count)
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

    // Both commits present — count distinct commits for history guard
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

function isQueryArchitectureQuestion(question: string): question is QueryArchitectureQuestion {
  return (QUERY_ARCHITECTURE_QUESTIONS as readonly string[]).includes(question);
}

function normalizeDepth(depth: number | undefined): number {
  if (depth === undefined) return 1;
  if (!Number.isFinite(depth) || depth < 1) return 1;
  return Math.min(Math.floor(depth), MAX_QUERY_ARCHITECTURE_DEPTH);
}

function compareNodeRef(a: NodeRef, b: NodeRef): number {
  return a.name.localeCompare(b.name) || a.file.localeCompare(b.file) || a.id.localeCompare(b.id);
}

function compareEdge(a: GraphEdge, b: GraphEdge): number {
  return a.srcId.localeCompare(b.srcId) || a.dstId.localeCompare(b.dstId) || a.kind.localeCompare(b.kind);
}

function uniqueGraphEdges(edges: GraphEdge[]): GraphEdge[] {
  const byKey = new Map<string, GraphEdge>();
  for (const edge of edges) byKey.set(`${edge.kind}:${edge.srcId}:${edge.dstId}`, edge);
  return [...byKey.values()];
}

function toGraphNodeDetail(node: ComponentNode): Exclude<GraphNodeDetail, { kind: "module" }>;
function toGraphNodeDetail(node: HookNode): Exclude<GraphNodeDetail, { kind: "module" }>;
function toGraphNodeDetail(node: ComponentNode | HookNode): Exclude<GraphNodeDetail, { kind: "module" }> {
  if ("propNames" in node) {
    return {
      kind: "component",
      id: node.id,
      name: node.name,
      file: node.file,
      span: node.span,
      exportKind: node.exportKind,
      componentKind: node.kind,
      propNames: node.propNames,
      hookCalls: node.hookCalls,
      childComponents: node.childComponents,
      compositionMarkers: node.compositionMarkers,
      conditionalBranches: node.conditionalBranches,
    };
  }
  return {
    kind: "hook",
    id: node.id,
    name: node.name,
    file: node.file,
    span: node.span,
    exportKind: node.exportKind,
    hookCalls: node.hookCalls,
  };
}

function spanFromEvidence(evidence: Evidence | undefined): Span | null {
  if (!evidence) return null;
  if (evidence.kind === "shared-extraction") return evidence.instances[0]?.span ?? null;
  if (evidence.kind === "render-coupling") return evidence.component.span;
  if (evidence.kind === "over-abstraction") return evidence.component.span;
  if (evidence.kind === "hook-topology") return evidence.hook.span;
  if (evidence.kind === "adapter-metric") return evidence.subject.span;
  return evidence.edge.from.span;
}

function sameSpan(a: Span, b: Span): boolean {
  return a.file === b.file && a.start === b.start && a.end === b.end && a.kind === b.kind && a.astPath === b.astPath;
}

function spansOverlap(span: Span, start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && span.start < end && start < span.end;
}

function rawGraphQueryKind(query: string): RawGraphQueryKind | null {
  const normalized = query.trim().toLowerCase();
  if (/\bnodes?\b/.test(normalized)) return "nodes";
  if (/\bedges?\b/.test(normalized)) return "edges";
  return null;
}

function normalizeRawGraphLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.floor(limit), MAX_RAW_GRAPH_QUERY_LIMIT);
}

function compareRawRows(a: unknown, b: unknown): number {
  return rawRowKey(a).localeCompare(rawRowKey(b));
}

function rawRowKey(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const r = row as { kind?: string; file?: string; name?: string; id?: string };
  return `${r.kind ?? ""}:${r.file ?? ""}:${r.name ?? ""}:${r.id ?? ""}`;
}

export function createSession(opts: SessionOpts): Session {
  return new Session(opts);
}
