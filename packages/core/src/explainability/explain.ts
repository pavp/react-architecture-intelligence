import type { ExplanationEnvelope, PresentedFinding } from "../types.js";
import { explainTerm } from "./glossary.js";

export function explainFinding(finding: PresentedFinding): ExplanationEnvelope {
	const groundingFields = Object.keys(finding.evidence).sort();
	const glossary = groundingFields.map(explainTerm);
	const evidence = finding.evidence;

	if (evidence.kind === "shared-extraction") {
		const instanceNames = evidence.instances.map((instance) => instance.name);
		const inspectFirst = [
			...evidence.instances.map(
				(instance) => `${instance.name} in ${instance.span.file}`,
			),
			`similarity score: ${formatRatio(evidence.cosine)}`,
			`prop overlap: ${formatRatio(evidence.propOverlap)}`,
			`hook overlap: ${formatRatio(evidence.hookOverlap)}`,
			`shared props observed: ${formatList(evidence.sharedSurface) || "none recorded"}`,
			`varying props observed: ${formatList(evidence.variancePoints) || "none recorded"}`,
			...(evidence.conflict
				? [`configured boundary conflict: ${evidence.conflict.why}`]
				: []),
		];
		return {
			summary:
				evidence.instances.length > 0
					? `${evidence.instances.length} components share similar source shape: ${formatList(instanceNames)}.`
					: "Shared-extraction evidence has no component instances to list.",
			whyItMatters:
				"This is worth checking because the listed components already share measured structure, props, or hook usage in source.",
			inspectFirst,
			limits: [
				"Do not assume shared ownership, intent, root cause, user impact, or safe remediation from this finding alone.",
				...(evidence.conflict
					? [
							"The boundary conflict comes from repo config; inspect the configured convention before acting.",
						]
					: []),
			],
			groundingFields,
			glossary,
		};
	}

	if (evidence.kind === "render-coupling") {
		return {
			summary: `${evidence.component.name} sits at a busy render point: ${evidence.fanIn} inbound, ${evidence.fanOut} downstream, ${evidence.directChildren} direct ${plural(evidence.directChildren, "child", "children")}, depth ${evidence.reachableDepth}.`,
			whyItMatters:
				"This is worth checking because the render graph shows many relationships around one component.",
			inspectFirst: inspectFirstForEvidence(evidence, groundingFields),
			limits: [knownEvidenceLimit()],
			groundingFields,
			glossary,
		};
	}

	if (evidence.kind === "over-abstraction") {
		return {
			summary: `${evidence.component.name} has a large measured component surface: ${evidence.propCount} ${plural(evidence.propCount, "prop")}, ${evidence.hookCount} ${plural(evidence.hookCount, "hook")}, ${evidence.childCount} rendered ${plural(evidence.childCount, "child", "children")}, ${evidence.compositionMarkerCount} composition ${plural(evidence.compositionMarkerCount, "marker")}, and ${evidence.conditionalBranchCount} conditional ${plural(evidence.conditionalBranchCount, "branch", "branches")}.`,
			whyItMatters:
				"This is worth checking because many props, hooks, children, composition markers, or branches meet in one source component.",
			inspectFirst: inspectFirstForEvidence(evidence, groundingFields),
			limits: [knownEvidenceLimit()],
			groundingFields,
			glossary,
		};
	}

	if (evidence.kind === "hook-topology") {
		return {
			summary: `${evidence.hook.name} sits at a busy hook dependency point: ${evidence.fanIn} inbound, ${evidence.fanOut} downstream, ${evidence.directDependencies} direct ${plural(evidence.directDependencies, "dependency", "dependencies")}, depth ${evidence.reachableDepth}.`,
			whyItMatters:
				"This is worth checking because the dependency graph shows many relationships around one hook.",
			inspectFirst: inspectFirstForEvidence(evidence, groundingFields),
			limits: [knownEvidenceLimit()],
			groundingFields,
			glossary,
		};
	}

	if (evidence.kind === "boundary-violation") {
		const label = edgeLabel(evidence.edge.kind);
		return {
			summary: `Configured convention ${evidence.convention.id} forbids this ${label}: ${evidence.edge.from.name} -> ${evidence.edge.to.name}.`,
			whyItMatters: `This is worth checking because the repo config says this relationship should not appear: ${evidence.convention.reason}.`,
			inspectFirst: inspectFirstForEvidence(evidence, groundingFields),
			limits: [
				"This reflects configured convention evidence only; RAI does not infer ownership, intent, root cause, user impact, or safe remediation.",
			],
			groundingFields,
			glossary,
		};
	}

	if (evidence.kind === "adapter-metric") {
		return {
			summary: `Unrecognized adapter metric for ${evidence.ruleId}; showing raw adapter facts only.`,
			whyItMatters:
				"RAI can show the source-measured keys, but no semantic explanation is registered for this adapter metric.",
			inspectFirst: inspectFirstForEvidence(evidence, groundingFields),
			limits: fallbackLimits(),
			groundingFields,
			glossary,
		};
	}

	const kind = (evidence as { kind?: unknown }).kind;
	return {
		summary: `Unrecognized evidence kind "${String(kind)}" for ${finding.ruleId}; showing raw evidence keys only.`,
		whyItMatters:
			"RAI can show the source-measured keys, but no semantic explanation is registered for this evidence shape.",
		inspectFirst: inspectFirstForEvidence(evidence, groundingFields),
		limits: fallbackLimits(),
		groundingFields,
		glossary,
	};
}

