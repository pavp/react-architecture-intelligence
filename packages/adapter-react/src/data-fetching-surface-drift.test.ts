import { describe, expect, test } from "vitest";
import {
	DEFAULT_CONFIG,
	type AdapterMetricEvidence,
	type AnalyzerResult,
	type Finding,
	type PatternFact,
	type PresentedFinding,
	type Span,
} from "@rai/core";
import {
	DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
	createDataFetchingSurfaceDriftAnalyzer,
} from "./data-fetching-surface-drift.js";

describe("data-fetching surface drift analyzer", () => {
	// ── T1 (E1): fetch + useQuery co-present → 1 finding info/opportunity ────

	test("T1 (E1): fetch call + useQuery hook-call in same file → 1 finding info", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/dashboard.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/dashboard.tsx", 40, 60),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
		});
		const evidence = adapterEvidence(finding!);
		expect(evidence.topology.exceeded).toContain(
			"fetchVsQueryHookDrift:src/dashboard.tsx",
		);
	});

	// ── T2 (E2): MANDATORY SIGNAL — destructured useQuery has hook-call but NO call-binding ──
	// ADR-4: `const { data } = useQuery(...)` is an ObjectPattern destructure.
	// pass1.ts (lines 157-171) does NOT emit a call-binding for destructured patterns.
	// pass1.ts (lines 189-191) DOES emit a hook-call for any hook invocation.
	// Therefore the ONLY discriminator for query-hook detection is hook-call, NOT call-binding.
	// If this test fails, the entire primary use-case is silently broken.

	test("T2 (E2): destructured `const { data } = useQuery()` — hook-call only, NO call-binding → still detected (ADR-4)", () => {
		// Provide ONLY a hook-call (no call-binding) to simulate destructured useQuery
		const findings = runFacts([
			callFact("c1", "fetch", "src/users.tsx", 10, 30),
			// This hook-call is the ONLY signal for useQuery — no call-binding
			hookCall("h1", "useQuery", "src/users.tsx", 50, 70),
		]);

		expect(findings).toHaveLength(1);
		expect(findings[0]!.ruleId).toBe(DATA_FETCHING_SURFACE_DRIFT_RULE_ID);
		expect(findings[0]!.severityRaw).toBe("info");
	});

	// ── T3: fetch-only → [] ──────────────────────────────────────────────────

	test("T3 (E3): fetch call only — no query hook → silent", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/api.tsx", 10, 30),
		]);
		expect(findings).toEqual([]);
	});

	// ── T4: query-hook-only → [] ─────────────────────────────────────────────

	test("T4 (E4): useQuery hook-call only — no fetch call → silent", () => {
		const findings = runFacts([
			hookCall("h1", "useQuery", "src/api.tsx", 10, 30),
		]);
		expect(findings).toEqual([]);
	});

	// ── T5 (E5): fetch + useEffect + useState → [] ──────────────────────────

	test("T5 (E5): fetch + useEffect + useState — useEffect/useState not in QUERY_HOOK_NAMES → silent", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/effect.tsx", 10, 30),
			hookCall("h1", "useEffect", "src/effect.tsx", 40, 60),
			hookCall("h2", "useState", "src/effect.tsx", 70, 90),
		]);
		expect(findings).toEqual([]);
	});

	// ── T6 (E6): axios.get + useQuery → [] (axios.get not in FETCH_CALLEES) ─

	test("T6 (E6): axios.get call + useQuery hook-call — axios.get not in FETCH_CALLEES → silent", () => {
		const findings = runFacts([
			callFact("c1", "axios.get", "src/axios.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/axios.tsx", 40, 60),
		]);
		expect(findings).toEqual([]);
	});

	// ── T7 (E7): duplicate fetch + useQuery → 1 finding, fetchCalleesObserved===1 ──

	test("T7 (E7): duplicate fetch calls + single useQuery → 1 finding, fetchCalleesObserved===1", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/dup.tsx", 10, 30),
			callFact("c2", "fetch", "src/dup.tsx", 40, 60),
			hookCall("h1", "useQuery", "src/dup.tsx", 70, 90),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.metrics.fetchCalleesObserved).toBe(1);
	});

	// ── T8 (E8): fetch + useQuery + useMutation → 1 finding, count===1, queryHooksObserved===2 ──

	test("T8 (E8): fetch + useQuery + useMutation → 1 finding, surfaceDivergences===1, queryHooksObserved===2", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/multi.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/multi.tsx", 40, 60),
			hookCall("h2", "useMutation", "src/multi.tsx", 70, 90),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.metrics.surfaceDivergences).toBe(1);
		expect(evidence.metrics.queryHooksObserved).toBe(2);
	});

	// ── T9 (E9): window.fetch / globalThis.fetch qualify ─────────────────────

	test("T9 (E9): window.fetch qualifies as a fetch callee → 1 finding", () => {
		const findings = runFacts([
			callFact("c1", "window.fetch", "src/wfetch.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/wfetch.tsx", 40, 60),
		]);
		expect(findings).toHaveLength(1);
	});

	test("T9b: globalThis.fetch qualifies as a fetch callee → 1 finding", () => {
		const findings = runFacts([
			callFact("c1", "globalThis.fetch", "src/gfetch.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/gfetch.tsx", 40, 60),
		]);
		expect(findings).toHaveLength(1);
	});

	// ── T10 (E10): cross-file isolation — fetch in a.tsx, useQuery in b.tsx → [] ──

	test("T10 (E10): fetch in a.tsx + useQuery in b.tsx — per-file isolation → silent", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/a.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/b.tsx", 10, 30),
		]);
		expect(findings).toEqual([]);
	});

	// ── T11 (E11): forward vs reversed order → normalize equal, len 1 ───────

	test("T11 (E11): forward vs reversed fact order → identical findings (determinism)", () => {
		const facts = [
			callFact("c1", "fetch", "src/det.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/det.tsx", 40, 60),
		];

		const first = normalize(runFacts(facts, "run-det"));
		const second = normalize(runFacts([...facts].reverse(), "run-det"));

		expect(first).toEqual(second);
		expect(first).toHaveLength(1);
	});

	// ── T12 (E12): span-shift → structural FP equal, positional differs ──────

	test("T12 (E12): pure span shift — structural fingerprint stable, positional differs", () => {
		const baseline = runFacts([
			callFact("c1", "fetch", "src/shift.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/shift.tsx", 40, 60),
		]);
		const shifted = runFacts([
			callFact("c1", "fetch", "src/shift.tsx", 510, 530),
			hookCall("h1", "useQuery", "src/shift.tsx", 540, 560),
		]);

		expect(baseline).toHaveLength(1);
		expect(shifted).toHaveLength(1);
		expect(baseline[0]!.fingerprint.structural).toBe(
			shifted[0]!.fingerprint.structural,
		);
		expect(baseline[0]!.fingerprint.positional).not.toBe(
			shifted[0]!.fingerprint.positional,
		);
	});

	// ── T13 (E13): frozen facts → JSON unchanged + 1 finding ─────────────────

	test("T13 (E13): reads frozen pattern facts without mutating them", () => {
		const facts = freezeFacts([
			callFact("c1", "fetch", "src/frozen.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/frozen.tsx", 40, 60),
		]);
		const before = JSON.stringify(facts);

		const findings = runFacts(facts);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(facts)).toBe(before);
	});

	// ── T14 (E14): explain bounded vocabulary ────────────────────────────────

	test("T14 (E14): explain output is bounded — forbidden vocab absent", () => {
		const analyzer = createDataFetchingSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			callFact("c1", "fetch", "src/explain.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/explain.tsx", 40, 60),
		]);

		const explanation = analyzer.explain?.(presented(finding!));
		expect(explanation).not.toBeNull();
		expect(typeof explanation!.summary).toBe("string");
		expect(explanation!.summary.length).toBeGreaterThan(0);
		expect(explanation!.groundingFields).toEqual(
			[...explanation!.groundingFields].sort(),
		);
		expect(explanation!.glossary.length).toBe(
			explanation!.groundingFields.length,
		);

		const serialized = JSON.stringify(explanation);
		// ADR-7 forbidden vocabulary: no runtime behavior, waterfall, two libraries, perf,
		// conflict, bug, intent, remediation, import semantics
		expect(serialized).not.toMatch(
			/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|waterfall|two (?:data-fetching )?libraries|runtime behavior|performance|you should/i,
		);
	});

	// ── T15 (E14): explain returns null for non-matching ruleId ──────────────

	test("T15 (E14): explain returns null for non-matching ruleId", () => {
		const analyzer = createDataFetchingSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			callFact("c1", "fetch", "src/null-explain.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/null-explain.tsx", 40, 60),
		]);
		const other = presented({ ...finding!, ruleId: "react/other" });
		expect(analyzer.explain?.(other)).toBeNull();
	});

	// ── Additional coverage: all QUERY_HOOK_NAMES members qualify ─────────────

	test("useSWR hook-call + fetch → 1 finding", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/swr.tsx", 10, 30),
			hookCall("h1", "useSWR", "src/swr.tsx", 40, 60),
		]);
		expect(findings).toHaveLength(1);
	});

	test("useMutation hook-call alone → silent", () => {
		const findings = runFacts([
			hookCall("h1", "useMutation", "src/mut.tsx", 10, 30),
		]);
		expect(findings).toEqual([]);
	});

	test("subject id is react:data-fetching-surface:<file>", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/sub.tsx", 10, 30),
			hookCall("h1", "useQuery", "src/sub.tsx", 40, 60),
		]);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.subject.id).toBe("react:data-fetching-surface:src/sub.tsx");
	});

	test("metrics.fetchCalls counts raw call facts; metrics.queryHookCalls counts hook-call facts", () => {
		const findings = runFacts([
			callFact("c1", "fetch", "src/counts.tsx", 10, 30),
			callFact("c2", "fetch", "src/counts.tsx", 35, 55),
			hookCall("h1", "useQuery", "src/counts.tsx", 60, 80),
			hookCall("h2", "useSWR", "src/counts.tsx", 85, 105),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.metrics.fetchCalls).toBe(2);
		expect(evidence.metrics.queryHookCalls).toBe(2);
		expect(evidence.metrics.fetchCalleesObserved).toBe(1);
		expect(evidence.metrics.queryHooksObserved).toBe(2);
	});
});

