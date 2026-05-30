import { createHash } from "node:crypto";
import type { AnalysisDiagnostic, AdapterMetricEvidence, ComponentNode, Finding, GraphEdge, Severity } from "@rai/core";
import type { NextDetection } from "./detect.js";
import type { NextGraphEnrichment, NextGraphInput, NextTag } from "./enrich.js";
import { guardNextVariant } from "./variant-guard.js";

export const CLIENT_BOUNDARY_BLOAT_RULE_ID = "next/client-boundary-bloat";

export interface ClientBoundaryBloatThresholds {
  maxFanOut: number;
  maxDirectChildren: number;
  maxReachableNodes: number;
  maxReachableDepth: number;
}

export interface ClientBoundaryBloatInput {
  graph: NextGraphInput;
  detection: NextDetection;
  enrichment: NextGraphEnrichment;
  thresholds?: Partial<ClientBoundaryBloatThresholds> | undefined;
  runId: string;
  commitSha: string;
  analysisVersion: number;
}

export interface NextAdapterAnalyzerResult {
  findings: Finding[];
  diagnostics: AnalysisDiagnostic[];
}

export interface ClientBoundaryBloatAnalyzer {
  ruleId: typeof CLIENT_BOUNDARY_BLOAT_RULE_ID;
  analyze(input: ClientBoundaryBloatInput): NextAdapterAnalyzerResult;
}

interface ClientBoundaryBloatAnalyzerOptions {
  thresholds?: Partial<ClientBoundaryBloatThresholds> | undefined;
}

interface BoundaryMetrics {
  fanOut: number;
  directChildren: number;
  reachableNodes: number;
  reachableDepth: number;
}

const DEFAULT_THRESHOLDS: ClientBoundaryBloatThresholds = {
  maxFanOut: 10,
  maxDirectChildren: 8,
  maxReachableNodes: 20,
  maxReachableDepth: 4,
};

export function createClientBoundaryBloatAnalyzer(options: ClientBoundaryBloatAnalyzerOptions = {}): ClientBoundaryBloatAnalyzer {
  return {
    ruleId: CLIENT_BOUNDARY_BLOAT_RULE_ID,
    analyze(input: ClientBoundaryBloatInput): NextAdapterAnalyzerResult {
      const guard = guardNextVariant({ detection: input.detection, analyzerId: CLIENT_BOUNDARY_BLOAT_RULE_ID, supportedVariants: ["app-router"] });
      if (guard.status === "skipped") return { findings: [], diagnostics: [guard.diagnostic] };

      const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds, ...input.thresholds };
      const components = [...input.graph.components].sort(compareComponents);
      const componentById = new Map(components.map((component) => [component.id, component]));
      const outgoing = renderOutgoing(input.graph.edges, new Set(componentById.keys()));
      const clientIds = new Set(input.enrichment.roleIndex.get("ClientComponent") ?? []);
      const findings: Finding[] = [];

      for (const component of components) {
        if (!clientIds.has(component.id)) continue;
        const metrics = boundaryMetrics(component.id, outgoing);
        const exceeded = exceededMetrics(metrics, thresholds);
        if (exceeded.length === 0) continue;
        const directChildIds = uniqueSorted(outgoing.get(component.id) ?? []);
        const reachableNodeIds = reachableIds(component.id, outgoing);
        const componentFingerprint = componentFingerprintFor(component);
        findings.push({
          id: sha([input.runId, CLIENT_BOUNDARY_BLOAT_RULE_ID, component.id, componentFingerprint].join("|")),
          ruleId: CLIENT_BOUNDARY_BLOAT_RULE_ID,
          type: "opportunity",
          fingerprint: fingerprintFor(component, componentFingerprint, exceeded),
          analysisVersion: input.analysisVersion,
          fpAlgoVersion: 1,
          producingRunId: input.runId,
          commitSha: input.commitSha,
          severityRaw: severityFor(exceeded.length),
          evidence: evidenceFor(component, componentFingerprint, rolesFor(input.enrichment, component.id), metrics, thresholds, directChildIds, reachableNodeIds, exceeded),
          createdAt: 0,
        });
      }

      findings.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
      return { findings, diagnostics: [] };
    },
  };
}

function renderOutgoing(edges: readonly GraphEdge[], componentIds: ReadonlySet<string>): Map<string, string[]> {
  const outgoing = new Map<string, string[]>();
  for (const edge of [...edges].sort(compareEdges)) {
    if (edge.kind !== "renders" || !componentIds.has(edge.srcId) || !componentIds.has(edge.dstId)) continue;
    outgoing.set(edge.srcId, [...(outgoing.get(edge.srcId) ?? []), edge.dstId].sort());
  }
  return outgoing;
}

