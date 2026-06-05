import { createHash } from "node:crypto";
import {
	explainTerm,
	type AdapterMetricEvidence,
	type AnalysisContext,
	type Analyzer,
	type AnalyzerResult,
	type ExplanationEnvelope,
	type Finding,
	type PatternCallArgumentFact,
	type PatternCallBindingFact,
	type PatternFact,
	type PatternHookCallFact,
	type PatternJsxAttributeFact,
	type PatternJsxFact,
	type PresentedFinding,
	type Severity,
	type Span,
} from "@rai/core";

export const CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID =
	"react/context-provider-value-surface-drift";

type ContextProviderKey = `${string}\u0000${string}`;

type ProviderSurfaceKind =
	| "direct-value"
	| "missing-direct-value"
	| "direct-value-with-spread"
	| "spread-ambiguous";

interface DefaultArgumentSurface {
	observed: boolean;
	argumentKind: PatternCallArgumentFact["argumentKind"] | null;
	factIds: string[];
}

interface ProviderOccurrence {
	fact: PatternJsxFact;
	attributeFacts: PatternJsxAttributeFact[];
	directValueAttributeFacts: PatternJsxAttributeFact[];
	spreadAttributeFacts: PatternJsxAttributeFact[];
	hasDirectValue: boolean;
	hasSpread: boolean;
	surfaceKind: ProviderSurfaceKind;
	spanToken: string;
}

interface ContextBindingObservation {
	key: ContextProviderKey;
	file: string;
	localName: string;
	binding: PatternCallBindingFact;
	bindingFactIds: string[];
	defaultArgument: DefaultArgumentSurface;
	providers: ProviderOccurrence[];
	consumerFactIds: string[];
	consumerVariants: string[];
	collision: boolean;
}

export function createContextProviderValueSurfaceDriftAnalyzer(): Analyzer {
	return {
		ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeContextProviderValueSurfaceDrift(ctx),
		explain: explainContextProviderValueSurfaceDrift,
	};
}

function analyzeContextProviderValueSurfaceDrift(
	ctx: AnalysisContext,
): Finding[] {
	const observations = observationsFor(ctx.graph.patternFacts);
	const findings: Finding[] = [];

	for (const observation of observations) {
		if (observation.collision) continue;
		if (observation.providers.length === 0) continue;

		const exceeded = exceededTokensFor(observation);
		if (exceeded.length === 0) continue;

		const { file, localName, providers, defaultArgument } = observation;
		const directProviders = providers.filter(
			(provider) => provider.hasDirectValue,
		);
		const noDirectProviders = providers.filter(
			(provider) => !provider.hasDirectValue,
		);
		const spreadProviders = providers.filter((provider) => provider.hasSpread);
		const primarySpan = primarySpanFor(observation, exceeded);
		const providerJsxFactIds = sortedUnique(
			providers.map((provider) => provider.fact.id),
		);
		const providerAttributeFactIds = sortedUnique(
			providers.flatMap((provider) =>
				provider.attributeFacts.map((fact) => fact.id),
			),
		);
		const subjectFingerprint = subjectFingerprintFor(observation, exceeded);
		const structuralDivergenceTypes = sortedUnique(
			exceeded.map(divergenceLabelType),
		);
		const structuralProviderSurfaces = providers
			.map((provider) => `${provider.fact.tag}:${provider.surfaceKind}`)
			.sort();

		findings.push({
			id: sha(
				[
					ctx.runId,
					CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
					file,
					localName,
					subjectFingerprint,
				].join("|"),
			),
			ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			fingerprint: {
				structural: sha(
					JSON.stringify({
						defaultArgumentKind: defaultArgument.argumentKind,
						defaultObserved: defaultArgument.observed,
						divergenceTypes: structuralDivergenceTypes,
						file,
						localName,
						providerSurfaceKinds: structuralProviderSurfaces,
						ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
					}),
				),
				nominal: sha(localName),
				positional: sha([file, primarySpan.start, primarySpan.end].join("|")),
			},
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severityFor(exceeded.length),
			evidence: evidenceFor(
				observation,
				directProviders,
				noDirectProviders,
				spreadProviders,
				providerJsxFactIds,
				providerAttributeFactIds,
				primarySpan,
				subjectFingerprint,
				exceeded,
			),
			createdAt: 0,
		});
	}

	return findings.sort(compareFindings);
}

