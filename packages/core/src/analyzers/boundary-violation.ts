import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { Analyzer, AnalysisContext } from "./analyzer.js";
import { FP_ALGO_VERSION } from "../fingerprint/structural.js";
import type { ComponentNode, Finding, GraphEdge, HookNode, Severity, Span } from "../types.js";
import type { RaiConfig } from "../config/schema.js";
import { globMatch } from "./matching.js";

export const RULE_ID = "react/boundary-violation";

type Convention = RaiConfig["conventions"][number];
type Selector = Convention["from"];

interface NodeRef {
  id: string;
  kind: "component" | "hook";
  name: string;
  file: string;
  span: Span;
  exportKind: "default" | "named" | "none";
}

export const boundaryViolation: Analyzer = {
  ruleId: RULE_ID,
  framework: "react",
  analyze(ctx: AnalysisContext): Finding[] {
    if (ctx.config.conventions.length === 0) return [];

    const nodes = buildNodeIndex(ctx.graph.components, ctx.graph.hooks);
    const findings: Finding[] = [];
    const conventions = [...ctx.config.conventions].sort((a, b) => a.id.localeCompare(b.id));
    const edges = [...ctx.graph.edges].sort(compareEdges);

    for (const convention of conventions) {
      for (const edge of edges) {
        if (edge.kind !== convention.edgeKind) continue;
        const from = nodes.get(edge.srcId);
        const to = nodes.get(edge.dstId);
        if (!from || !to) continue;
        if (!nodeMatches(convention.from, from) || !nodeMatches(convention.to, to)) continue;
        findings.push(findingFor(convention, edge, from, to, ctx));
      }
    }

    findings.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
    return findings;
  },
};

function buildNodeIndex(components: readonly ComponentNode[], hooks: readonly HookNode[]): Map<string, NodeRef> {
  const out = new Map<string, NodeRef>();
  for (const component of components) {
    out.set(component.id, {
      id: component.id,
      kind: "component",
      name: component.name,
      file: component.file,
      span: component.span,
      exportKind: component.exportKind,
    });
  }
  for (const hook of hooks) {
    out.set(hook.id, {
      id: hook.id,
      kind: "hook",
      name: hook.name,
      file: hook.file,
      span: hook.span,
      exportKind: hook.exportKind,
    });
  }
  return out;
}

function nodeMatches(selector: Selector, node: NodeRef): boolean {
  if (selector.kind !== undefined && selector.kind !== node.kind) return false;
  if (selector.exportKind !== undefined && selector.exportKind !== node.exportKind) return false;
  if (selector.name !== undefined && !globMatch(selector.name, node.name)) return false;
  if (selector.file !== undefined && !globMatch(selector.file, node.file)) return false;
  return true;
}

function findingFor(convention: Convention, edge: GraphEdge, from: NodeRef, to: NodeRef, ctx: AnalysisContext): Finding {
  return {
    id: ulid(),
    ruleId: RULE_ID,
    type: "architectural-conflict",
    fingerprint: fingerprintFor(convention, edge, from, to),
    analysisVersion: ctx.analysisVersion,
    fpAlgoVersion: FP_ALGO_VERSION,
    producingRunId: ctx.runId,
    commitSha: ctx.commitSha,
    severityRaw: convention.severity as Severity,
    evidence: {
      kind: "boundary-violation",
      convention: { id: convention.id, edgeKind: convention.edgeKind, policy: convention.policy, reason: convention.reason },
      edge: { kind: convention.edgeKind, from: publicNode(from), to: publicNode(to) },
    },
    createdAt: 0,
  };
}

function publicNode(node: NodeRef) {
  return { id: node.id, kind: node.kind, name: node.name, file: node.file, span: node.span };
}

function fingerprintFor(convention: Convention, edge: GraphEdge, from: NodeRef, to: NodeRef) {
  return {
    structural: sha([RULE_ID, convention.id, edge.kind, from.kind, from.file, from.name, to.kind, to.file, to.name].join("|")),
    nominal: sha(convention.id),
    positional: sha([from.file, to.file].join("|")),
  };
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return a.kind.localeCompare(b.kind) || a.srcId.localeCompare(b.srcId) || a.dstId.localeCompare(b.dstId);
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