function boundaryMetrics(rootId: string, outgoing: ReadonlyMap<string, readonly string[]>): BoundaryMetrics {
  const directChildIds = outgoing.get(rootId) ?? [];
  const reachableNodeIds = reachableIds(rootId, outgoing);
  return {
    fanOut: directChildIds.length,
    directChildren: new Set(directChildIds).size,
    reachableNodes: reachableNodeIds.length,
    reachableDepth: reachableDepth(rootId, outgoing),
  };
}

function reachableIds(rootId: string, outgoing: ReadonlyMap<string, readonly string[]>): string[] {
  const visited = new Set<string>();
  const walk = (id: string, path: ReadonlySet<string>) => {
    for (const childId of outgoing.get(id) ?? []) {
      if (path.has(childId)) continue;
      visited.add(childId);
      walk(childId, new Set([...path, childId]));
    }
  };
  walk(rootId, new Set([rootId]));
  return [...visited].sort();
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

function exceededMetrics(metrics: BoundaryMetrics, thresholds: ClientBoundaryBloatThresholds): string[] {
  return [
    metrics.fanOut > thresholds.maxFanOut ? "fanOut" : null,
    metrics.directChildren > thresholds.maxDirectChildren ? "directChildren" : null,
    metrics.reachableNodes > thresholds.maxReachableNodes ? "reachableNodes" : null,
    metrics.reachableDepth > thresholds.maxReachableDepth ? "reachableDepth" : null,
  ].filter((metric): metric is string => metric !== null);
}

function evidenceFor(
  component: ComponentNode,
  componentFingerprint: string,
  roles: NextTag[],
  metrics: BoundaryMetrics,
  thresholds: ClientBoundaryBloatThresholds,
  directChildIds: string[],
  reachableNodeIds: string[],
  exceeded: string[],
): AdapterMetricEvidence {
  return {
    kind: "adapter-metric",
    adapterId: "next",
    ruleId: CLIENT_BOUNDARY_BLOAT_RULE_ID,
    subject: { id: component.id, name: component.name, file: component.file, span: component.span, fingerprint: componentFingerprint },
    roles: roles.map((tag) => ({ role: tag.role, variant: tag.variant, file: tag.file })).sort(compareRoles),
    metrics: { fanOut: metrics.fanOut, directChildren: metrics.directChildren, reachableNodes: metrics.reachableNodes, reachableDepth: metrics.reachableDepth },
    thresholds: { maxFanOut: thresholds.maxFanOut, maxDirectChildren: thresholds.maxDirectChildren, maxReachableNodes: thresholds.maxReachableNodes, maxReachableDepth: thresholds.maxReachableDepth },
    topology: { directChildIds, reachableNodeIds, exceeded },
  };
}

function rolesFor(enrichment: NextGraphEnrichment, nodeId: string): NextTag[] {
  return [...(enrichment.nodeTags.get(nodeId) ?? [])].sort((a, b) => a.role.localeCompare(b.role) || a.file.localeCompare(b.file));
}

function fingerprintFor(component: ComponentNode, componentFingerprint: string, exceeded: string[]) {
  return {
    structural: sha([CLIENT_BOUNDARY_BLOAT_RULE_ID, componentFingerprint, ...exceeded].join("|")),
    nominal: sha(component.name),
    positional: sha(component.file),
  };
}

function componentFingerprintFor(component: ComponentNode): string {
  return sha(JSON.stringify({
    id: component.id,
    name: component.name,
    file: component.file,
    kind: component.kind,
    exportKind: component.exportKind,
    span: component.span,
  }));
}

function severityFor(breachCount: number): Severity {
  return breachCount >= 3 ? "error" : breachCount >= 2 ? "warn" : "info";
}

function compareComponents(a: ComponentNode, b: ComponentNode): number {
  return `${a.id}:${a.name}:${a.file}`.localeCompare(`${b.id}:${b.name}:${b.file}`);
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return `${a.srcId}:${a.dstId}:${a.kind}`.localeCompare(`${b.srcId}:${b.dstId}:${b.kind}`);
}

function compareRoles(a: { role: string; variant: string; file: string }, b: { role: string; variant: string; file: string }): number {
  return a.role.localeCompare(b.role) || a.variant.localeCompare(b.variant) || a.file.localeCompare(b.file);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
