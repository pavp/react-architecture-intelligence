import { createHash } from "node:crypto";
import {
	explainTerm,
	type AdapterMetricEvidence,
	type AnalysisContext,
	type Analyzer,
	type AnalyzerResult,
	type ExplanationEnvelope,
	type Finding,
	type PatternFact,
	type PatternJsxFact,
	type PatternMemberAssignmentFact,
	type PresentedFinding,
	type Severity,
} from "@rai/core";

export const COMPOUND_COMPONENT_API_DRIFT_RULE_ID =
	"react/compound-component-api-drift";

interface CompoundRootObservation {
	root: string;
	declarationFactsByPart: Map<string, PatternMemberAssignmentFact[]>;
	usageFactsByPart: Map<string, PatternJsxFact[]>;
}

interface CompoundPartSets {
	declaredParts: string[];
	usedParts: string[];
	missingDeclarations: string[];
	unusedDeclarations: string[];
}

export function createCompoundComponentApiDriftAnalyzer(): Analyzer {
	return {
		ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeCompoundComponentApiDrift(ctx),
		explain: explainCompoundComponentApiDrift,
	};
}

function explainCompoundComponentApiDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== COMPOUND_COMPONENT_API_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	)
		return null;
	const evidence = finding.evidence;
	const root = evidence.subject.name;
	const declaredParts = roleVariants(evidence, "declared-part");
	const usedParts = roleVariants(evidence, "used-part");
	const missingParts = roleVariants(evidence, "missing-declaration");
	const groundingFields = Object.keys(evidence).sort();
	const missingCount =
		evidence.metrics.missingDeclarations ?? missingParts.length;
	const maxMissing = evidence.thresholds.maxMissingDeclarations ?? 0;

	return {
		summary: compoundSummary(root, missingParts),
		whyItMatters:
			"This is worth checking because observed compound part declarations and JSX member usage describe different part sets.",
		inspectFirst: [
			`${root} usage in ${evidence.subject.file}`,
			...missingParts.map(
				(part) =>
					`missing declaration observed: ${root}.${part} used in ${formatList(filesForRole(evidence, "missing-declaration", part))}`,
			),
			`declared parts observed: ${formatList(declaredParts) || "none recorded"}`,
			`used parts observed: ${formatList(usedParts) || "none recorded"}`,
			`missing declarations observed: ${missingCount} (limit: ${maxMissing})`,
			`observed counts: ${evidence.metrics.declaredParts ?? declaredParts.length} declared, ${evidence.metrics.usedParts ?? usedParts.length} used, ${missingCount} missing, ${evidence.metrics.unusedDeclarations ?? 0} unused`,
		],
		limits: [
			"This does not prove intended public API, type resolution, runtime export behavior, or required remediation.",
			"RAI only compares observed static member assignments and JSX member usage in current source.",
			"RAI does not infer team intent, ownership, root cause, historical change, or user impact from this finding alone.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function analyzeCompoundComponentApiDrift(ctx: AnalysisContext): Finding[] {
	const observations = observationsFor(ctx.graph.patternFacts);
	const findings: Finding[] = [];

	for (const observation of observations) {
		const partSets = partSetsFor(observation);
		if (partSets.missingDeclarations.length === 0) continue;

		const declarationFactIds = factsForParts(
			observation.declarationFactsByPart,
			partSets.declaredParts,
		)
			.map((fact) => fact.id)
			.sort();
		const usageFacts = factsForParts(
			observation.usageFactsByPart,
			partSets.usedParts,
		);
		const usageFactIds = usageFacts.map((fact) => fact.id).sort();
		const missingUsageFacts = factsForParts(
			observation.usageFactsByPart,
			partSets.missingDeclarations,
		);
		const primaryFact = missingUsageFacts[0] ?? usageFacts[0];
		if (!primaryFact) continue;

		const exceeded = partSets.missingDeclarations
			.map((part) => `missingDeclarations:${part}`)
			.sort();
		const subjectFingerprint = subjectFingerprintFor(
			observation.root,
			declarationFactIds,
			usageFactIds,
			exceeded,
		);
		findings.push({
			id: sha(
				[
					ctx.runId,
					COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
					observation.root,
					subjectFingerprint,
				].join("|"),
			),
			ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
			type: "opportunity",
			fingerprint: {
				structural: sha(
					[
						COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
						observation.root,
						...partSets.missingDeclarations,
					].join("|"),
				),
				nominal: sha(observation.root),
				positional: sha(primaryFact.file),
			},
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severityFor(partSets.missingDeclarations.length),
			evidence: evidenceFor(
				observation,
				partSets,
				primaryFact,
				subjectFingerprint,
				declarationFactIds,
				usageFactIds,
				exceeded,
			),
			createdAt: 0,
		});
	}

	return findings.sort((a, b) =>
		a.fingerprint.structural.localeCompare(b.fingerprint.structural),
	);
}

function observationsFor(
	facts: readonly PatternFact[],
): CompoundRootObservation[] {
	const byRoot = new Map<string, CompoundRootObservation>();

	for (const fact of [...facts].sort(compareFacts)) {
		if (fact.kind === "member-assignment") {
			const root = fact.object.trim();
			const part = fact.property.trim();
			if (!root || !part) continue;
			const observation = ensureObservation(byRoot, root);
			addFact(observation.declarationFactsByPart, part, fact);
		} else if (fact.kind === "jsx") {
			const split = splitJsxMemberTag(fact.tag);
			if (!split) continue;
			const observation = ensureObservation(byRoot, split.root);
			addFact(observation.usageFactsByPart, split.part, fact);
		}
	}

	return [...byRoot.values()]
		.filter(
			(observation) =>
				observation.declarationFactsByPart.size > 0 &&
				observation.usageFactsByPart.size > 0,
		)
		.sort((a, b) => a.root.localeCompare(b.root));
}

function ensureObservation(
	byRoot: Map<string, CompoundRootObservation>,
	root: string,
): CompoundRootObservation {
	const existing = byRoot.get(root);
	if (existing) return existing;
	const observation: CompoundRootObservation = {
		root,
		declarationFactsByPart: new Map(),
		usageFactsByPart: new Map(),
	};
	byRoot.set(root, observation);
	return observation;
}

function addFact<T extends PatternFact>(
	factsByPart: Map<string, T[]>,
	part: string,
	fact: T,
): void {
	factsByPart.set(
		part,
		[...(factsByPart.get(part) ?? []), fact].sort(compareFacts),
	);
}

function splitJsxMemberTag(tag: string): { root: string; part: string } | null {
	const trimmed = tag.trim();
	const lastDot = trimmed.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === trimmed.length - 1) return null;
	const root = trimmed.slice(0, lastDot).trim();
	const part = trimmed.slice(lastDot + 1).trim();
	return root && part ? { root, part } : null;
}

