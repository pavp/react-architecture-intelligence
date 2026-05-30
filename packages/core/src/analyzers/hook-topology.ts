import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { Analyzer, AnalysisContext } from "./analyzer.js";
import { FP_ALGO_VERSION } from "../fingerprint/structural.js";
import type { Finding, HookNode, Severity } from "../types.js";

export const RULE_ID = "react/hook-topology";

interface HookMetrics {
  fanIn: number;
  fanOut: number;
  directDependencies: number;
  reachableDepth: number;
}

export const hookTopology: Analyzer = {
  ruleId: RULE_ID,
  framework: "react",
  analyze(ctx: AnalysisContext): Finding[] {
    const hooks = [...ctx.graph.hooks].sort(compareHooks);
    const hookIds = new Set(hooks.map((hook) => hook.id));
    const hookEdges = ctx.graph.edges
      .filter((edge) => edge.kind === "uses-hook" && hookIds.has(edge.srcId) && hookIds.has(edge.dstId))
      .sort((a, b) => `${a.srcId}:${a.dstId}`.localeCompare(`${b.srcId}:${b.dstId}`));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, string[]>();

    for (const edge of hookEdges) {
      incoming.set(edge.dstId, (incoming.get(edge.dstId) ?? 0) + 1);
      outgoing.set(edge.srcId, [...(outgoing.get(edge.srcId) ?? []), edge.dstId].sort());
    }

    const findings: Finding[] = [];
    for (const hook of hooks) {
      const dependencyIds = outgoing.get(hook.id) ?? [];
      const metrics: HookMetrics = {
        fanIn: incoming.get(hook.id) ?? 0,
        fanOut: dependencyIds.length,
        directDependencies: new Set(dependencyIds).size,
        reachableDepth: reachableDepth(hook.id, outgoing),
      };
      const breachedMetricNames = breachedMetrics(metrics, ctx.config.hookTopology);
      if (breachedMetricNames.length === 0) continue;

      const hookFingerprint = fingerprintHook(hook);
      findings.push({
        id: ulid(),
        ruleId: RULE_ID,
        type: "opportunity",
        fingerprint: fingerprintFor(hook, hookFingerprint, breachedMetricNames),
        analysisVersion: ctx.analysisVersion,
        fpAlgoVersion: FP_ALGO_VERSION,
        producingRunId: ctx.runId,
        commitSha: ctx.commitSha,
        severityRaw: severityFor(breachedMetricNames.length),
        evidence: {
          kind: "hook-topology",
          hook: { name: hook.name, span: hook.span, fingerprint: hookFingerprint },
          fanIn: metrics.fanIn,
          fanOut: metrics.fanOut,
          directDependencies: metrics.directDependencies,
          reachableDepth: metrics.reachableDepth,
        },
        createdAt: 0,
      });
    }

    findings.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
    return findings;
  },
};

function compareHooks(a: HookNode, b: HookNode): number {
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
  metrics: HookMetrics,
  thresholds: { maxFanIn: number; maxFanOut: number; maxDirectDependencies: number; maxReachableDepth: number },
): string[] {
  return [
    metrics.fanIn > thresholds.maxFanIn ? "fanIn" : null,
    metrics.fanOut > thresholds.maxFanOut ? "fanOut" : null,
    metrics.directDependencies > thresholds.maxDirectDependencies ? "directDependencies" : null,
    metrics.reachableDepth > thresholds.maxReachableDepth ? "reachableDepth" : null,
  ].filter((metric): metric is string => metric !== null);
}

function fingerprintFor(hook: HookNode, hookFingerprint: string, breachedMetricNames: string[]) {
  return {
    structural: sha([RULE_ID, hookFingerprint, ...breachedMetricNames].join("|")),
    nominal: sha(hook.name),
    positional: sha(hook.file),
  };
}

function fingerprintHook(hook: HookNode): string {
  return sha([hook.name, hook.file, ...hook.hookCalls].join("|"));
}

function severityFor(breachCount: number): Severity {
  return breachCount >= 3 ? "error" : breachCount >= 2 ? "warn" : "info";
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
