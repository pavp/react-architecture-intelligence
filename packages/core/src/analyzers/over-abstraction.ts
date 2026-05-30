import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { Analyzer, AnalysisContext } from "./analyzer.js";
import { FP_ALGO_VERSION, structuralFingerprint } from "../fingerprint/structural.js";
import type { ComponentNode, Finding, Severity } from "../types.js";

export const RULE_ID = "react/over-abstraction";

interface OverAbstractionMetrics {
  propCount: number;
  hookCount: number;
  childCount: number;
  compositionMarkerCount: number;
  conditionalBranchCount: number;
}

export const overAbstraction: Analyzer = {
  ruleId: RULE_ID,
  framework: "react",
  analyze(ctx: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const component of [...ctx.graph.components].sort(compareComponents)) {
      const metrics: OverAbstractionMetrics = {
        propCount: component.propNames.length,
        hookCount: component.hookCalls.length,
        childCount: component.childComponents.length,
        compositionMarkerCount: component.compositionMarkers.length,
        conditionalBranchCount: component.conditionalBranches,
      };
      const breachedMetricNames = breachedMetrics(metrics, ctx.config.overAbstraction);
      if (breachedMetricNames.length === 0) continue;

      const componentFingerprint = structuralFingerprint(component);
      findings.push({
        id: ulid(),
        ruleId: RULE_ID,
        type: "opportunity",
        fingerprint: fingerprintFor(component, componentFingerprint, breachedMetricNames),
        analysisVersion: ctx.analysisVersion,
        fpAlgoVersion: FP_ALGO_VERSION,
        producingRunId: ctx.runId,
        commitSha: ctx.commitSha,
        severityRaw: severityFor(breachedMetricNames.length),
        evidence: {
          kind: "over-abstraction",
          component: { name: component.name, span: component.span, fingerprint: componentFingerprint },
          propCount: metrics.propCount,
          hookCount: metrics.hookCount,
          childCount: metrics.childCount,
          compositionMarkerCount: metrics.compositionMarkerCount,
          conditionalBranchCount: metrics.conditionalBranchCount,
        },
        createdAt: 0,
      });
    }

    findings.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
    return findings;
  },
};

function compareComponents(a: ComponentNode, b: ComponentNode): number {
  return `${a.id}:${a.name}:${a.file}`.localeCompare(`${b.id}:${b.name}:${b.file}`);
}

function breachedMetrics(
  metrics: OverAbstractionMetrics,
  thresholds: {
    maxProps: number;
    maxHooks: number;
    maxChildren: number;
    maxCompositionMarkers: number;
    maxConditionalBranches: number;
  },
): string[] {
  return [
    metrics.propCount > thresholds.maxProps ? "propCount" : null,
    metrics.hookCount > thresholds.maxHooks ? "hookCount" : null,
    metrics.childCount > thresholds.maxChildren ? "childCount" : null,
    metrics.compositionMarkerCount > thresholds.maxCompositionMarkers ? "compositionMarkerCount" : null,
    metrics.conditionalBranchCount > thresholds.maxConditionalBranches ? "conditionalBranchCount" : null,
  ].filter((metric): metric is string => metric !== null);
}

function fingerprintFor(component: ComponentNode, componentFingerprint: string, breachedMetricNames: string[]) {
  return {
    structural: sha([RULE_ID, componentFingerprint, ...breachedMetricNames].join("|")),
    nominal: sha(component.name),
    positional: sha(component.file),
  };
}

function severityFor(breachCount: number): Severity {
  return breachCount >= 3 ? "error" : breachCount >= 2 ? "warn" : "info";
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