function partSetsFor(observation: CompoundRootObservation): CompoundPartSets {
	const declaredParts = [...observation.declarationFactsByPart.keys()].sort();
	const usedParts = [...observation.usageFactsByPart.keys()].sort();
	const declared = new Set(declaredParts);
	const used = new Set(usedParts);
	return {
		declaredParts,
		usedParts,
		missingDeclarations: usedParts.filter((part) => !declared.has(part)).sort(),
		unusedDeclarations: declaredParts.filter((part) => !used.has(part)).sort(),
	};
}

function evidenceFor(
	observation: CompoundRootObservation,
	partSets: CompoundPartSets,
	primaryFact: PatternJsxFact,
	subjectFingerprint: string,
	declarationFactIds: string[],
	usageFactIds: string[],
	exceeded: string[],
): AdapterMetricEvidence {
	return {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
		subject: {
			id: `react:compound-root:${observation.root}`,
			name: observation.root,
			file: primaryFact.file,
			span: primaryFact.span,
			fingerprint: subjectFingerprint,
		},
		roles: rolesFor(observation, partSets),
		metrics: {
			declaredParts: partSets.declaredParts.length,
			usedParts: partSets.usedParts.length,
			missingDeclarations: partSets.missingDeclarations.length,
			unusedDeclarations: partSets.unusedDeclarations.length,
		},
		thresholds: { maxMissingDeclarations: 0 },
		topology: {
			directChildIds: declarationFactIds,
			reachableNodeIds: usageFactIds,
			exceeded,
		},
	};
}

function rolesFor(
	observation: CompoundRootObservation,
	partSets: CompoundPartSets,
): AdapterMetricEvidence["roles"] {
	return uniqueRoles([
		...rolesFromFacts(
			"declared-part",
			observation.declarationFactsByPart,
			partSets.declaredParts,
		),
		...rolesFromFacts(
			"used-part",
			observation.usageFactsByPart,
			partSets.usedParts,
		),
		...rolesFromFacts(
			"missing-declaration",
			observation.usageFactsByPart,
			partSets.missingDeclarations,
		),
	]).sort(compareRoles);
}

function rolesFromFacts(
	role: string,
	factsByPart: ReadonlyMap<string, readonly PatternFact[]>,
	parts: readonly string[],
): AdapterMetricEvidence["roles"] {
	return parts.flatMap((part) =>
		(factsByPart.get(part) ?? []).map((fact) => ({
			role,
			variant: part,
			file: fact.file,
		})),
	);
}

function uniqueRoles(
	roles: AdapterMetricEvidence["roles"],
): AdapterMetricEvidence["roles"] {
	const byKey = new Map<string, AdapterMetricEvidence["roles"][number]>();
	for (const role of roles)
		byKey.set(`${role.role}:${role.variant}:${role.file}`, role);
	return [...byKey.values()];
}

function factsForParts<T extends PatternFact>(
	factsByPart: ReadonlyMap<string, readonly T[]>,
	parts: readonly string[],
): T[] {
	return parts
		.flatMap((part) => factsByPart.get(part) ?? [])
		.sort(compareFacts);
}

function subjectFingerprintFor(
	root: string,
	declarationFactIds: readonly string[],
	usageFactIds: readonly string[],
	exceeded: readonly string[],
): string {
	return sha(
		JSON.stringify({ declarationFactIds, exceeded, root, usageFactIds }),
	);
}

function severityFor(missingCount: number): Severity {
	return missingCount > 1 ? "warn" : "info";
}

function compareFacts(a: PatternFact, b: PatternFact): number {
	return (
		a.id.localeCompare(b.id) ||
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end
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

function filesForRole(
	evidence: AdapterMetricEvidence,
	roleName: string,
	variant: string,
): string[] {
	return uniqueSorted(
		evidence.roles
			.filter((role) => role.role === roleName && role.variant === variant)
			.map((role) => role.file),
	);
}

function compoundSummary(
	root: string,
	missingParts: readonly string[],
): string {
	if (missingParts.length === 1) {
		const part = missingParts[0]!;
		return `${root}.${part} is used in JSX, but no matching ${root}.${part} static member declaration was observed.`;
	}
	return `${root} has JSX uses for ${formatCompoundParts(root, missingParts)}, but matching static member declarations were not observed for those parts.`;
}

function formatCompoundParts(root: string, parts: readonly string[]): string {
	return formatList(parts.map((part) => `${root}.${part}`));
}

function formatList(values: readonly string[]): string {
	const unique = uniqueSorted(values.filter(Boolean));
	if (unique.length === 0) return "";
	if (unique.length === 1) return unique[0]!;
	if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
	return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
