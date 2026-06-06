import { createHash } from "node:crypto";
import {
	explainTerm,
	type AdapterMetricEvidence,
	type AnalysisContext,
	type Analyzer,
	type AnalyzerResult,
	type ExplanationEnvelope,
	type Finding,
	type PatternCallFact,
	type PatternFact,
	type PatternHookCallFact,
	type PresentedFinding,
	type Severity,
	type Span,
} from "@rai/core";

export const DATA_FETCHING_SURFACE_DRIFT_RULE_ID =
	"react/data-fetching-surface-drift";

// ── Semantic constants (adapter-owned; all fetch/query semantics stay local) ──

const DIVERGENCE_TOKEN = "fetchVsQueryHookDrift";

// Raw-fetch call callee names (verbatim as produced by expressionText)
const FETCH_CALLEES: ReadonlySet<string> = Object.freeze(
	new Set(["fetch", "window.fetch", "globalThis.fetch"]),
);

// Query-hook hook-call names (useQuery, etc. — ADR-4: hook-call is the ONLY discriminator)
const QUERY_HOOK_NAMES: ReadonlySet<string> = Object.freeze(
	new Set([
		"useQuery",
		"useLazyQuery",
		"useSuspenseQuery",
		"useInfiniteQuery",
		"useMutation",
		"useSWR",
		"useInfiniteSWR",
		"useSWRInfinite",
		"useSWRMutation",
		"useApolloQuery",
		"useLazyApolloQuery",
	]),
);

export function createDataFetchingSurfaceDriftAnalyzer(): Analyzer {
	return {
		ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeDataFetchingSurfaceDrift(ctx),
		explain: explainDataFetchingSurfaceDrift,
	};
}

// ── Fact guards ───────────────────────────────────────────────────────────────

function isFetchCallFact(fact: PatternFact): fact is PatternCallFact {
	return fact.kind === "call" && FETCH_CALLEES.has((fact as PatternCallFact).callee);
}

function isQueryHookFact(fact: PatternFact): fact is PatternHookCallFact {
	return (
		fact.kind === "hook-call" &&
		QUERY_HOOK_NAMES.has((fact as PatternHookCallFact).name)
	);
}

// ── Core analysis ─────────────────────────────────────────────────────────────

function analyzeDataFetchingSurfaceDrift(ctx: AnalysisContext): Finding[] {
	const facts = [...ctx.graph.patternFacts].sort(compareFacts);

	// Partition into fetch call facts and query hook-call facts
	const fetchCalls = facts.filter(isFetchCallFact) as PatternCallFact[];
	const queryHooks = facts.filter(isQueryHookFact) as PatternHookCallFact[];

	// Group by file for per-file co-presence detection (ADR-4, ADR-5)
	const files = sortedUnique([
		...fetchCalls.map((f) => f.file),
		...queryHooks.map((f) => f.file),
	]);

	const findings: Finding[] = [];

	for (const file of files) {
		const fileFetchCalls = fetchCalls.filter((f) => f.file === file);
		const fileQueryHooks = queryHooks.filter((f) => f.file === file);

		const hasFetch = fileFetchCalls.length > 0;
		const hasQueryHook = fileQueryHooks.length > 0;

		// ADR-5: gate — both families must be co-present in the same file
		if (!hasFetch || !hasQueryHook) continue;

		// divergenceCount is always 1 (one token per file) → severity always "info"
		const exceeded = [`${DIVERGENCE_TOKEN}:${file}`];
		const divergenceCount = exceeded.length; // always 1
		const severity = severityFor(divergenceCount);

		// Observed unique callee/hook names
		const observedFetchCallees = sortedUnique(fileFetchCalls.map((f) => f.callee));
		const observedQueryHooks = sortedUnique(fileQueryHooks.map((f) => f.name));

		// ADR-6: structural fingerprint — span/id free, sorted names
		const structuralFp = sha(
			JSON.stringify({
				ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
				file,
				divergenceTypes: [DIVERGENCE_TOKEN],
				fetchCallees: observedFetchCallees,
				queryHooks: observedQueryHooks,
			}),
		);

		// ADR-6: span anchor — lowest span.start among contributing facts, tie-break compareFacts
		const primarySpan = primarySpanFor(fileFetchCalls, fileQueryHooks, file);

		const subjectId = `react:data-fetching-surface:${file}`;
		const findingId = sha(
			[ctx.runId, DATA_FETCHING_SURFACE_DRIFT_RULE_ID, file, structuralFp].join("|"),
		);

		// ── Roles ────────────────────────────────────────────────────────────
		const roles: AdapterMetricEvidence["roles"] = [];

		for (const f of fileFetchCalls) {
			roles.push({ role: "fetch-call", variant: f.callee, file: f.file });
		}
		for (const f of fileQueryHooks) {
			roles.push({ role: "query-hook-call", variant: f.name, file: f.file });
		}

		// ── Topology IDs ─────────────────────────────────────────────────────
		const directChildIds = sortedUnique(fileFetchCalls.map((f) => f.id));
		const reachableNodeIds = sortedUnique(fileQueryHooks.map((f) => f.id));

		const evidence: AdapterMetricEvidence = {
			kind: "adapter-metric",
			adapterId: "react",
			ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
			subject: {
				id: subjectId,
				name: file,
				file,
				span: primarySpan,
				fingerprint: structuralFp,
			},
			roles: uniqueRoles(roles).sort(compareRoles),
			metrics: {
				fetchCalls: fileFetchCalls.length,
				queryHookCalls: fileQueryHooks.length,
				fetchCalleesObserved: observedFetchCallees.length,
				queryHooksObserved: observedQueryHooks.length,
				surfaceDivergences: divergenceCount,
			},
			thresholds: {
				minFetchCalls: 1,
				minQueryHookCalls: 1,
			},
			topology: {
				directChildIds,
				reachableNodeIds,
				exceeded: [...exceeded].sort(),
			},
		};

		findings.push({
			id: findingId,
			ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			fingerprint: {
				structural: structuralFp,
				nominal: sha(file),
				positional: sha([file, primarySpan.start, primarySpan.end].join("|")),
			},
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severity,
			evidence,
			createdAt: 0,
		});
	}

	return findings.sort(compareFindings);
}

