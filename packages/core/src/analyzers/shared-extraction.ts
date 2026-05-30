import { ulid } from "ulid";
import type { Analyzer, AnalysisContext } from "./analyzer.js";
import type { ComponentNode, Finding, FindingType, Severity } from "../types.js";
import { embedComponent } from "../similarity/embed.js";
import { clusterByCosine, minClusterCosine } from "../similarity/similarity-index.js";
import { structuralFingerprint, FP_ALGO_VERSION } from "../fingerprint/structural.js";
import { createHash } from "node:crypto";

export const RULE_ID = "react/shared-extraction";

/** The killer analyzer (§4). Decision = pure unordered boolean AND. PURE. */
export const sharedExtraction: Analyzer = {
  ruleId: RULE_ID,
  framework: "react",
  analyze(ctx: AnalysisContext): Finding[] {
    const c = ctx.config;
    const candidates = ctx.graph.components.filter((comp) => isCandidate(comp, c.excludeGlobs));
    const items = candidates.map((comp) => ({ id: comp.id, vec: embedComponent(comp), comp }));
    const clusters = clusterByCosine(items, c.shared.minCosine);

    const out: Finding[] = [];
    for (const cluster of clusters) {
      if (cluster.length < c.shared.minInstances) continue;
      const comps = cluster.map((x) => x.comp);

      const propOverlap = jaccardSets(comps.map((x) => new Set(x.propNames)));
      const hookOverlap = jaccardSets(comps.map((x) => new Set(x.hookCalls)));
      const minCosine = minClusterCosine(cluster);

      // THE PREDICATE — unordered boolean AND, knobs from config (§4.2, §4-Fix-0)
      const isOpportunity =
        minCosine >= c.shared.minCosine &&
        propOverlap >= c.shared.minPropOverlap &&
        hookOverlap >= c.shared.minHookOverlap &&
        cluster.length >= c.shared.minInstances;
      if (!isOpportunity) continue;

      const sharedSurface = intersectAll(comps.map((x) => x.propNames));
      const variancePoints = symmetricDiff(comps.map((x) => x.propNames));

      // divergence guard (§4.4): too many variance points => god-component, reject
      if (variancePoints.length > c.shared.maxVariance) continue;

      // boundary check (§1.1): a cluster crossing a configured boundary is a conflict, not an opportunity
      const files = comps.map((x) => x.file);
      let conflict: { rule: string; why: string } | undefined;
      outer: for (let i = 0; i < files.length; i++) {
        for (let j = 0; j < files.length; j++) {
          if (i === j) continue;
          for (const rule of ctx.boundaryRules) {
            if (globMatch(rule.from, files[i]!) && globMatch(rule.to, files[j]!)) {
              conflict = {
                rule: rule.reason || `${rule.from} → ${rule.to}`,
                why: `boundary ${rule.from} → ${rule.to} crossed by ${files[i]}, ${files[j]}`,
              };
              break outer;
            }
          }
        }
      }
      const type: FindingType = conflict ? "architectural-conflict" : "opportunity";

      out.push({
        id: ulid(),
        ruleId: RULE_ID,
        type,
        fingerprint: opportunityFingerprint(comps, c.shared.minFpCardinality, c.shared.outlierFreq),
        analysisVersion: ctx.analysisVersion,
        fpAlgoVersion: FP_ALGO_VERSION,
        producingRunId: ctx.runId,
        commitSha: ctx.commitSha,
        severityRaw: severityFor(cluster.length, c.shared),
        evidence: {
          kind: "shared-extraction",
          instances: comps.map((x) => ({ name: x.name, span: x.span, fingerprint: structuralFingerprint(x) })),
          cosine: minCosine,
          propOverlap,
          hookOverlap,
          variancePoints,
          sharedSurface,
          ...(conflict ? { conflict } : {}),
        },
        createdAt: 0, // set by the engine runner at persist time (kept 0 for purity)
      });
    }
    // stable order for determinism
    out.sort((a, b) => a.fingerprint.structural.localeCompare(b.fingerprint.structural));
    return out;
  },
};