function observationsFor(
	facts: readonly PatternFact[],
): ContextBindingObservation[] {
	const sorted = [...facts].sort(compareFacts);
	const bindingFacts = sorted.filter(isCallBindingFact);
	const argumentFacts = sorted.filter(isCallArgumentFact);
	const consumerArgumentFacts = sorted.filter(isConsumerArgumentFact);
	const providerJsxFacts = sorted.filter(isProviderJsxFact);
	const providerAttributeFacts = sorted.filter(isProviderAttributeFact);
	const hookFacts = sorted.filter(isHookCallFact);

	const byKey = new Map<ContextProviderKey, PatternCallBindingFact[]>();
	for (const binding of bindingFacts) {
		const key = keyFor(binding.file, binding.local);
		byKey.set(key, [...(byKey.get(key) ?? []), binding]);
	}

	const observations: ContextBindingObservation[] = [];
	for (const [key, bindings] of byKey) {
		const sortedBindings = [...bindings].sort(compareFacts);
		const binding = sortedBindings[0]!;
		const collision = sortedBindings.length > 1;
		const providers = providerOccurrencesFor(
			binding,
			providerJsxFacts,
			providerAttributeFacts,
		);
		observations.push({
			key,
			file: binding.file,
			localName: binding.local,
			binding,
			bindingFactIds: sortedUnique(sortedBindings.map((fact) => fact.id)),
			defaultArgument: defaultArgumentFor(binding, argumentFacts),
			providers,
			...consumerObservationFor(binding, hookFacts, consumerArgumentFacts),
			collision,
		});
	}

	return observations.sort(compareObservations);
}

function providerOccurrencesFor(
	binding: PatternCallBindingFact,
	providerJsxFacts: readonly PatternJsxFact[],
	providerAttributeFacts: readonly PatternJsxAttributeFact[],
): ProviderOccurrence[] {
	return providerJsxFacts
		.filter(
			(fact) =>
				fact.file === binding.file &&
				splitProviderTag(fact.tag)?.localName === binding.local,
		)
		.sort(compareProviderJsx)
		.map((fact) => {
			const attributeFacts = providerAttributeFacts
				.filter(
					(attribute) =>
						attribute.file === fact.file &&
						attribute.tag === fact.tag &&
						spanContains(fact.span, attribute.span),
				)
				.sort(compareFacts);
			const directValueAttributeFacts = attributeFacts.filter(
				isDirectProviderValueAttribute,
			);
			const spreadAttributeFacts = attributeFacts.filter(
				isSpreadProviderAttribute,
			);
			const hasDirectValue = directValueAttributeFacts.length > 0;
			const hasSpread = spreadAttributeFacts.length > 0;
			return {
				fact,
				attributeFacts,
				directValueAttributeFacts,
				spreadAttributeFacts,
				hasDirectValue,
				hasSpread,
				surfaceKind: surfaceKindFor(hasDirectValue, hasSpread),
				spanToken: spanTokenFor(fact),
			};
		});
}

function defaultArgumentFor(
	binding: PatternCallBindingFact,
	argumentFacts: readonly PatternCallArgumentFact[],
): DefaultArgumentSurface {
	const initPathPrefix = `${binding.span.astPath}>init`;
	const matching = argumentFacts
		.filter(
			(arg) =>
				arg.file === binding.file &&
				arg.callee.trim() === binding.callee.trim() &&
				arg.argumentIndex === 0 &&
				(arg.span.astPath.startsWith(initPathPrefix) ||
					spanContains(binding.span, arg.span)),
		)
		.sort(compareFacts);
	if (matching.length === 0) {
		return { observed: false, argumentKind: null, factIds: [] };
	}
	return {
		observed: true,
		argumentKind: matching[0]!.argumentKind,
		factIds: sortedUnique(matching.map((fact) => fact.id)),
	};
}

function consumerObservationFor(
	binding: PatternCallBindingFact,
	hookFacts: readonly PatternHookCallFact[],
	argumentFacts: readonly PatternCallArgumentFact[],
): { consumerFactIds: string[]; consumerVariants: string[] } {
	const ids: string[] = [];
	const variants: string[] = [];
	const useContextArgs = argumentFacts.filter(
		(arg) =>
			arg.file === binding.file &&
			arg.argumentIndex === 0 &&
			arg.argument === binding.local &&
			(arg.callee.trim() === "useContext" || arg.callee.trim() === "use"),
	);
	for (const arg of useContextArgs) {
		const hookName = arg.callee.trim();
		ids.push(arg.id);
		variants.push(hookName);
		if (hookName === "useContext") {
			for (const hook of hookFacts) {
				if (
					hook.file === binding.file &&
					hook.name === "useContext" &&
					spanOverlaps(hook.span, arg.span)
				) {
					ids.push(hook.id);
				}
			}
		}
	}
	return {
		consumerFactIds: sortedUnique(ids),
		consumerVariants: sortedUnique(variants),
	};
}

