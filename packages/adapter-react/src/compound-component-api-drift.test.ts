import { describe, expect, test } from "vitest";
import {
	DEFAULT_CONFIG,
	type AdapterMetricEvidence,
	type AnalyzerResult,
	type Finding,
	type PatternFact,
	type Span,
} from "@rai/core";
import {
	COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
	createCompoundComponentApiDriftAnalyzer,
} from "./compound-component-api-drift.js";

describe("compound component API drift analyzer", () => {
	test("emits no finding for healthy compound declarations and usages", () => {
		const findings = runFacts([
			assignment("a1", "Modal", "Trigger"),
			assignment("a2", "Modal", "Content"),
			jsx("u1", "Modal.Trigger"),
			jsx("u2", "Modal.Content"),
		]);

		expect(findings).toEqual([]);
	});

	test("reports JSX-used parts without observed static member declarations", () => {
		const findings = runFacts([
			assignment("a1", "Modal", "Trigger"),
			jsx("u1", "Modal.Trigger"),
			jsx("u2", "Modal.Footer", "src/ModalExample.tsx", 20, 34),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
			evidence: {
				kind: "adapter-metric",
				adapterId: "react",
				ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
				subject: {
					name: "Modal",
					file: "src/ModalExample.tsx",
					span: { start: 20, end: 34 },
				},
				metrics: {
					declaredParts: 1,
					usedParts: 2,
					missingDeclarations: 1,
					unusedDeclarations: 0,
				},
				thresholds: { maxMissingDeclarations: 0 },
				topology: { exceeded: ["missingDeclarations:Footer"] },
			},
		});
	});

	test("does not infer a compound root from dot-member JSX alone", () => {
		const findings = runFacts([jsx("u1", "Modal.Footer")]);

		expect(findings).toEqual([]);
	});

	test("does not emit unused-only declaration findings in S1", () => {
		const findings = runFacts([
			assignment("a1", "Modal", "Trigger"),
			assignment("a2", "Modal", "Footer"),
			jsx("u1", "Modal.Trigger"),
		]);

		expect(findings).toEqual([]);
	});

	test("keeps roots, findings, fingerprints, and evidence deterministically sorted", () => {
		const facts = [
			jsx("z-use", "Tabs.List", "src/TabsUse.tsx"),
			jsx("y-missing", "Tabs.Content", "src/TabsUse.tsx"),
			assignment("x-declare", "Tabs", "List", "src/Tabs.tsx"),
			jsx("c-use", "Modal.Trigger", "src/ModalUse.tsx"),
			jsx("b-missing", "Modal.Footer", "src/ModalUse.tsx"),
			assignment("a-declare", "Modal", "Trigger", "src/Modal.tsx"),
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

	test("grounds evidence in observed files and avoids unproved claims", () => {
		const [finding] = runFacts([
			assignment("a1", "Modal", "Trigger", "src/Modal.tsx", 1, 8),
			jsx("u1", "Modal.Trigger", "src/ModalExample.tsx", 10, 25),
			jsx("u2", "Modal.Footer", "src/ModalExample.tsx", 30, 44),
		]);

		const evidence = adapterEvidence(finding!);
		expect(evidence.subject.span).toMatchObject({
			file: "src/ModalExample.tsx",
			start: 30,
			end: 44,
		});
		expect(evidence.roles).toEqual(
			expect.arrayContaining([
				{ role: "declared-part", variant: "Trigger", file: "src/Modal.tsx" },
				{ role: "used-part", variant: "Footer", file: "src/ModalExample.tsx" },
				{
					role: "missing-declaration",
					variant: "Footer",
					file: "src/ModalExample.tsx",
				},
			]),
		);
		const serialized = JSON.stringify(finding);
		expect(serialized).not.toMatch(
			/team intent|symbol resolved|historical|dead code|remediation|required change/i,
		);
	});

	test("reads frozen pattern facts without mutating them", () => {
		const facts = freezeFacts([
			assignment("a1", "Modal", "Trigger"),
			jsx("u1", "Modal.Trigger"),
			jsx("u2", "Modal.Footer"),
		]);
		const before = JSON.stringify(facts);

		const findings = runFacts(facts);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(facts)).toBe(before);
	});
});

function runFacts(
	facts: readonly PatternFact[],
	runId = "run-react-drift",
): Finding[] {
	const analyzer = createCompoundComponentApiDriftAnalyzer();
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
			commitSha: "sha-react-drift",
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

function assignment(
	id: string,
	object: string,
	property: string,
	file = "src/Modal.tsx",
	start = 0,
	end = 10,
): PatternFact {
	return {
		id,
		kind: "member-assignment",
		file,
		span: span(file, "member-assignment", start, end),
		object,
		property,
		value: property,
	};
}

function jsx(
	id: string,
	tag: string,
	file = "src/ModalExample.tsx",
	start = 10,
	end = 20,
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

function span(file: string, kind: string, start: number, end: number): Span {
	return { file, start, end, kind, astPath: `${file}:${kind}:${start}:${end}` };
}

function freezeFacts(facts: PatternFact[]): readonly PatternFact[] {
	for (const fact of facts) {
		Object.freeze(fact.span);
		Object.freeze(fact);
	}
	return Object.freeze(facts);
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