function isCandidate(comp: ComponentNode, excludeGlobs: string[]): boolean {
  return !excludeGlobs.some((g) => globMatch(g, comp.file));
}

/** Minimal glob: supports **, *, and literal segments. Enough for the MVP exclude list. */
function globMatch(glob: string, path: string): boolean {
  // Split on ** then escape literal parts and replace single * with [^/]*
  const escSeg = (s: string) =>
    s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");

  // Normalize: treat leading **/ as optional dir prefix, trailing /** as optional trailing
  const norm = glob
    .replace(/^\*\*\//, "__LEAD__")
    .replace(/\/\*\*$/, "__TRAIL__")
    .replace(/\*\*/g, "__STAR2__");

  let pattern = norm
    .split("__STAR2__").map(escSeg).join(".*")
    .replace("__LEAD__", "(?:.*\\/)?")
    .replace("__TRAIL__", "(?:\\/.*)?");

  const re = new RegExp("^" + pattern + "$");
  return re.test(path);
}

function jaccardSets(sets: Set<string>[]): number {
  if (sets.length === 0) return 0;
  let inter = new Set(sets[0] ?? []);
  const uni = new Set<string>();
  for (const s of sets) {
    inter = new Set([...inter].filter((x) => s.has(x)));
    for (const x of s) uni.add(x);
  }
  return uni.size === 0 ? 1 : inter.size / uni.size;
}

function intersectAll(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  let inter = new Set(lists[0] ?? []);
  for (const l of lists) inter = new Set([...inter].filter((x) => l.includes(x)));
  return [...inter].sort();
}

function symmetricDiff(lists: string[][]): string[] {
  const shared = new Set(intersectAll(lists));
  const all = new Set<string>();
  for (const l of lists) for (const x of l) all.add(x);
  return [...all].filter((x) => !shared.has(x)).sort();
}

/** Opportunity fingerprint (§4.5): keyed on the SHARED SHAPE, with union-fallback for thin sets. */
function opportunityFingerprint(comps: ComponentNode[], minCardinality: number, outlierFreq: number) {
  const inter = [
    ...intersectAll(comps.map((c) => c.propNames)).map((p) => "prop:" + p),
    ...intersectAll(comps.map((c) => c.hookCalls)).map((h) => "hook:" + h),
    ...intersectAll(comps.map((c) => c.childComponents)).map((c) => "child:" + c),
  ].sort();

  let structural: string;
  if (inter.length >= minCardinality) {
    structural = sha(inter.join("|"));
  } else {
    // union-minus-outliers fallback, tagged so regimes never collide (§4.5, §4-Fix-2)
    const union = unionMinusOutliers(comps, outlierFreq);
    structural = sha(union.join("|") + ":union-fallback");
  }
  const nominal = sha(dominantNamePattern(comps));
  const positional = sha(comps.map((c) => c.file).sort().join("|"));
  return { structural, nominal, positional };
}

/** Keep tokens present in at least `outlierFreq` fraction of the cluster (drops one-off props). */
function unionMinusOutliers(comps: ComponentNode[], outlierFreq: number): string[] {
  const freq = new Map<string, number>();
  const bump = (t: string) => freq.set(t, (freq.get(t) ?? 0) + 1);
  for (const c of comps) {
    for (const p of c.propNames) bump("prop:" + p);
    for (const h of c.hookCalls) bump("hook:" + h);
  }
  const cutoff = comps.length * outlierFreq;
  return [...freq.entries()].filter(([, n]) => n >= cutoff).map(([t]) => t).sort();
}

function dominantNamePattern(comps: ComponentNode[]): string {
  // crude: longest common suffix of names (e.g. "*Button")
  const names = comps.map((c) => c.name);
  let suffix = names[0] ?? "";
  for (const n of names) {
    while (suffix && !n.endsWith(suffix)) suffix = suffix.slice(1);
  }
  return suffix || names.sort().join(",");
}

function severityFor(instances: number, s: { warnAtInstances: number; errorAtInstances: number }): Severity {
  if (instances >= s.errorAtInstances) return "error";
  if (instances >= s.warnAtInstances) return "warn";
  return "info";
}

function sha(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