// ── Span anchor (ADR-6) ───────────────────────────────────────────────────────

function primarySpanFor(
	fetchCalls: readonly PatternCallFact[],
	queryHooks: readonly PatternHookCallFact[],
	file: string,
): Span {
	const candidates: PatternFact[] = [...fetchCalls, ...queryHooks];

	if (candidates.length === 0) {
		return { file, start: 0, end: 0, kind: "call", astPath: "" };
	}

	const sorted = [...candidates].sort(compareFacts);
	const byStart = sorted.sort((a, b) => a.span.start - b.span.start);
	return byStart[0]!.span;
}

// ── Explain hook (ADR-7) ──────────────────────────────────────────────────────
//
// limits[] — five lines negating each forbidden category:
// 1. Library/import semantics
// 2. Execution/conflict/waterfall/performance
// 3. Intent or root cause
// 4. Remediation or migration
// 5. Cross-file or runtime co-execution

function explainDataFetchingSurfaceDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== DATA_FETCHING_SURFACE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence;
	const file = evidence.subject.file;

	// Observed name families from topology/metrics
	const exceeded = evidence.topology.exceeded;
	const fetchCalleesObserved = evidence.metrics.fetchCalleesObserved ?? 0;
	const queryHooksObserved = evidence.metrics.queryHooksObserved ?? 0;

	const summary =
		`${file} has observed co-presence of ${fetchCalleesObserved === 1 ? "a fetch-callee call surface" : `${fetchCalleesObserved} fetch-callee call surfaces`} and ${queryHooksObserved === 1 ? "a query-hook call surface" : `${queryHooksObserved} query-hook call surfaces`} in the same file.`;

	const whyItMatters =
		"This is worth checking because the observed fetch-family call names and query-hook names appear together in the same file, which can make the file's data-loading call surface harder to review consistently.";

	const inspectFirst = [
		`${file}`,
		`fetch-callee calls observed: ${evidence.metrics.fetchCalls ?? 0}`,
		`query-hook calls observed: ${evidence.metrics.queryHookCalls ?? 0}`,
		`fetch callee name surfaces: ${fetchCalleesObserved}`,
		`query hook name surfaces: ${queryHooksObserved}`,
		`surface divergence signals observed: ${evidence.metrics.surfaceDivergences ?? exceeded.length}`,
	];

	const groundingFields = Object.keys(evidence).sort();

	return {
		summary,
		whyItMatters,
		inspectFirst,
		limits: [
			"This is a syntax-surface observation only; it does not establish which library these call names belong to, import origins, or library identity.",
			"RAI does not claim these calls execute together, conflict, or produce sequential request chains; observed call names are compared in current source only.",
			"RAI makes no claim about intent, root cause, or why these call surfaces appear together.",
			"This observation does not prescribe remediation or migration; no code change is required or implied.",
			"Analysis is file-scoped only; no cross-file co-presence or runtime co-execution is claimed.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

// ── Helpers (mirrored from P11-S6 convention) ─────────────────────────────────

function severityFor(divergenceCount: number): Severity {
	return divergenceCount > 1 ? "warn" : "info";
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

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
