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

export const CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID =
	"react/controlled-uncontrolled-prop-surface-drift";

interface ControlledDefaultPair {
	slot: string;
	controlled: string;
	uncontrolled: string;
}

const CONTROLLED_DEFAULT_PAIRS: readonly ControlledDefaultPair[] = [
	{ slot: "value", controlled: "value", uncontrolled: "defaultValue" },
	{ slot: "checked", controlled: "checked", uncontrolled: "defaultChecked" },
	{ slot: "open", controlled: "open", uncontrolled: "defaultOpen" },
];

const HANDLER_PROPS = new Set([
	"onChange",
	"onValueChange",
	"onCheckedChange",
	"onOpenChange",
]);

const STATE_HOOKS = new Set(["useState", "useReducer"]);

export function createControlledUncontrolledPropSurfaceDriftAnalyzer(): Analyzer {
	return {
		ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeControlledUncontrolledPropSurfaceDrift(ctx),
		explain: explainControlledUncontrolledPropSurfaceDrift,
	};
}

function explainControlledUncontrolledPropSurfaceDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence;
	const pairLabels = roleVariants(evidence, "controlled-uncontrolled-pair");
	const handlerProps = roleVariants(evidence, "change-handler-prop");
	const stateHooks = roleVariants(evidence, "state-hook");
	const groundingFields = Object.keys(evidence).sort();
	const mixedPropPairs = evidence.metrics.mixedPropPairs ?? pairLabels.length;
	const maxMixedPropPairs = evidence.thresholds.maxMixedPropPairs ?? 0;

	return {
		summary: summaryFor(evidence.subject.name, pairLabels),
		whyItMatters:
			"This is worth checking because controlled and default prop names describe different observed state-ownership surfaces for the same component API slot.",
		inspectFirst: [
			`${evidence.subject.name} in ${evidence.subject.file}`,
			...pairLabels.map((pair) => `mixed prop pair observed: ${pair}`),
			`handler props observed: ${formatListOrNone(handlerProps)}`,
			`state hooks observed: ${formatListOrNone(stateHooks)}`,
			`observed counts: ${mixedPropPairs} mixed ${plural(mixedPropPairs, "pair")}, ${(evidence.metrics.controlledProps ?? 0) + (evidence.metrics.uncontrolledProps ?? 0)} controlled/default ${plural((evidence.metrics.controlledProps ?? 0) + (evidence.metrics.uncontrolledProps ?? 0), "prop")}, ${evidence.metrics.handlerProps ?? handlerProps.length} handler ${plural(evidence.metrics.handlerProps ?? handlerProps.length, "prop")}, ${evidence.metrics.stateHookCalls ?? stateHooks.length} state ${plural(evidence.metrics.stateHookCalls ?? stateHooks.length, "hook")}, ${evidence.metrics.propCount ?? 0} total ${plural(evidence.metrics.propCount ?? 0, "prop")}`,
			`threshold crossed: mixed prop pairs ${mixedPropPairs} (limit: ${maxMixedPropPairs})`,
		],
		limits: [
			"This does not prove runtime controlled behavior, runtime React warnings, a bug, wrong architecture, or required remediation.",
			"RAI only compares observed component prop names in current source.",
			"RAI does not infer team intent, root cause, user impact, historical change, or semantic type information from this finding alone.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function analyzeControlledUncontrolledPropSurfaceDrift(
	ctx: AnalysisContext,
): Finding[] {
	const components = [...ctx.graph.components].sort(compareComponents);
	const findings: Finding[] = [];

	for (const component of components) {
		const propNames = uniqueSorted(component.propNames);
		const propSet = new Set(propNames);
		const pairs = CONTROLLED_DEFAULT_PAIRS.filter(
			(pair) => propSet.has(pair.controlled) && propSet.has(pair.uncontrolled),
		).sort(comparePairs);
		if (pairs.length === 0) continue;

		const handlerProps = propNames.filter((prop) => HANDLER_PROPS.has(prop));
		const stateHooks = uniqueSorted(
			component.hookCalls.filter((hook) => STATE_HOOKS.has(hook)),
		);
		const pairLabels = pairs.map(pairLabel);
		const exceeded = pairLabels
			.map((pair) => `controlledUncontrolledPair:${pair}`)
			.sort();
		const subjectFingerprint = subjectFingerprintFor(
			component,
			pairLabels,
			handlerProps,
			stateHooks,
		);

		findings.push({
			id: sha(
				[
					ctx.runId,
					CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
					component.id,
					subjectFingerprint,
				].join("|"),
			),
			ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			fingerprint: {
				structural: sha(
					[
						CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
						component.file,
						component.name,
						...pairLabels,
					].join("|"),
				),
				nominal: sha([component.name, ...pairLabels].join("|")),
				positional: sha(
					[component.file, component.span.start, component.span.end].join("|"),
				),
			},
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severityFor(pairs.length),
			evidence: evidenceFor(
				component,
				pairs,
				handlerProps,
				stateHooks,
				propNames,
				subjectFingerprint,
				exceeded,
			),
			createdAt: 0,
		});
	}

	return findings.sort(compareFindings);
}

function evidenceFor(
	component: ComponentNode,
	pairs: readonly ControlledDefaultPair[],
	handlerProps: readonly string[],
	stateHooks: readonly string[],
	propNames: readonly string[],
	subjectFingerprint: string,
	exceeded: readonly string[],
): AdapterMetricEvidence {
	return {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
		subject: {
			id: `react:controlled-uncontrolled:${component.id}`,
			name: component.name,
			file: component.file,
			span: component.span,
			fingerprint: subjectFingerprint,
		},
		roles: rolesFor(component, pairs, handlerProps, stateHooks),
		metrics: {
			mixedPropPairs: pairs.length,
			controlledProps: uniqueSorted(pairs.map((pair) => pair.controlled))
				.length,
			uncontrolledProps: uniqueSorted(pairs.map((pair) => pair.uncontrolled))
				.length,
			handlerProps: handlerProps.length,
			stateHookCalls: stateHooks.length,
			propCount: propNames.length,
		},
		thresholds: {
			maxMixedPropPairs: 0,
		},
		topology: {
			directChildIds: [],
			reachableNodeIds: [],
			exceeded: [...exceeded].sort(),
		},
	};
}

function rolesFor(
	component: ComponentNode,
	pairs: readonly ControlledDefaultPair[],
	handlerProps: readonly string[],
	stateHooks: readonly string[],
): AdapterMetricEvidence["roles"] {
	return uniqueRoles([
		...pairs.flatMap((pair) => [
			{
				role: "controlled-prop",
				variant: pair.controlled,
				file: component.file,
			},
			{
				role: "uncontrolled-prop",
				variant: pair.uncontrolled,
				file: component.file,
			},
			{
				role: "controlled-uncontrolled-pair",
				variant: pairLabel(pair),
				file: component.file,
			},
		]),
		...handlerProps.map((prop) => ({
			role: "change-handler-prop",
			variant: prop,
			file: component.file,
		})),
		...stateHooks.map((hook) => ({
			role: "state-hook",
			variant: hook,
			file: component.file,
		})),
	]).sort(compareRoles);
}

function subjectFingerprintFor(
	component: ComponentNode,
	pairLabels: readonly string[],
	handlerProps: readonly string[],
	stateHooks: readonly string[],
): string {
	return sha(
		JSON.stringify({
			component: componentFingerprint(component),
			handlerProps,
			pairLabels,
			stateHooks,
		}),
	);
}

function componentFingerprint(component: ComponentNode): string {
	return sha(
		JSON.stringify({
			exportKind: component.exportKind,
			file: component.file,
			id: component.id,
			kind: component.kind,
			name: component.name,
			span: component.span,
		}),
	);
}

function severityFor(pairCount: number): Severity {
	return pairCount > 1 ? "warn" : "info";
}

function summaryFor(
	componentName: string,
	pairLabels: readonly string[],
): string {
	if (pairLabels.length === 1) {
		const [controlled, uncontrolled] = splitPair(pairLabels[0]!);
		return `${componentName} exposes both ${controlled} and ${uncontrolled} prop names in the same component prop surface.`;
	}
	return `${componentName} exposes multiple controlled/default prop-name pairs in the same component prop surface: ${formatList(pairLabels)}.`;
}

function splitPair(pairLabelValue: string): [string, string] {
	const [controlled, uncontrolled] = pairLabelValue.split("/");
	return [controlled || "controlled prop", uncontrolled || "default prop"];
}

function pairLabel(pair: ControlledDefaultPair): string {
	return `${pair.controlled}/${pair.uncontrolled}`;
}

function comparePairs(
	a: ControlledDefaultPair,
	b: ControlledDefaultPair,
): number {
	return pairLabel(a).localeCompare(pairLabel(b));
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort();
}

function uniqueRoles(
	roles: AdapterMetricEvidence["roles"],
): AdapterMetricEvidence["roles"] {
	const byKey = new Map<string, AdapterMetricEvidence["roles"][number]>();
	for (const role of roles)
		byKey.set(`${role.role}:${role.variant}:${role.file}`, role);
	return [...byKey.values()];
}

function compareComponents(a: ComponentNode, b: ComponentNode): number {
	return (
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end ||
		a.name.localeCompare(b.name) ||
		a.id.localeCompare(b.id)
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

function compareFindings(a: Finding, b: Finding): number {
	return (
		a.fingerprint.structural.localeCompare(b.fingerprint.structural) ||
		a.fingerprint.nominal.localeCompare(b.fingerprint.nominal) ||
		a.fingerprint.positional.localeCompare(b.fingerprint.positional)
	);
}

function roleVariants(
	evidence: AdapterMetricEvidence,
	roleName: string,
): string[] {
	return uniqueSorted(
		evidence.roles
			.filter((role) => role.role === roleName)
			.map((role) => role.variant),
	);
}

function formatList(values: readonly string[]): string {
	if (values.length === 0) return "none";
	if (values.length === 1) return values[0]!;
	return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function formatListOrNone(values: readonly string[]): string {
	return values.length === 0 ? "none recorded" : formatList(values);
}

function plural(
	count: number,
	singular: string,
	pluralForm = `${singular}s`,
): string {
	return count === 1 ? singular : pluralForm;
}

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
