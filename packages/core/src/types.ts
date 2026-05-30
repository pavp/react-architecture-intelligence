// ── Parser contract (§2.1) ──────────────────────────────────────────────
export interface Span {
  file: string;
  start: number; // byte offset
  end: number;
  kind: string; // syntactic kind tag
  astPath: string; // position-independent structural index, e.g. "module>fn[2]>jsx>child[0]"
}

// ── Graph (§2.2) ────────────────────────────────────────────────────────
export type ComponentKind = "fn" | "class" | "memo" | "forwardRef" | "arrow";
export interface ComponentNode {
  id: string;
  name: string;
  span: Span;
  kind: ComponentKind;
  file: string;
  exportKind: "default" | "named" | "none";
  propNames: string[]; // Pass-1 only — names, not types
  hookCalls: string[]; // hook names invoked
  childComponents: string[]; // JSX child component names rendered
  compositionMarkers: string[]; // memo|forwardRef|lazy|hoc
  conditionalBranches: number; // count of ternary/&&/switch in render
}
export interface ModuleNode { id: string; file: string; contentHash: string; }
export type EdgeKind = "renders" | "imports" | "calls" | "uses-hook";
export interface GraphEdge { srcId: string; dstId: string; kind: EdgeKind; }

// ── Fingerprint (§2.3) ──────────────────────────────────────────────────
export interface Fingerprint {
  structural: string;
  nominal: string;
  positional: string;
}

// ── Findings (§1.4, §3.2) ───────────────────────────────────────────────
export type Severity = "info" | "warn" | "error";
export type FindingType = "opportunity" | "architectural-conflict";

export interface SharedExtractionEvidence {
  kind: "shared-extraction";
  instances: { name: string; span: Span; fingerprint: string }[];
  cosine: number;
  propOverlap: number;
  hookOverlap: number;
  variancePoints: string[]; // props that vary → proposed API of shared component
  sharedSurface: string[]; // props shared by all → proposed shared props
  conflict?: { rule: string; why: string };
}
export type Evidence = SharedExtractionEvidence; // union grows in P4

export interface Finding {
  id: string;
  ruleId: string;
  type: FindingType;
  fingerprint: Fingerprint;
  analysisVersion: number;
  fpAlgoVersion: number;
  producingRunId: string;
  commitSha: string;
  severityRaw: Severity;
  evidence: Evidence;
  createdAt: number;
}

// A finding after read-time overlay (§3.4) — derived, never persisted.
export type PresentedStatus = "active" | "suppressed" | "amplified";
export interface PresentedFinding extends Finding {
  severity: Severity; // possibly clamped by config
  status: PresentedStatus;
  weight: Weight | null;
}

// ── Analysis Diagnostics ────────────────────────────────────────────────
export type AnalysisDiagnosticKind = "analyzer-error";
export interface AnalysisDiagnostic {
  ruleId: string;
  kind: AnalysisDiagnosticKind;
  errorName: string;
  message: string;
}

// ── Memory (§3) ─────────────────────────────────────────────────────────
export type Verdict = "accept" | "reject" | "wontfix" | "confirm" | "dismiss";
export type FeedbackSource = "human" | "agent";
export interface FeedbackEvent {
  id: string;
  fingerprint: string; // the structural layer string — keys memory, not finding.id
  ruleId: string;
  verdict: Verdict;
  source: FeedbackSource;
  originRunId: string | null;
  weightHint: number | null;
  reason: string | null;
  commitSha: string | null;
  createdAt: number;
}
export interface Weight {
  fingerprint: string;
  ruleId: string;
  value: number; // −1..+1
  confidence: number; // 0..1
  eventCount: number;
  lastEvent: number;
}

export function isFinding(x: unknown): x is Finding {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    typeof f.ruleId === "string" &&
    (f.type === "opportunity" || f.type === "architectural-conflict") &&
    typeof f.fingerprint === "object" && f.fingerprint !== null &&
    typeof f.analysisVersion === "number" &&
    typeof f.severityRaw === "string" &&
    typeof f.evidence === "object" && f.evidence !== null
  );
}
