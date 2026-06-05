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
	CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
	createContextProviderValueSurfaceDriftAnalyzer,
} from "./context-provider-value-surface-drift.js";

describe("context provider value-surface drift analyzer", () => {
	test("reports bare createContext with absent default and provider missing direct value", () => {
		const findings = runFacts([
			callBinding("b1", "AuthContext", "createContext"),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 140),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
			evidence: {
				kind: "adapter-metric",
				adapterId: "react",
				ruleId: CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
				subject: { name: "AuthContext", file: "src/auth.tsx" },
				metrics: {
					contextBindings: 1,
					defaultArgumentsObserved: 0,
					providers: 1,
					providersWithDirectValue: 0,
					providersWithoutDirectValue: 1,
				},
			},
		});
		const evidence = adapterEvidence(finding!);
		expect(
			evidence.topology.exceeded.some((token) =>
				token.startsWith("noDefaultArgumentAndProviderNoDirectValue:"),
			),
		).toBe(true);
	});

	test("reports member createContext with mixed provider direct-value presence", () => {
		const findings = runFacts([
			callBinding(
				"b1",
				"ThemeContext",
				"React.createContext",
				"src/theme.tsx",
				0,
				40,
			),
			callArgument(
				"a1",
				"React.createContext",
				0,
				"null",
				"literal",
				"src/theme.tsx",
				10,
				35,
			),
			jsx("p1", "ThemeContext.Provider", "src/theme.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"ThemeContext.Provider",
				"value",
				"expression",
				"theme",
				"src/theme.tsx",
				110,
				130,
			),
			jsx("p2", "ThemeContext.Provider", "src/theme.tsx", 200, 240),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.metrics).toMatchObject({
			defaultArgumentsObserved: 1,
			providers: 2,
			providersWithDirectValue: 1,
			providersWithoutDirectValue: 1,
			directValuePresenceModes: 2,
		});
		expect(evidence.topology.exceeded).toContain(
			"mixedProviderDirectValuePresence:ThemeContext",
		);
		expect(
			evidence.roles.some(
				(role) =>
					role.role === "create-context-callee" &&
					role.variant === "member:React.createContext",
			),
		).toBe(true);
		expect(
			evidence.roles.some(
				(role) =>
					role.role === "default-argument" &&
					role.variant === "observed:literal",
			),
		).toBe(true);
	});

	test("treats provider spread attributes as ambiguity only", () => {
		const findings = runFacts([
			callBinding(
				"b1",
				"SettingsContext",
				"createContext",
				"src/settings.tsx",
				0,
				40,
			),
			callArgument(
				"a1",
				"createContext",
				0,
				"defaults",
				"identifier",
				"src/settings.tsx",
				10,
				35,
			),
			jsx("p1", "SettingsContext.Provider", "src/settings.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"SettingsContext.Provider",
				"props",
				"spread",
				"props",
				"src/settings.tsx",
				110,
				130,
			),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		const evidence = adapterEvidence(finding!);
		expect(evidence.metrics.providersWithSpread).toBe(1);
		expect(
			evidence.topology.exceeded.some((token) =>
				token.startsWith("providerSpreadAmbiguous:"),
			),
		).toBe(true);

		const analyzer = createContextProviderValueSurfaceDriftAnalyzer();
		const explanation = analyzer.explain?.(presented(finding!));
		const serialized = JSON.stringify({ finding, explanation });
		expect(serialized).not.toMatch(
			/spread (?:contains|expand|does not contain)|hidden value|runtime value is missing|runtime value is absent|\bbug\b|must refactor|intended API|root cause|user impact|historically changed|React warning/i,
		);
	});

	test("stays silent for consistent direct provider value surfaces with no default", () => {
		const findings = runFacts([
			callBinding("b1", "DataContext", "createContext", "src/data.tsx", 0, 40),
			jsx("p1", "DataContext.Provider", "src/data.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"DataContext.Provider",
				"value",
				"expression",
				"a",
				"src/data.tsx",
				110,
				130,
			),
			jsx("p2", "DataContext.Provider", "src/data.tsx", 200, 240),
			jsxAttribute(
				"at2",
				"DataContext.Provider",
				"value",
				"expression",
				"b",
				"src/data.tsx",
				210,
				230,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("stays silent for a context binding without a same-file provider", () => {
		const findings = runFacts([
			callBinding(
				"b1",
				"LonelyContext",
				"createContext",
				"src/lonely.tsx",
				0,
				40,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("does not correlate cross-file provider name matches", () => {
		const findings = runFacts([
			callBinding(
				"b1",
				"AuthContext",
				"createContext",
				"src/context.tsx",
				0,
				40,
			),
			jsx("p1", "AuthContext.Provider", "src/page.tsx", 100, 140),
		]);

		expect(findings).toEqual([]);
	});

	test("treats differing direct-value expression shapes as direct value only", () => {
		const findings = runFacts([
			callBinding(
				"b1",
				"ShapeContext",
				"createContext",
				"src/shape.tsx",
				0,
				40,
			),
			jsx("p1", "ShapeContext.Provider", "src/shape.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"ShapeContext.Provider",
				"value",
				"expression",
				"{ a: 1 }",
				"src/shape.tsx",
				110,
				130,
			),
			jsx("p2", "ShapeContext.Provider", "src/shape.tsx", 200, 250),
			jsxAttribute(
				"at2",
				"ShapeContext.Provider",
				"value",
				"literal",
				"x",
				"src/shape.tsx",
				210,
				230,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("treats a value attribute with absent value as a direct value surface", () => {
		const findings = runFacts([
			callBinding("b1", "FlagContext", "createContext", "src/flag.tsx", 0, 40),
			jsx("p1", "FlagContext.Provider", "src/flag.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"FlagContext.Provider",
				"value",
				"absent",
				"",
				"src/flag.tsx",
				110,
				130,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("suppresses duplicate same-file local binding keys", () => {
		const findings = runFacts([
			callBinding("b1", "DupContext", "createContext", "src/dup.tsx", 0, 40),
			callBinding("b2", "DupContext", "createContext", "src/dup.tsx", 50, 90),
			jsx("p1", "DupContext.Provider", "src/dup.tsx", 100, 150),
		]);

		expect(findings).toEqual([]);
	});

	test("escalates to warn when more than one divergence signal is observed", () => {
		const findings = runFacts([
			callBinding("b1", "AppContext", "createContext", "src/app.tsx", 0, 40),
			jsx("p1", "AppContext.Provider", "src/app.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"AppContext.Provider",
				"rest",
				"spread",
				"rest",
				"src/app.tsx",
				110,
				130,
			),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		// no default + missing direct value + spread ambiguity on the same provider
		expect(evidence.topology.exceeded.length).toBeGreaterThan(1);
		expect(findings[0]!.severityRaw).toBe("warn");
	});

	test("produces deterministic, sorted output regardless of fact order", () => {
		const facts = [
			jsxAttribute(
				"z-at",
				"ThemeContext.Provider",
				"value",
				"expression",
				"t",
				"src/theme.tsx",
				110,
				130,
			),
			jsx("y-p1", "ThemeContext.Provider", "src/theme.tsx", 100, 150),
			jsx("x-p2", "ThemeContext.Provider", "src/theme.tsx", 200, 240),
			callBinding(
				"b-theme",
				"ThemeContext",
				"createContext",
				"src/theme.tsx",
				0,
				40,
			),
			jsx("w-auth", "AuthContext.Provider", "src/auth.tsx", 100, 140),
			callBinding(
				"a-auth",
				"AuthContext",
				"createContext",
				"src/auth.tsx",
				0,
				40,
			),
		];

		const first = normalize(runFacts(facts, "same-run"));
		const second = normalize(runFacts([...facts].reverse(), "same-run"));

		expect(first).toEqual(second);
		expect(first).toHaveLength(2);
		expect(first.map((finding) => finding.fingerprint.structural)).toEqual(
			[...first.map((finding) => finding.fingerprint.structural)].sort(),
		);
		for (const finding of first) {
			const evidence = adapterEvidence(finding);
			expect(evidence.roles).toEqual([...evidence.roles].sort(compareRoles));
			expect(evidence.topology.directChildIds).toEqual(
				[...evidence.topology.directChildIds].sort(),
			);
			expect(evidence.topology.reachableNodeIds).toEqual(
				[...evidence.topology.reachableNodeIds].sort(),
			);
			expect(evidence.topology.exceeded).toEqual(
				[...evidence.topology.exceeded].sort(),
			);
		}
	});

	test("keeps structural identity stable across a pure span shift while positional differs", () => {
		const baseline = runFacts([
			callBinding("b1", "AuthContext", "createContext", "src/auth.tsx", 0, 40),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 140),
		]);
		// same providers/surfaces, only the absolute char offsets move
		const shifted = runFacts([
			callBinding(
				"b1",
				"AuthContext",
				"createContext",
				"src/auth.tsx",
				500,
				540,
			),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 600, 640),
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

	test("reads frozen pattern facts without mutating them", () => {
		const facts = freezeFacts([
			callBinding("b1", "AuthContext", "createContext", "src/auth.tsx", 0, 40),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 140),
		]);
		const before = JSON.stringify(facts);

		const findings = runFacts(facts);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(facts)).toBe(before);
	});

	test("includes useContext/use corroboration without changing emission", () => {
		const base = [
			callBinding("b1", "AuthContext", "createContext", "src/auth.tsx", 0, 40),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 140),
		];
		const withConsumer = runFacts([
			...base,
			hookCall("h1", "useContext", "src/auth.tsx", 300, 320),
			callArgument(
				"c1",
				"useContext",
				0,
				"AuthContext",
				"identifier",
				"src/auth.tsx",
				300,
				320,
			),
		]);
		const withoutConsumer = runFacts(base);

		expect(withConsumer).toHaveLength(1);
		expect(withoutConsumer).toHaveLength(1);
		const evidence = adapterEvidence(withConsumer[0]!);
		expect(evidence.metrics.consumerCalls).toBeGreaterThan(0);
		expect(
			evidence.roles.some((role) => role.role === "context-consumer-call"),
		).toBe(true);
		// emission decision is identical whether or not consumer evidence exists
		expect(withConsumer[0]!.fingerprint.structural).toBe(
			withoutConsumer[0]!.fingerprint.structural,
		);
	});

	test("consumer hook presence alone does not create a finding on healthy surfaces", () => {
		const findings = runFacts([
			callBinding("b1", "AuthContext", "createContext", "src/auth.tsx", 0, 40),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 150),
			jsxAttribute(
				"at1",
				"AuthContext.Provider",
				"value",
				"expression",
				"v",
				"src/auth.tsx",
				110,
				130,
			),
			hookCall("h1", "useContext", "src/auth.tsx", 300, 320),
			callArgument(
				"c1",
				"useContext",
				0,
				"AuthContext",
				"identifier",
				"src/auth.tsx",
				300,
				320,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("provides a bounded analyzer-owned explanation", () => {
		const analyzer = createContextProviderValueSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			callBinding("b1", "AuthContext", "createContext", "src/auth.tsx", 0, 40),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 140),
		]);

		const explanation = analyzer.explain?.(presented(finding!));
		expect(explanation).not.toBeNull();
		expect(explanation!.summary).toBe(
			"AuthContext has a same-file provider with no directly observed value attribute, and no createContext default argument was observed.",
		);
		expect(explanation!.inspectFirst[0]).toBe("AuthContext in src/auth.tsx");
		expect(explanation!.inspectFirst).toContain(
			"createContext default argument observed: no",
		);
		expect(explanation!.groundingFields).toEqual(
			[...explanation!.groundingFields].sort(),
		);
		expect(explanation!.glossary.length).toBe(
			explanation!.groundingFields.length,
		);
		const serialized = JSON.stringify(explanation);
		expect(serialized).not.toMatch(
			/\bbug\b|\bwrong\b|must refactor|runtime value is (?:missing|absent)|React warning|intended API|root cause|user impact|historically changed|spread (?:contains|expand|does not contain)/i,
		);
	});

	test("returns null explanation for non-matching findings", () => {
		const analyzer = createContextProviderValueSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			callBinding("b1", "AuthContext", "createContext", "src/auth.tsx", 0, 40),
			jsx("p1", "AuthContext.Provider", "src/auth.tsx", 100, 140),
		]);
		const other = presented({ ...finding!, ruleId: "react/other" });
		expect(analyzer.explain?.(other)).toBeNull();
	});
});

function runFacts(
	facts: readonly PatternFact[],
	runId = "run-context-provider-drift",
): Finding[] {
	const analyzer = createContextProviderValueSurfaceDriftAnalyzer();
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
			commitSha: "sha-context-provider-drift",
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

function freezeFacts(facts: PatternFact[]): readonly PatternFact[] {
	for (const fact of facts) {
		Object.freeze(fact.span);
		Object.freeze(fact);
	}
	return Object.freeze(facts);
}

function hookCall(
	id: string,
	name: string,
	file = "src/auth.tsx",
	start = 300,
	end = 330,
): PatternFact {
	return {
		id,
		kind: "hook-call",
		file,
		span: span(file, "hook-call", start, end),
		name,
	};
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

function callBinding(
	id: string,
	local: string,
	callee: string,
	file = "src/auth.tsx",
	start = 0,
	end = 40,
): PatternFact {
	return {
		id,
		kind: "call-binding",
		file,
		span: span(file, "call-binding", start, end),
		local,
		callee,
		declarationKind: "const",
	};
}

function callArgument(
	id: string,
	callee: string,
	argumentIndex: number,
	argument: string,
	argumentKind: "identifier" | "member" | "literal" | "call" | "unknown",
	file = "src/auth.tsx",
	start = 10,
	end = 35,
): PatternFact {
	return {
		id,
		kind: "call-argument",
		file,
		span: span(file, "call-argument", start, end),
		callee,
		argumentIndex,
		argument,
		argumentKind,
	};
}

function jsx(
	id: string,
	tag: string,
	file = "src/auth.tsx",
	start = 100,
	end = 140,
): PatternFact {
	return {
		id,
		kind: "jsx",
		file,
		span: span(file, "jsx", start, end),
		tag,
		parentTag: "",
	};
}

function jsxAttribute(
	id: string,
	tag: string,
	name: string,
	valueKind: "absent" | "literal" | "expression" | "spread" | "unknown",
	value: string,
	file = "src/auth.tsx",
	start = 110,
	end = 130,
): PatternFact {
	return {
		id,
		kind: "jsx-attribute",
		file,
		span: span(file, "jsx-attribute", start, end),
		tag,
		parentTag: "",
		name,
		value,
		valueKind,
	};
}
