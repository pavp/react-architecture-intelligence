import type { ExplanationEnvelope, PresentedFinding } from "../types.js";
import { explainTerm } from "./glossary.js";

export function explainFinding(finding: PresentedFinding): ExplanationEnvelope {
  const groundingFields = Object.keys(finding.evidence).sort();
  const glossary = groundingFields.map(explainTerm);
  const hasUnknown = glossary.some((entry) => !entry.known);
  if (finding.evidence.kind === "shared-extraction") {
    const inspectFirst = finding.evidence.instances.map((instance) => instance.span.file);
    return {
      summary: `RAI found ${finding.evidence.instances.length} similar components for ${finding.ruleId}.`,
      whyItMatters: "This may indicate repeated UI structure already visible in code.",
      inspectFirst,
      limits: ["Do not assume shared ownership, intent, or safe remediation from this finding alone."],
      groundingFields,
      glossary,
    };
  }

  return {
    summary: `RAI found ${finding.evidence.kind} evidence for ${finding.ruleId}.`,
    whyItMatters: "This finding points to code structure RAI measured directly.",
    inspectFirst: inspectFirstForEvidence(finding.evidence, groundingFields),
    limits: [
      "Do not assume shared ownership, intent, root cause, or safe remediation from this finding alone.",
      ...(hasUnknown ? ["Unknown evidence keys are raw facts, not inferred meaning."] : []),
    ],
    groundingFields,
    glossary,
  };
}

function inspectFirstForEvidence(evidence: PresentedFinding["evidence"], groundingFields: string[]): string[] {
  if (evidence.kind === "render-coupling") {
    return [
      `${evidence.component.name} in ${evidence.component.span.file}`,
      `${evidence.fanIn} inbound render ${plural(evidence.fanIn, "link")}`,
      `${evidence.fanOut} downstream render ${plural(evidence.fanOut, "link")}`,
      `${evidence.directChildren} direct ${plural(evidence.directChildren, "child", "children")}`,
      `render tree depth: ${evidence.reachableDepth}`,
    ];
  }
  if (evidence.kind === "over-abstraction") {
    return [
      `${evidence.component.name} in ${evidence.component.span.file}`,
      `${evidence.propCount} ${plural(evidence.propCount, "prop")}`,
      `${evidence.hookCount} ${plural(evidence.hookCount, "hook")}`,
      `${evidence.childCount} rendered ${plural(evidence.childCount, "child", "children")}`,
      `${evidence.compositionMarkerCount} composition ${plural(evidence.compositionMarkerCount, "marker")}`,
      `${evidence.conditionalBranchCount} conditional ${plural(evidence.conditionalBranchCount, "branch", "branches")}`,
    ];
  }
  if (evidence.kind === "hook-topology") {
    return [
      `${evidence.hook.name} in ${evidence.hook.span.file}`,
      `${evidence.fanIn} inbound dependency ${plural(evidence.fanIn, "link")}`,
      `${evidence.fanOut} downstream dependency ${plural(evidence.fanOut, "link")}`,
      `${evidence.directDependencies} direct ${plural(evidence.directDependencies, "dependency", "dependencies")}`,
      `dependency tree depth: ${evidence.reachableDepth}`,
    ];
  }
  if (evidence.kind === "boundary-violation") {
    return [
      `${evidence.edge.from.name} in ${evidence.edge.from.file}`,
      `${evidence.edge.to.name} in ${evidence.edge.to.file}`,
      `${edgeLabel(evidence.edge.kind)} violates ${evidence.convention.id}`,
    ];
  }
  if (evidence.kind === "adapter-metric") {
    return [
      `${evidence.subject.name} in ${evidence.subject.file}`,
      `adapter: ${evidence.adapterId}`,
      `rule: ${evidence.ruleId}`,
      ...evidence.roles.map((role) => `role ${role.role} (${role.variant}) in ${role.file}`),
      ...Object.entries(evidence.metrics).map(([key, value]) => `metric ${key}: ${value}`),
      ...Object.entries(evidence.thresholds).map(([key, value]) => `threshold ${key}: ${value}`),
      `exceeded topology: ${evidence.topology.exceeded.join(", ") || "none"}`,
    ];
  }
  return groundingFields.length > 0 ? [`raw evidence keys: ${groundingFields.join(", ")}`] : [];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function edgeLabel(kind: "renders" | "uses-hook"): string {
  return kind === "renders" ? "render link" : "hook-use link";
}