function exceededTokensFor(observation: ContextBindingObservation): string[] {
	const tokens: string[] = [];
	const { providers, defaultArgument } = observation;

	if (!defaultArgument.observed) {
		for (const provider of providers) {
			if (!provider.hasDirectValue) {
				tokens.push(
					`noDefaultArgumentAndProviderNoDirectValue:${provider.spanToken}`,
				);
			}
		}
	}

	const hasDirect = providers.some((provider) => provider.hasDirectValue);
	const hasNoDirect = providers.some((provider) => !provider.hasDirectValue);
	if (hasDirect && hasNoDirect) {
		tokens.push(`mixedProviderDirectValuePresence:${observation.localName}`);
	}

	for (const provider of providers) {
		if (provider.hasSpread) {
			tokens.push(`providerSpreadAmbiguous:${provider.spanToken}`);
		}
	}

	return sortedUnique(tokens);
}

function primarySpanFor(
	observation: ContextBindingObservation,
	exceeded: readonly string[],
): Span {
	const spanTokens = new Set(
		exceeded
			.map((token) => token.slice(token.indexOf(":") + 1))
			.filter((value) => value.includes("@")),
	);
	const divergent = observation.providers.find((provider) =>
		spanTokens.has(provider.spanToken),
	);
	if (divergent) return divergent.fact.span;
	const first = observation.providers[0];
	return first ? first.fact.span : observation.binding.span;
}

function evidenceFor(
	observation: ContextBindingObservation,
	directProviders: readonly ProviderOccurrence[],
	noDirectProviders: readonly ProviderOccurrence[],
	spreadProviders: readonly ProviderOccurrence[],
	providerJsxFactIds: readonly string[],
	providerAttributeFactIds: readonly string[],
	primarySpan: Span,
	subjectFingerprint: string,
	exceeded: readonly string[],
): AdapterMetricEvidence {
	const { file, localName, providers, defaultArgument } = observation;
	return {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
		subject: {
			id: `react:context-provider:${file}:${localName}`,
			name: localName,
			file,
			span: primarySpan,
			fingerprint: subjectFingerprint,
		},
		roles: rolesFor(observation),
		metrics: {
			contextBindings: 1,
			defaultArgumentsObserved: defaultArgument.observed ? 1 : 0,
			providers: providers.length,
			providersWithDirectValue: directProviders.length,
			providersWithoutDirectValue: noDirectProviders.length,
			providersWithSpread: spreadProviders.length,
			directValuePresenceModes:
				directProviders.length > 0 && noDirectProviders.length > 0 ? 2 : 1,
			consumerCalls: observation.consumerFactIds.length,
			surfaceDivergences: exceeded.length,
		},
		thresholds: {
			minProviders: 1,
			maxProvidersWithoutDirectValueWhenNoDefault: 0,
			maxMixedDirectValuePresence: 0,
			maxSpreadAmbiguousProviders: 0,
		},
		topology: {
			directChildIds: sortedUnique([
				...observation.bindingFactIds,
				...defaultArgument.factIds,
			]),
			reachableNodeIds: sortedUnique([
				...providerJsxFactIds,
				...providerAttributeFactIds,
				...observation.consumerFactIds,
			]),
			exceeded: [...exceeded].sort(),
		},
	};
}

function rolesFor(
	observation: ContextBindingObservation,
): AdapterMetricEvidence["roles"] {
	const { file, localName, binding, defaultArgument, providers } = observation;
	const roles: AdapterMetricEvidence["roles"] = [
		{ role: "context-binding", variant: localName, file },
		{
			role: "create-context-callee",
			variant: calleeVariant(binding.callee),
			file,
		},
		{
			role: "default-argument",
			variant: defaultArgument.observed
				? `observed:${defaultArgument.argumentKind}`
				: "absent",
			file,
		},
	];
	for (const provider of providers) {
		const positionToken = `${provider.fact.span.start}-${provider.fact.span.end}`;
		roles.push({
			role: "provider-surface",
			variant: `${provider.surfaceKind}@${positionToken}`,
			file: provider.fact.file,
		});
		for (const attribute of provider.directValueAttributeFacts) {
			roles.push({
				role: "provider-direct-value",
				variant: `${attribute.valueKind}@${attribute.span.start}-${attribute.span.end}`,
				file: attribute.file,
			});
		}
		for (const attribute of provider.spreadAttributeFacts) {
			roles.push({
				role: "provider-spread-ambiguous",
				variant: `${attribute.name}@${attribute.span.start}-${attribute.span.end}`,
				file: attribute.file,
			});
		}
	}
	for (const consumerVariant of observation.consumerVariants) {
		// the variant is the observed consumer hook name (useContext or use);
		// emission never depends on consumer presence, so this stays corroborative.
		roles.push({
			role: "context-consumer-call",
			variant: consumerVariant,
			file,
		});
	}
	return uniqueRoles(roles).sort(compareRoles);
}

function explainContextProviderValueSurfaceDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence;
	const name = evidence.subject.name;
	const exceeded = evidence.topology.exceeded;
	const hasNoDefault = exceeded.some((token) =>
		token.startsWith("noDefaultArgumentAndProviderNoDirectValue:"),
	);
	const hasMixed = exceeded.some((token) =>
		token.startsWith("mixedProviderDirectValuePresence:"),
	);
	const hasSpread = exceeded.some((token) =>
		token.startsWith("providerSpreadAmbiguous:"),
	);
	const groundingFields = Object.keys(evidence).sort();
	const defaultObserved = (evidence.metrics.defaultArgumentsObserved ?? 0) > 0;

	return {
		summary: summaryFor(name, { hasNoDefault, hasMixed, hasSpread }),
		whyItMatters:
			"This is worth checking because the observed createContext default and same-file provider value surfaces are not uniform, which can make the context's value contract harder to review, onboard onto, or maintain consistently.",
		inspectFirst: [
			`${name} in ${evidence.subject.file}`,
			`createContext default argument observed: ${defaultObserved ? "yes" : "no"}`,
			`providers observed: ${evidence.metrics.providers ?? 0} (${evidence.metrics.providersWithDirectValue ?? 0} with a direct value attribute, ${evidence.metrics.providersWithoutDirectValue ?? 0} without)`,
			`providers with spread attributes: ${evidence.metrics.providersWithSpread ?? 0}`,
			`consumer hook corroboration observed: ${evidence.metrics.consumerCalls ?? 0}`,
			`value-surface divergence signals observed: ${evidence.metrics.surfaceDivergences ?? exceeded.length}`,
		],
		limits: [
			"This is a syntax-surface observation only; it does not establish runtime provider value behavior, framework warnings, defects, or any required code change.",
			"RAI only compares observed createContext and JSX provider value-attribute names in current source within a single file.",
			"RAI does not interpret spread attributes and makes no claim about which names a spread object provides.",
			"RAI does not resolve cross-file symbol identity, TypeScript types, intended provider design, team purpose, originating reason, or downstream impact from this finding alone.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function summaryFor(
	name: string,
	labels: { hasNoDefault: boolean; hasMixed: boolean; hasSpread: boolean },
): string {
	const active: string[] = [];
	if (labels.hasNoDefault) active.push("missing-direct-value-without-default");
	if (labels.hasMixed) active.push("mixed-direct-value-presence");
	if (labels.hasSpread) active.push("spread-ambiguous-value-surface");

	if (active.length > 1) {
		return `${name} has multiple same-file provider value-surface divergence signals: ${formatList(active)}.`;
	}
	if (labels.hasMixed) {
		return `${name} has same-file providers where some occurrences have a direct value attribute and some do not.`;
	}
	if (labels.hasSpread) {
		return `${name} has a same-file provider spread attribute, so the direct value surface is ambiguous from syntax facts.`;
	}
	return `${name} has a same-file provider with no directly observed value attribute, and no createContext default argument was observed.`;
}

// ── Fact guards and helpers (adapter-owned; no React semantics in core) ──────

function isCallBindingFact(fact: PatternFact): fact is PatternCallBindingFact {
	return (
		fact.kind === "call-binding" &&
		isCreateContextCallee(fact.callee) &&
		isIdentifierName(fact.local)
	);
}

function isCallArgumentFact(
	fact: PatternFact,
): fact is PatternCallArgumentFact {
	return fact.kind === "call-argument" && isCreateContextCallee(fact.callee);
}

function isConsumerArgumentFact(
	fact: PatternFact,
): fact is PatternCallArgumentFact {
	return (
		fact.kind === "call-argument" &&
		(fact.callee.trim() === "useContext" || fact.callee.trim() === "use")
	);
}

function isProviderJsxFact(fact: PatternFact): fact is PatternJsxFact {
	return fact.kind === "jsx" && splitProviderTag(fact.tag) !== null;
}

function isProviderAttributeFact(
	fact: PatternFact,
): fact is PatternJsxAttributeFact {
	return fact.kind === "jsx-attribute" && splitProviderTag(fact.tag) !== null;
}

function isHookCallFact(fact: PatternFact): fact is PatternHookCallFact {
	return fact.kind === "hook-call";
}

function isCreateContextCallee(callee: string): boolean {
	const value = callee.trim();
	return value === "createContext" || value.endsWith(".createContext");
}

function isIdentifierName(value: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value.trim());
}