// ── Test harness ──────────────────────────────────────────────────────────────

function runFacts(
	facts: readonly PatternFact[],
	runId = "run-data-fetching-drift",
): Finding[] {
	const analyzer = createDataFetchingSurfaceDriftAnalyzer();
	return normalizeResult(
		analyzer.analyze({
			graph: {
				components: [],
				hooks: [],
				modules: [],
				edges: [],
				patternFacts: facts as PatternFact[],
			},
			memory: {} as never,
			config: DEFAULT_CONFIG,
			types: { typeOf: () => null },
			runId,
			commitSha: "sha-data-fetching-drift",
			analysisVersion: 1,
			embeddingModelVersion: "test",
			boundaryRules: [],
		}),
	);
}

function normalizeResult(result: AnalyzerResult): Finding[] {
	return Array.isArray(result) ? result : result.findings;
}

function adapterEvidence(finding: Finding): AdapterMetricEvidence {
	expect(finding.evidence.kind).toBe("adapter-metric");
	return finding.evidence as AdapterMetricEvidence;
}

function normalize(findings: Finding[]): Finding[] {
	return findings.map((finding) => ({
		...finding,
		id: "<run-specific>",
		producingRunId: "<run-specific>",
	}));
}

function freezeFacts(facts: PatternFact[]): readonly PatternFact[] {
	for (const fact of facts) {
		Object.freeze(fact.span);
		Object.freeze(fact);
	}
	return Object.freeze(facts);
}

function presented(finding: Finding): PresentedFinding {
	return {
		...finding,
		severity: finding.severityRaw,
		status: "active",
		weight: null,
	};
}

function span(file: string, kind: string, start: number, end: number): Span {
	return { file, start, end, kind, astPath: `${file}:${kind}:${start}:${end}` };
}

// ── NEW builders for call/hook-call facts (ADR-8) ─────────────────────────────

function callFact(
	id: string,
	callee: string,
	file = "src/component.tsx",
	start = 10,
	end = 30,
): PatternFact {
	return {
		id,
		kind: "call",
		file,
		span: span(file, "call", start, end),
		callee,
	};
}

function hookCall(
	id: string,
	name: string,
	file = "src/component.tsx",
	start = 40,
	end = 60,
): PatternFact {
	return {
		id,
		kind: "hook-call",
		file,
		span: span(file, "hook-call", start, end),
		name,
	};
}
