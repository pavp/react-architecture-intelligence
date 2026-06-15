import { createHash } from "node:crypto";
import {
	explainTerm,
	type AdapterMetricEvidence,
	type AnalysisContext,
	type Analyzer,
	type AnalyzerResult,
	type ComponentNode,
	type ExplanationEnvelope,
	type Finding,
	type PresentedFinding,
	type Severity,
} from "@rai/core";

export const PROP_DRILLING_RULE_ID = "react/prop-drilling";

export const COMMON_PROP_NAMES: ReadonlySet<string> = Object.freeze(
	new Set([
		"id",
		"key",
		"ref",
		"className",
		"class",
		"style",
		"children",
		"value",
		"name",
		"type",
		"disabled",
		"onChange",
		"onClick",
		"onSubmit",
	]),
);

export function createPropDrillingAnalyzer(): Analyzer {
	return {
		ruleId: PROP_DRILLING_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult => analyzePropDrilling(ctx),
		explain: explainPropDrilling,
	};
}

function explainPropDrilling(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== PROP_DRILLING_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence as AdapterMetricEvidence;
	const drilledProps = roleVariants(evidence, "drilled-prop");
	const upstreamSources = roleVariants(evidence, "upstream-source");
	const downstreamTargets = roleVariants(evidence, "downstream-target");
	const groundingFields = Object.keys(evidence).sort();

	return {
		summary:
			drilledProps.length === 1
				? `${evidence.subject.name} forwards prop "${drilledProps[0]}" through its interface without appearing to transform it.`
				: `${evidence.subject.name} forwards ${drilledProps.length} props (${drilledProps.join(", ")}) through its interface without appearing to transform them.`,
		whyItMatters:
			"Props forwarded through intermediate components increase coupling between distant layers. " +
			"If the upstream API changes shape, every intermediate component must be updated even if it does not use the value itself.",
		inspectFirst: [
			`${evidence.subject.name} in ${evidence.subject.file}`,
			`drilled props: ${drilledProps.join(", ")}`,
			`upstream sources: ${upstreamSources.join(", ")}`,
			`downstream targets: ${downstreamTargets.join(", ")}`,
			`metrics: ${evidence.metrics.drilledProps} drilled, ${evidence.metrics.upstreamSources} upstream, ${evidence.metrics.downstreamTargets} downstream, ${evidence.metrics.propCount} total props`,
		],
		limits: [
			"Name-level only: matches prop names, not values. Cannot confirm the same runtime value is passed from upstream to downstream through this component.",
			"Cannot determine whether this component uses the prop itself. Declaring a prop in propNames does not prove the component only forwards it.",
			"This is an opportunity signal, not a confirmed bug, wrong architecture, or required remediation.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function analyzePropDrilling(ctx: AnalysisContext): Finding[] {
	// Build component map for O(1) lookup
	const byId = new Map<string, ComponentNode>();
	for (const component of ctx.graph.components) {
		byId.set(component.id, component);
	}

	// Accumulate passes-edge data per component B
	const inboundProps = new Map<string, Set<string>>(); // B.id → props coming IN to B
	const outboundProps = new Map<string, Set<string>>(); // B.id → props going OUT from B
	const upstreamIds = new Map<string, Set<string>>(); // B.id → set of A ids
	const downstreamIds = new Map<string, Set<string>>(); // B.id → set of C ids

	for (const edge of ctx.graph.edges) {
		if (edge.kind !== "passes") continue;
		const propNames = edge.propNames ?? [];
		if (propNames.length === 0) continue;

		// edge: srcId → dstId, so dstId receives (inbound), srcId emits (outbound)
		const dst = edge.dstId;
		const src = edge.srcId;

		// Skip self-edges: a component passing props to itself cannot form a
		// real A→B→C drilling chain and would produce a degenerate finding.
		if (src === dst) continue;

		// dst is receiving: accumulate inbound for dst
		if (!inboundProps.has(dst)) inboundProps.set(dst, new Set());
		for (const p of propNames) inboundProps.get(dst)!.add(p);
		if (!upstreamIds.has(dst)) upstreamIds.set(dst, new Set());
		upstreamIds.get(dst)!.add(src);

		// src is emitting: accumulate outbound for src
		if (!outboundProps.has(src)) outboundProps.set(src, new Set());
		for (const p of propNames) outboundProps.get(src)!.add(p);
		if (!downstreamIds.has(src)) downstreamIds.set(src, new Set());
		downstreamIds.get(src)!.add(dst);
	}

	const findings: Finding[] = [];

	// Only consider components that are in BOTH maps (have inbound AND outbound passes edges)
	for (const bId of inboundProps.keys()) {
		if (!outboundProps.has(bId)) continue;
		const B = byId.get(bId);
		if (!B) continue;

		const declared = new Set(B.propNames);
		const inbound = inboundProps.get(bId)!;
		const outbound = outboundProps.get(bId)!;

		// drilled = inbound ∩ outbound ∩ B.propNames, minus COMMON_PROP_NAMES
		const drilled: string[] = [];
		for (const p of inbound) {
			if (outbound.has(p) && declared.has(p) && !COMMON_PROP_NAMES.has(p)) {
				drilled.push(p);
			}
		}
		if (drilled.length === 0) continue;
		drilled.sort();

		const upstreams = [...(upstreamIds.get(bId) ?? [])].sort();
		const downstreams = [...(downstreamIds.get(bId) ?? [])].sort();

		const subjectFingerprint = sha(
			JSON.stringify({ file: B.file, id: B.id, name: B.name, span: B.span }),
		);

		const structural = sha(
			[PROP_DRILLING_RULE_ID, B.file, B.name, ...drilled].join("|"),
		);
		const nominal = sha([B.name, ...drilled].join("|"));
		const positional = sha([B.file, B.span.start, B.span.end].join("|"));

		const exceeded = drilled.map((p) => `propDrilling:${p}`).sort();

		const roles = buildRoles(B, drilled, upstreams, downstreams, byId);

		findings.push({
			id: sha([ctx.runId, PROP_DRILLING_RULE_ID, B.id, subjectFingerprint].join("|")),
			ruleId: PROP_DRILLING_RULE_ID,
			type: "opportunity",
			fingerprint: { structural, nominal, positional },
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severityFor(drilled.length),
			evidence: {
				kind: "adapter-metric",
				adapterId: "react",
				ruleId: PROP_DRILLING_RULE_ID,
				subject: {
					id: `react:prop-drilling:${B.id}`,
					name: B.name,
					file: B.file,
					span: B.span,
					fingerprint: subjectFingerprint,
				},
				roles,
				metrics: {
					drilledProps: drilled.length,
					upstreamSources: upstreams.length,
					downstreamTargets: downstreams.length,
					propCount: B.propNames.length,
				},
				thresholds: { maxDrilledProps: 0 },
				topology: {
					directChildIds: [...downstreams],
					reachableNodeIds: [...upstreams],
					exceeded,
				},
			},
			createdAt: 0,
		});
	}

	return findings.sort(compareFindings);
}

function buildRoles(
	B: ComponentNode,
	drilled: readonly string[],
	upstreamIds: readonly string[],
	downstreamIds: readonly string[],
	byId: Map<string, ComponentNode>,
): AdapterMetricEvidence["roles"] {
	const rawRoles: { role: string; variant: string; file: string }[] = [];

	for (const p of drilled) {
		rawRoles.push({ role: "drilled-prop", variant: p, file: B.file });
	}

	for (const aId of upstreamIds) {
		const A = byId.get(aId);
		rawRoles.push({
			role: "upstream-source",
			variant: A ? A.name : aId,
			file: A ? A.file : B.file,
		});
	}

	for (const cId of downstreamIds) {
		const C = byId.get(cId);
		rawRoles.push({
			role: "downstream-target",
			variant: C ? C.name : cId,
			file: C ? C.file : B.file,
		});
	}

	const sorted = uniqueRoles(rawRoles).sort(compareRoles);
	Object.freeze(sorted);
	return sorted;
}

function uniqueRoles(
	roles: { role: string; variant: string; file: string }[],
): { role: string; variant: string; file: string }[] {
	const byKey = new Map<string, { role: string; variant: string; file: string }>();
	for (const r of roles) byKey.set(`${r.role}:${r.variant}:${r.file}`, r);
	return [...byKey.values()];
}

function severityFor(drilledCount: number): Severity {
	return drilledCount > 1 ? "warn" : "info";
}

function compareFindings(a: Finding, b: Finding): number {
	return (
		a.fingerprint.structural.localeCompare(b.fingerprint.structural) ||
		a.fingerprint.nominal.localeCompare(b.fingerprint.nominal) ||
		a.fingerprint.positional.localeCompare(b.fingerprint.positional)
	);
}

function compareRoles(
	a: { role: string; variant: string; file: string },
	b: { role: string; variant: string; file: string },
): number {
	return (
		a.role.localeCompare(b.role) ||
		a.variant.localeCompare(b.variant) ||
		a.file.localeCompare(b.file)
	);
}

function roleVariants(evidence: AdapterMetricEvidence, roleName: string): string[] {
	return [...new Set(
		evidence.roles
			.filter((r) => r.role === roleName)
			.map((r) => r.variant),
	)].sort();
}

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