function splitProviderTag(tag: string): { localName: string } | null {
	const value = tag.trim();
	const suffix = ".Provider";
	if (!value.endsWith(suffix)) return null;
	const localName = value.slice(0, -suffix.length).trim();
	return isIdentifierName(localName) ? { localName } : null;
}

function isDirectProviderValueAttribute(
	fact: PatternJsxAttributeFact,
): boolean {
	return fact.name === "value" && fact.valueKind !== "spread";
}

function isSpreadProviderAttribute(fact: PatternJsxAttributeFact): boolean {
	return fact.valueKind === "spread";
}

function surfaceKindFor(
	hasDirectValue: boolean,
	hasSpread: boolean,
): ProviderSurfaceKind {
	if (hasDirectValue && hasSpread) return "direct-value-with-spread";
	if (hasDirectValue) return "direct-value";
	if (hasSpread) return "spread-ambiguous";
	return "missing-direct-value";
}

function calleeVariant(callee: string): string {
	const value = callee.trim();
	return value === "createContext" ? "bare:createContext" : `member:${value}`;
}

function divergenceLabelType(token: string): string {
	const separator = token.indexOf(":");
	return separator === -1 ? token : token.slice(0, separator);
}

function spanTokenFor(fact: PatternJsxFact): string {
	return `${fact.file}@${fact.span.start}-${fact.span.end}`;
}

function keyFor(file: string, localName: string): ContextProviderKey {
	return `${file}\u0000${localName}` as ContextProviderKey;
}

function subjectFingerprintFor(
	observation: ContextBindingObservation,
	exceeded: readonly string[],
): string {
	return sha(
		JSON.stringify({
			bindingFactIds: observation.bindingFactIds,
			consumerFactIds: observation.consumerFactIds,
			defaultArgument: {
				argumentKind: observation.defaultArgument.argumentKind,
				factIds: observation.defaultArgument.factIds,
				observed: observation.defaultArgument.observed,
			},
			exceeded: [...exceeded],
			file: observation.file,
			localName: observation.localName,
			providerSurfaces: observation.providers.map((provider) => ({
				attributeFactIds: provider.attributeFacts.map((fact) => fact.id).sort(),
				directValueFactIds: provider.directValueAttributeFacts
					.map((fact) => fact.id)
					.sort(),
				file: provider.fact.file,
				hasDirectValue: provider.hasDirectValue,
				hasSpread: provider.hasSpread,
				span: { end: provider.fact.span.end, start: provider.fact.span.start },
				spreadFactIds: provider.spreadAttributeFacts
					.map((fact) => fact.id)
					.sort(),
				surfaceKind: provider.surfaceKind,
				tag: provider.fact.tag,
			})),
		}),
	);
}

function severityFor(divergenceCount: number): Severity {
	return divergenceCount > 1 ? "warn" : "info";
}

function spanContains(container: Span, child: Span): boolean {
	return (
		container.file === child.file &&
		child.start >= container.start &&
		child.end <= container.end
	);
}

function spanOverlaps(a: Span, b: Span): boolean {
	return a.file === b.file && a.start <= b.end && b.start <= a.end;
}

function compareFacts(a: PatternFact, b: PatternFact): number {
	return (
		a.id.localeCompare(b.id) ||
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end ||
		a.kind.localeCompare(b.kind)
	);
}

function compareProviderJsx(a: PatternJsxFact, b: PatternJsxFact): number {
	return (
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end ||
		a.tag.localeCompare(b.tag) ||
		a.id.localeCompare(b.id)
	);
}

function compareObservations(
	a: ContextBindingObservation,
	b: ContextBindingObservation,
): number {
	return (
		a.file.localeCompare(b.file) ||
		a.localName.localeCompare(b.localName) ||
		a.binding.span.start - b.binding.span.start ||
		a.binding.span.end - b.binding.span.end ||
		a.binding.id.localeCompare(b.binding.id)
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

function uniqueRoles(
	roles: AdapterMetricEvidence["roles"],
): AdapterMetricEvidence["roles"] {
	const byKey = new Map<string, AdapterMetricEvidence["roles"][number]>();
	for (const role of roles)
		byKey.set(`${role.role}:${role.variant}:${role.file}`, role);
	return [...byKey.values()];
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort();
}

function formatList(values: readonly string[]): string {
	if (values.length === 0) return "none";
	if (values.length === 1) return values[0]!;
	return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
