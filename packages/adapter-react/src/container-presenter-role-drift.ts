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
	type GraphEdge,
	type PatternFact,
	type PatternHookCallFact,
	type PresentedFinding,
	type Severity,
	type Span,
} from "@rai/core";

export const CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID =
	"react/container-presenter-role-drift";

const CONTAINER_SUFFIXES = ["Container"] as const;
const PRESENTER_SUFFIXES = ["Presenter", "View"] as const;
const CONTAINER_PATH_SEGMENTS = new Set(["container", "containers"]);
const PRESENTER_PATH_SEGMENTS = new Set([
	"presenter",
	"presenters",
	"view",
	"views",
]);
const HIGH_SIGNAL_HOOKS = new Set([
	"useState",
	"useReducer",
	"useActionState",
	"useOptimistic",
	"useSyncExternalStore",
	"useEffect",
	"useLayoutEffect",
	"useInsertionEffect",
	"useQuery",
	"useSuspenseQuery",
	"useInfiniteQuery",
	"useMutation",
	"useSWR",
	"useLoaderData",
	"useRouteLoaderData",
	"useActionData",
	"useFetcher",
	"useFetchers",
]);

interface RoleSeedInfo {
	containerSeeds: string[];
	presenterSeeds: string[];
}

export function createContainerPresenterRoleDriftAnalyzer(): Analyzer {
	return {
		ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeContainerPresenterRoleDrift(ctx),
		explain: explainContainerPresenterRoleDrift,
	};
}

function explainContainerPresenterRoleDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}
	const evidence = finding.evidence;
	const [containerName, presenterName] = splitSubjectName(
		evidence.subject.name,
	);
	const containerSeeds = roleVariants(evidence, "container-role-seed");
	const presenterSeeds = roleVariants(evidence, "presenter-role-seed");
	const hooks = roleVariants(evidence, "presenter-high-signal-hook");
	const exceeded = evidence.topology.exceeded;
	const groundingFields = Object.keys(evidence).sort();
	const hookText = formatList(hooks);

	return {
		summary: `${containerName} renders ${presenterName}. ${presenterName} looks presenter-like from observed role-name/path evidence, but it also has high-signal hook evidence: ${hookText}.`,
		whyItMatters:
			"This is worth checking because the repo's naming suggests a container/view split while measured syntax puts state, effect, or data-hook logic on the presenter-like side.",
		inspectFirst: [
			`${evidence.subject.name} in ${evidence.subject.file}`,
			...containerSeeds.map((seed) => `container evidence: ${seed}`),
			...presenterSeeds.map((seed) => `presenter evidence: ${seed}`),
			...hooks.map((hook) => `hook evidence: ${hook}`),
			...exceeded.map((item) => `threshold crossed: ${item}`),
			`metrics: ${evidence.metrics.containerRoleSeeds ?? 0} container role ${plural(evidence.metrics.containerRoleSeeds ?? 0, "seed")}, ${evidence.metrics.presenterRoleSeeds ?? 0} presenter role ${plural(evidence.metrics.presenterRoleSeeds ?? 0, "seed")}, ${evidence.metrics.renderPairs ?? 0} render ${plural(evidence.metrics.renderPairs ?? 0, "pair")}, ${evidence.metrics.presenterHighSignalHookCalls ?? 0} high-signal presenter ${plural(evidence.metrics.presenterHighSignalHookCalls ?? 0, "hook")}`,
		],
		limits: [
			"This does not prove wrong architecture or that refactoring is required.",
			"RAI does not infer team intent, semantic ownership, root cause, bug cause, historical change, or user impact from this finding alone.",
			"If this repo intentionally allows hooks in View/Presenter components, treat this as a convention signal rather than a bug.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function analyzeContainerPresenterRoleDrift(ctx: AnalysisContext): Finding[] {
	const components = [...ctx.graph.components].sort(compareComponents);
	const byId = new Map(
		components.map((component) => [component.id, component]),
	);
	const roleSeeds = new Map(
		components.map((component) => [component.id, roleSeedsFor(component)]),
	);
	const renderEdges = dedupeEdges(
		ctx.graph.edges.filter((edge) => edge.kind === "renders"),
	).sort(compareEdges);
	const hookFacts = ctx.graph.patternFacts
		.filter(isHookCallFact)
		.sort(compareHookFacts);
	const findings: Finding[] = [];

	for (const edge of renderEdges) {
		const container = byId.get(edge.srcId);
		const presenter = byId.get(edge.dstId);
		if (!container || !presenter) continue;

		const containerSeeds = roleSeeds.get(container.id)?.containerSeeds ?? [];
		const presenterSeeds = roleSeeds.get(presenter.id)?.presenterSeeds ?? [];
		if (containerSeeds.length === 0 || presenterSeeds.length === 0) continue;

		const highSignalHooks = highSignalHooksFor(presenter.hookCalls);
		if (highSignalHooks.length === 0) continue;

		const matchingHookFacts = matchingHookFactsFor(
			presenter,
			hookFacts,
			highSignalHooks,
		);
		const hookFactIds = matchingHookFacts.map((fact) => fact.id).sort();
		const primarySpan = matchingHookFacts[0]?.span ?? presenter.span;
		const exceeded = highSignalHooks
			.map((hook) => `presenterHighSignalHook:${hook}`)
			.sort();
		const renderEdgeId = edgeId(edge);
		const subjectFingerprint = subjectFingerprintFor(
			container,
			presenter,
			containerSeeds,
			presenterSeeds,
			highSignalHooks,
			renderEdgeId,
			hookFactIds,
		);

		findings.push({
			id: sha(
				[
					ctx.runId,
					CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
					container.id,
					presenter.id,
					subjectFingerprint,
				].join("|"),
			),
			ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
			type: "opportunity",
			fingerprint: {
				structural: sha(
					[
						CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
						subjectFingerprint,
						...exceeded,
					].join("|"),
				),
				nominal: sha(`${container.name}->${presenter.name}`),
				positional: sha(presenter.file),
			},
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severityFor(highSignalHooks.length),
			evidence: evidenceFor(
				container,
				presenter,
				containerSeeds,
				presenterSeeds,
				highSignalHooks,
				hookFactIds,
				primarySpan,
				subjectFingerprint,
				exceeded,
			),
			createdAt: 0,
		});
	}

	return findings.sort(compareFindings);
}

function evidenceFor(
	container: ComponentNode,
	presenter: ComponentNode,
	containerSeeds: string[],
	presenterSeeds: string[],
	highSignalHooks: string[],
	hookFactIds: string[],
	primarySpan: Span,
	subjectFingerprint: string,
	exceeded: string[],
): AdapterMetricEvidence {
	return {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
		subject: {
			id: `react:container-presenter:${container.id}->${presenter.id}`,
			name: `${container.name} -> ${presenter.name}`,
			file: presenter.file,
			span: primarySpan,
			fingerprint: subjectFingerprint,
		},
		roles: rolesFor(
			container,
			presenter,
			containerSeeds,
			presenterSeeds,
			highSignalHooks,
		),
		metrics: {
			containerRoleSeeds: containerSeeds.length,
			presenterRoleSeeds: presenterSeeds.length,
			renderPairs: 1,
			presenterHighSignalHookCalls: highSignalHooks.length,
		},
		thresholds: {
			minContainerRoleSeeds: 1,
			minPresenterRoleSeeds: 1,
			minRenderPairs: 1,
			maxPresenterHighSignalHookCalls: 0,
		},
		topology: {
			directChildIds: [presenter.id].sort(),
			reachableNodeIds: uniqueSorted([
				container.id,
				presenter.id,
				...hookFactIds,
			]),
			exceeded,
		},
	};
}

function rolesFor(
	container: ComponentNode,
	presenter: ComponentNode,
	containerSeeds: string[],
	presenterSeeds: string[],
	highSignalHooks: string[],
): AdapterMetricEvidence["roles"] {
	return uniqueRoles([
		{
			role: "container-component",
			variant: container.name,
			file: container.file,
		},
		{
			role: "presenter-component",
			variant: presenter.name,
			file: presenter.file,
		},
		...containerSeeds.map((seed) => ({
			role: "container-role-seed",
			variant: seed,
			file: container.file,
		})),
		...presenterSeeds.map((seed) => ({
			role: "presenter-role-seed",
			variant: seed,
			file: presenter.file,
		})),
		{
			role: "render-pair",
			variant: `${container.name}->${presenter.name}`,
			file: presenter.file,
		},
		...highSignalHooks.map((hook) => ({
			role: "presenter-high-signal-hook",
			variant: hook,
			file: presenter.file,
		})),
	]).sort(compareRoles);
}

function roleSeedsFor(component: ComponentNode): RoleSeedInfo {
	return {
		containerSeeds: seedsFor(
			component,
			CONTAINER_SUFFIXES,
			CONTAINER_PATH_SEGMENTS,
		),
		presenterSeeds: seedsFor(
			component,
			PRESENTER_SUFFIXES,
			PRESENTER_PATH_SEGMENTS,
		),
	};
}

function seedsFor(
	component: ComponentNode,
	suffixes: readonly string[],
	pathSegments: ReadonlySet<string>,
): string[] {
	const seeds: string[] = [];
	for (const suffix of suffixes) {
		if (hasNonEmptySuffix(component.name, suffix))
			seeds.push(`name-suffix:${suffix}`);
		if (hasNonEmptySuffix(fileBaseName(component.file), suffix))
			seeds.push(`file-basename-suffix:${suffix}`);
	}
	for (const segment of pathTokens(directoryName(component.file))) {
		if (pathSegments.has(segment)) seeds.push(`path-segment:${segment}`);
	}
	const basenameTokens = pathTokens(fileBaseName(component.file));
	const hasBasenameQualifier = basenameTokens.some(
		(segment) => !pathSegments.has(segment),
	);
	if (hasBasenameQualifier) {
		for (const segment of basenameTokens) {
			if (pathSegments.has(segment)) seeds.push(`path-segment:${segment}`);
		}
	}
	return uniqueSorted(seeds);
}

function hasNonEmptySuffix(value: string, suffix: string): boolean {
	return value.endsWith(suffix) && value.length > suffix.length;
}

function fileBaseName(file: string): string {
	const normalized = file.replace(/\\/g, "/");
	const base = normalized.split("/").pop() ?? normalized;
	return base.replace(/\.[^.]+$/, "");
}

function directoryName(file: string): string {
	const normalized = file.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");
	return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

function pathTokens(path: string): string[] {
	return path
		.split(/[\\/._-]+/)
		.map((segment) => segment.trim().toLowerCase())
		.filter(Boolean)
		.sort();
}

function highSignalHooksFor(hookCalls: readonly string[]): string[] {
	return uniqueSorted(hookCalls.filter((hook) => HIGH_SIGNAL_HOOKS.has(hook)));
}

function matchingHookFactsFor(
	presenter: ComponentNode,
	facts: readonly PatternHookCallFact[],
	highSignalHooks: readonly string[],
): PatternHookCallFact[] {
	const hooks = new Set(highSignalHooks);
	return facts
		.filter(
			(fact) =>
				fact.file === presenter.file &&
				hooks.has(fact.name) &&
				spanContains(presenter.span, fact.span),
		)
		.sort(compareHookFacts);
}

function spanContains(container: Span, child: Span): boolean {
	return (
		container.file === child.file &&
		child.start >= container.start &&
		child.end <= container.end
	);
}

function subjectFingerprintFor(
	container: ComponentNode,
	presenter: ComponentNode,
	containerSeeds: readonly string[],
	presenterSeeds: readonly string[],
	highSignalHooks: readonly string[],
	renderEdgeId: string,
	hookFactIds: readonly string[],
): string {
	return sha(
		JSON.stringify({
			containerFingerprint: componentFingerprint(container),
			containerSeeds,
			highSignalHooks,
			hookFactIds,
			presenterFingerprint: componentFingerprint(presenter),
			presenterSeeds,
			renderEdgeId,
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

function severityFor(highSignalHookCount: number): Severity {
	return highSignalHookCount > 1 ? "warn" : "info";
}

function isHookCallFact(fact: PatternFact): fact is PatternHookCallFact {
	return fact.kind === "hook-call";
}

function dedupeEdges(edges: readonly GraphEdge[]): GraphEdge[] {
	const byKey = new Map<string, GraphEdge>();
	for (const edge of edges) byKey.set(edgeId(edge), edge);
	return [...byKey.values()];
}

function edgeId(edge: GraphEdge): string {
	return `${edge.kind}:${edge.srcId}->${edge.dstId}`;
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
		a.id.localeCompare(b.id) ||
		a.name.localeCompare(b.name) ||
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end
	);
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
	return (
		a.srcId.localeCompare(b.srcId) ||
		a.dstId.localeCompare(b.dstId) ||
		a.kind.localeCompare(b.kind)
	);
}

function compareHookFacts(
	a: PatternHookCallFact,
	b: PatternHookCallFact,
): number {
	return (
		a.id.localeCompare(b.id) ||
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end ||
		a.name.localeCompare(b.name)
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

function splitSubjectName(subjectName: string): [string, string] {
	const [container, presenter] = subjectName.split(" -> ");
	return [
		container || "container-like component",
		presenter || "presenter-like component",
	];
}

function formatList(values: readonly string[]): string {
	if (values.length === 0) return "none";
	if (values.length === 1) return values[0]!;
	return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
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
