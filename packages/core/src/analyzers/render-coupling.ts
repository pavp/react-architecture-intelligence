import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { Analyzer, AnalysisContext } from "./analyzer.js";
import { FP_ALGO_VERSION, structuralFingerprint } from "../fingerprint/structural.js";
import type { ComponentNode, Finding, Severity } from "../types.js";

export const RULE_ID = "react/render-coupling";

interface RenderMetrics {
  fanIn: number;
  fanOut: number;
  directChildren: number;
  reachableDepth: number;
}

export const renderCoupling: Analyzer = {
  ruleId: RULE_ID,
  framework: "react",
  analyze(ctx: AnalysisContext): Finding[] {
    const components = [...ctx.graph.components].sort(compareComponents);
    const componentIds = new Set(components.map((component) => component.id));
    const renderEdges = ctx.graph.edges
      .filter((edge) => edge.kind === "renders" && componentIds.has(edge.srcId) && componentIds.has(edge.dstId))
      .sort((a, b) => `${a.srcId}:${a.dstId}`.localeCompare(`${b.srcId}:${b.dstId}`));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, string[]>();

    for (const edge of renderEdges) {
      incoming.set(edge.dstId, (incoming.get(edge.dstId) ?? 0) + 1);
      outgoing.set(edge.srcId, [...(outgoing.get(edge.srcId) ?? []), edge.dstId].sort());
    }

    const findings: Finding[] = [];
    for (const component of components) {
      const childIds = outgoing.get(component.id) ?? [];
      const metrics: RenderMetrics = {
        fanIn: incoming.get(component.id) ?? 0,
        fanOut: childIds.length,
        directChildren: new Set(childIds).size,
        reachableDepth: reachableDepth(component.id, outgoing),
      };
      const breachedMetricNames = breachedMetrics(metrics, ctx.config.renderCoupling);
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
          kind: "render-coupling",
          component: { name: component.name, span: component.span, fingerprint: componentFingerprint },
          fanIn: metrics.fanIn,
          fanOut: metrics.fanOut,
          directChildren: metrics.directChildren,
          reachableDepth: metrics.reachableDepth,
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

function reachableDepth(rootId: string, outgoing: ReadonlyMap<string, readonly string[]>): number {
  const walk = (id: string, path: ReadonlySet<string>): number => {
    const childIds = outgoing.get(id) ?? [];
    if (childIds.length === 0) return 0;

    let maxDepth = 0;
    for (const childId of childIds) {
      if (path.has(childId)) continue;
      maxDepth = Math.max(maxDepth, 1 + walk(childId, new Set([...path, childId])));
    }
    return maxDepth;
  };

  return walk(rootId, new Set([rootId]));
}

function breachedMetrics(
  metrics: RenderMetrics,
  thresholds: { maxFanIn: number; maxFanOut: number; maxDirectChildren: number; maxReachableDepth: number },
): string[] {
  return [
    metrics.fanIn > thresholds.maxFanIn ? "fanIn" : null,
    metrics.fanOut > thresholds.maxFanOut ? "fanOut" : null,
    metrics.directChildren > thresholds.maxDirectChildren ? "directChildren" : null,
    metrics.reachableDepth > thresholds.maxReachableDepth ? "reachableDepth" : null,
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
