import { RULE_ID as SHARED_EXTRACTION_RULE_ID } from "../analyzers/shared-extraction.js";
import type { Finding, PresentedFinding, SharedExtractionEvidence } from "../types.js";

export type ProposalRefusalReason = "unsupported-rule" | "conflict-not-executable";

// ── PreviewProposal — generic preview-only proposal envelope (no patch, no apply path) ──

export interface PreviewProposal {
  status: "preview";
  kind: "preview-only";
  fingerprint: string;
  ruleId: string;
  subject: { name: string; file: string; span: unknown };
  observations: string[];
  consider: string[];
  limits: string[];
  writeMode: "proposal-only";
}

// ── ProposalBuilder — injected factory interface (no React-specific types in core) ──

export interface ProposalBuilderInput {
  finding: PresentedFinding;
  limits: string[];
}

export interface ProposalBuilder {
  ruleId: string;
  build(input: ProposalBuilderInput): PreviewProposal | { status: "refused"; reason: "unsupported-rule" };
}
export type ProposalRiskLevel = "low" | "medium" | "high";
export type ProposalRiskReason =
  | "default-export-rewrite"
  | "named-export-rewrite"
  | "invalid-span"
  | "unsafe-variance-parameter"
  | "duplicate-source-file";

export interface ProposalRisk {
  level: ProposalRiskLevel;
  reasons: ProposalRiskReason[];
}

export type SharedExtractionProposal =
  | {
      status: "ok";
      fingerprint: string;
      ruleId: typeof SHARED_EXTRACTION_RULE_ID;
      componentName: string;
      sourceInstances: SharedExtractionEvidence["instances"];
      varianceParameters: string[];
      sharedProps: string[];
      risk: ProposalRisk;
      writeMode: "proposal-only";
    }
  | { status: "refused"; reason: ProposalRefusalReason };

export function buildSharedExtractionProposal(finding: Finding): SharedExtractionProposal {
  if (finding.type === "architectural-conflict") return { status: "refused", reason: "conflict-not-executable" };
  if (finding.ruleId !== SHARED_EXTRACTION_RULE_ID || finding.evidence.kind !== "shared-extraction") {
    return { status: "refused", reason: "unsupported-rule" };
  }

  const evidence = finding.evidence;
  return {
    status: "ok",
    fingerprint: finding.fingerprint.structural,
    ruleId: SHARED_EXTRACTION_RULE_ID,
    componentName: componentNameCandidate(evidence.instances.map((instance) => instance.name)),
    sourceInstances: evidence.instances,
    varianceParameters: [...evidence.variancePoints].sort(),
    sharedProps: [...evidence.sharedSurface].sort(),
    risk: riskFor(evidence),
    writeMode: "proposal-only",
  };
}

function riskFor(evidence: SharedExtractionEvidence): ProposalRisk {
  const reasons = new Set<ProposalRiskReason>();
  const files = new Set<string>();
  for (const instance of evidence.instances) {
    if (instance.exportKind === "default") reasons.add("default-export-rewrite");
    if (instance.exportKind === "named") reasons.add("named-export-rewrite");
    if (instance.span.end <= instance.span.start) reasons.add("invalid-span");
    if (files.has(instance.span.file)) reasons.add("duplicate-source-file");
    files.add(instance.span.file);
  }
  for (const prop of evidence.variancePoints) {
    if (!isSafePropName(prop)) reasons.add("unsafe-variance-parameter");
  }
  const ordered = [...reasons].sort();
  return { level: highRisk(ordered) ? "high" : ordered.length > 0 ? "medium" : "low", reasons: ordered };
}

function highRisk(reasons: ProposalRiskReason[]): boolean {
  return reasons.includes("default-export-rewrite") || reasons.includes("invalid-span");
}

function isSafePropName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

function componentNameCandidate(names: string[]): string {
  const suffix = longestCommonSuffix(names.map(normalizeComponentName));
  return "Shared" + (suffix || "Component");
}

function normalizeComponentName(name: string): string {
  return name.endsWith("Btn") ? name.slice(0, -3) + "Button" : name;
}

function longestCommonSuffix(names: string[]): string {
  let suffix = names[0] ?? "";
  for (const name of names) {
    while (suffix && !name.endsWith(suffix)) suffix = suffix.slice(1);
  }
  return suffix;
}
