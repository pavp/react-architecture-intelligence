// ── Parser contract (§2.1) ──────────────────────────────────────────────
export interface Span {
  file: string;
  start: number; // byte offset
  end: number;
  kind: string; // syntactic kind tag
  astPath: string; // position-independent structural index, e.g. "module>fn[2]>jsx>child[0]"
}

// ── Pattern syntax facts (framework-neutral source observations) ───────────
export type PatternFactKind = "import" | "export" | "call" | "call-binding" | "call-argument" | "jsx" | "jsx-attribute" | "hook-call" | "member-assignment" | "file-role-seed";

export interface PatternImportSpecifierFact {
  imported: string;
  local: string;
  mode: "default" | "named" | "namespace";
}

export interface PatternFactBase {
  id: string;
  kind: PatternFactKind;
  file: string;
  span: Span;
}

export interface PatternImportFact extends PatternFactBase {
  kind: "import";
  source: string;
  specifiers: PatternImportSpecifierFact[];
}

export interface PatternExportFact extends PatternFactBase {
  kind: "export";
  exported: string;
  local: string;
  source: string;
  mode: "default" | "named";
}

export interface PatternCallFact extends PatternFactBase {
  kind: "call";
  callee: string;
}

export interface PatternCallBindingFact extends PatternFactBase {
  kind: "call-binding";
  local: string;
  callee: string;
  declarationKind: "const" | "let" | "var";
}

export interface PatternCallArgumentFact extends PatternFactBase {
  kind: "call-argument";
  callee: string;
  argumentIndex: number;
  argument: string;
  argumentKind: "identifier" | "member" | "literal" | "call" | "unknown";
}

export interface PatternJsxFact extends PatternFactBase {
  kind: "jsx";
  tag: string;
  parentTag: string;
}

export interface PatternJsxAttributeFact extends PatternFactBase {
  kind: "jsx-attribute";
  tag: string;
  parentTag: string;
  name: string;
  value: string;
  valueKind: "absent" | "literal" | "expression" | "spread" | "unknown";
}

export interface PatternHookCallFact extends PatternFactBase {
  kind: "hook-call";
  name: string;
}

export interface PatternMemberAssignmentFact extends PatternFactBase {
  kind: "member-assignment";
  object: string;
  property: string;
  value: string;
}

export interface PatternFileRoleSeedFact extends PatternFactBase {
  kind: "file-role-seed";
  seed: string;
  source: "path" | "directive";
}

export type PatternFact =
  | PatternImportFact
  | PatternExportFact
  | PatternCallFact
  | PatternCallBindingFact
  | PatternCallArgumentFact
  | PatternJsxFact
  | PatternJsxAttributeFact
  | PatternHookCallFact
  | PatternMemberAssignmentFact
  | PatternFileRoleSeedFact;

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
export interface HookNode {
  id: string;
  name: string;
  span: Span;
  file: string;
  exportKind: "default" | "named" | "none";
  hookCalls: string[]; // hook names invoked by this hook
}
export interface ModuleNode { id: string; file: string; contentHash: string; }
export type EdgeKind = "renders" | "imports" | "calls" | "uses-hook" | "passes";
export interface GraphEdge { srcId: string; dstId: string; kind: EdgeKind; propNames?: string[]; }

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
  instances: { name: string; span: Span; fingerprint: string; exportKind: ComponentNode["exportKind"] }[];
  cosine: number;
  propOverlap: number;
  hookOverlap: number;
  variancePoints: string[]; // props that vary → proposed API of shared component
  sharedSurface: string[]; // props shared by all → proposed shared props
  conflict?: { rule: string; why: string };
}

export interface RenderCouplingEvidence {
  kind: "render-coupling";
  component: { name: string; span: Span; fingerprint: string };
  fanIn: number;
  fanOut: number;
  directChildren: number;
  reachableDepth: number;
}

export interface OverAbstractionEvidence {
  kind: "over-abstraction";
  component: { name: string; span: Span; fingerprint: string };
  propCount: number;
  hookCount: number;
  childCount: number;
  compositionMarkerCount: number;
  conditionalBranchCount: number;
}

export interface HookTopologyEvidence {
  kind: "hook-topology";
  hook: { name: string; span: Span; fingerprint: string };
  fanIn: number;
  fanOut: number;
  directDependencies: number;
  reachableDepth: number;
}

export interface BoundaryViolationEvidence {
  kind: "boundary-violation";
  convention: { id: string; edgeKind: "renders" | "uses-hook"; policy: "forbid"; reason: string };
  edge: {
    kind: "renders" | "uses-hook";
    from: { id: string; kind: "component" | "hook"; name: string; file: string; span: Span };
    to: { id: string; kind: "component" | "hook"; name: string; file: string; span: Span };
  };
}

export interface AdapterMetricEvidence {
  kind: "adapter-metric";
  adapterId: string;
  ruleId: string;
  subject: { id: string; name: string; file: string; span: Span; fingerprint: string };
  roles: { role: string; variant: string; file: string }[];
  metrics: Record<string, number>;
  thresholds: Record<string, number>;
  topology: { directChildIds: string[]; reachableNodeIds: string[]; exceeded: string[] };
}

export type Evidence = SharedExtractionEvidence | RenderCouplingEvidence | OverAbstractionEvidence | HookTopologyEvidence | BoundaryViolationEvidence | AdapterMetricEvidence;

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

// ── Explainability (presentation-only; derived, never persisted) ────────────
export interface ExplanationGlossaryEntry {
  term: string;
  definition: string;
  known: boolean;
}

export interface ExplanationEnvelope {
  summary: string;
  whyItMatters: string;
  inspectFirst: string[];
  limits: string[];
  groundingFields: string[];
  glossary: ExplanationGlossaryEntry[];
}

// ── Analysis Diagnostics ────────────────────────────────────────────────
export type AnalysisDiagnosticKind = "analyzer-error" | "snapshot-skipped" | "variant-mismatch" | "adapter-load-skipped";
export type AnalysisDiagnostic =
  | { kind: "analyzer-error"; ruleId: string; errorName: string; message: string }
  | { kind: "snapshot-skipped"; message: string }
  | { kind: "variant-mismatch"; adapterId: string; analyzerId: string; detectedVariant: string; supportedVariants: string[]; rootDir: string; message: string }
  | { kind: "adapter-load-skipped"; adapterId: string; packageName: string; errorName: string; message: string };

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