function inspectFirstForEvidence(
	evidence: PresentedFinding["evidence"],
	groundingFields: string[],
): string[] {
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
			`forbidden ${edgeLabel(evidence.edge.kind)} under convention ${evidence.convention.id}`,
			`config reason: ${evidence.convention.reason}`,
		];
	}
	if (evidence.kind === "adapter-metric") {
		return [
			`${evidence.subject.name} in ${evidence.subject.file}`,
			`raw adapter id: ${evidence.adapterId}`,
			`raw rule id: ${evidence.ruleId}`,
			`raw roles: ${formatList(evidence.roles.map((role) => `${role.variant} (${role.role}) in ${role.file}`)) || "none"}`,
			`raw metric keys: ${Object.keys(evidence.metrics).sort().join(", ")}`,
			`raw threshold keys: ${Object.keys(evidence.thresholds).sort().join(", ")}`,
			`raw topology exceeded keys: ${evidence.topology.exceeded.join(", ") || "none"}`,
		];
	}
	return groundingFields.length > 0
		? [`raw evidence keys: ${groundingFields.join(", ")}`]
		: [];
}

function knownEvidenceLimit(): string {
	return "Do not assume shared ownership, intent, root cause, user impact, architectural correctness, or safe remediation from this finding alone.";
}

function fallbackLimits(): string[] {
	return [
		"Unknown evidence keys are raw facts, not inferred meaning.",
		"RAI does not infer team intent, ownership, root cause, user impact, architectural correctness, historical change, or required remediation from unrecognized evidence.",
	];
}

function formatList(values: readonly string[], limit = 4): string {
	const visible = values.filter(Boolean).slice(0, limit);
	const remaining = values.filter(Boolean).length - visible.length;
	const suffix = remaining > 0 ? `, and ${remaining} more` : "";
	if (visible.length === 0) return "";
	if (visible.length === 1) return `${visible[0]}${suffix}`;
	if (visible.length === 2) return `${visible[0]} and ${visible[1]}${suffix}`;
	return `${visible.slice(0, -1).join(", ")} and ${visible[visible.length - 1]}${suffix}`;
}

function formatRatio(value: number): string {
	return Number.isFinite(value) ? value.toFixed(2) : "unknown";
}

function plural(
	count: number,
	singular: string,
	pluralForm = `${singular}s`,
): string {
	return count === 1 ? singular : pluralForm;
}

function edgeLabel(kind: "renders" | "uses-hook"): string {
	return kind === "renders" ? "render link" : "hook-use link";
}
