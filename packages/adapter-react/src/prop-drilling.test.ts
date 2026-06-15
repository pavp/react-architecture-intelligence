import { describe, expect, test } from "vitest";
import {
	DEFAULT_CONFIG,
	type AdapterMetricEvidence,
	type AnalysisContext,
	type AnalyzerResult,
	type ComponentNode,
	type Finding,
	type GraphEdge,
	type PatternFact,
	type Span,
} from "@rai/core";
import {
	PROP_DRILLING_RULE_ID,
	createPropDrillingAnalyzer,
} from "./prop-drilling.js";

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeComponent(
	overrides: Partial<ComponentNode> & Pick<ComponentNode, "id" | "name">,
): ComponentNode {
	const file = overrides.file ?? `src/${overrides.name}.tsx`;
	return {
		id: overrides.id,
		name: overrides.name,
		span: overrides.span ?? makeSpan(file, "component", 0, 100),
		kind: overrides.kind ?? "fn",
		file,
		exportKind: overrides.exportKind ?? "named",
		propNames: overrides.propNames ?? [],
		hookCalls: overrides.hookCalls ?? [],
		childComponents: overrides.childComponents ?? [],
		compositionMarkers: overrides.compositionMarkers ?? [],
		conditionalBranches: overrides.conditionalBranches ?? 0,
	};
}

function makeSpan(file: string, kind: string, start: number, end: number): Span {
	return { file, kind, start, end, astPath: `${file}:${kind}:${start}:${end}` };
}

function makePassesEdge(srcId: string, dstId: string, propNames: string[]): GraphEdge {
	return { srcId, dstId, kind: "passes", propNames };
}

interface GraphInput {
	components: readonly ComponentNode[];
	edges?: readonly GraphEdge[];
	patternFacts?: readonly PatternFact[];
}

function makeContext(
	input: GraphInput,
	runId = "run-prop-drilling",
): AnalysisContext {
	return {
		graph: {
			components: [...input.components],
			hooks: [],
			modules: [],
			edges: [...(input.edges ?? [])],
			patternFacts: [...(input.patternFacts ?? [])],
		},
		memory: {} as never,
		config: DEFAULT_CONFIG,
		types: { typeOf: () => null },
		runId,
		commitSha: "sha-prop-drilling",
		analysisVersion: 1,
		embeddingModelVersion: "test",
		boundaryRules: [],
	} satisfies AnalysisContext;
}

function runGraph(input: GraphInput, runId = "run-prop-drilling"): Finding[] {
	const analyzer = createPropDrillingAnalyzer();
	const result: AnalyzerResult = analyzer.analyze(makeContext(input, runId));
	return Array.isArray(result) ? result : result.findings;
}

function adapterEvidence(finding: Finding): AdapterMetricEvidence {
	expect(finding.evidence.kind).toBe("adapter-metric");
	return finding.evidence as AdapterMetricEvidence;
}

function normalize(findings: Finding[]): Finding[] {
	return findings.map((f) => ({ ...f, id: "<run-specific>", producingRunId: "<run-specific>" }));
}

function rolesSorted(evidence: AdapterMetricEvidence) {
	return [...evidence.roles].sort(
		(a, b) =>
			a.role.localeCompare(b.role) ||
			a.variant.localeCompare(b.variant) ||
			a.file.localeCompare(b.file),
	);
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("prop-drilling analyzer", () => {

	// G1 — silent scenarios
	describe("G1: silent — no finding emitted", () => {
		test("no edges at all", () => {
			expect(
				runGraph({
					components: [makeComponent({ id: "a", name: "A", propNames: ["theme"] })],
				}),
			).toEqual([]);
		});

		test("inbound passes edge but no outbound — no finding", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			expect(
				runGraph({
					components: [A, B],
					edges: [makePassesEdge("a", "b", ["theme"])],
				}),
			).toEqual([]);
		});

		test("outbound passes edge but no inbound — no finding", () => {
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			const C = makeComponent({ id: "c", name: "C" });
			expect(
				runGraph({
					components: [B, C],
					edges: [makePassesEdge("b", "c", ["theme"])],
				}),
			).toEqual([]);
		});

		test("prop in edges but NOT in B.propNames — no finding", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: [] }); // no theme
			const C = makeComponent({ id: "c", name: "C" });
			expect(
				runGraph({
					components: [A, B, C],
					edges: [
						makePassesEdge("a", "b", ["theme"]),
						makePassesEdge("b", "c", ["theme"]),
					],
				}),
			).toEqual([]);
		});

		test("only excluded (common) props drilled — no finding", () => {
			// className and style are in COMMON_PROP_NAMES
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["className", "style"] });
			const C = makeComponent({ id: "c", name: "C" });
			expect(
				runGraph({
					components: [A, B, C],
					edges: [
						makePassesEdge("a", "b", ["className", "style"]),
						makePassesEdge("b", "c", ["className", "style"]),
					],
				}),
			).toEqual([]);
		});
	});

	// G2 — single drilled prop → info
	describe("G2: single drilled prop — info severity", () => {
		test("A→B(theme)→C emits one info finding with drilled-prop role", () => {
			const A = makeComponent({ id: "a", name: "A", file: "src/A.tsx" });
			const B = makeComponent({ id: "b", name: "B", file: "src/B.tsx", propNames: ["theme"] });
			const C = makeComponent({ id: "c", name: "C", file: "src/C.tsx" });

			const findings = runGraph({
				components: [A, B, C],
				edges: [
					makePassesEdge("a", "b", ["theme"]),
					makePassesEdge("b", "c", ["theme"]),
				],
			});

			expect(findings).toHaveLength(1);
			const [finding] = findings;
			expect(finding).toMatchObject({
				ruleId: PROP_DRILLING_RULE_ID,
				type: "opportunity",
				severityRaw: "info",
				fingerprint: {
					structural: expect.stringMatching(/^[a-f0-9]{64}$/),
					nominal: expect.stringMatching(/^[a-f0-9]{64}$/),
					positional: expect.stringMatching(/^[a-f0-9]{64}$/),
				},
			});

			const ev = adapterEvidence(finding!);
			expect(ev.kind).toBe("adapter-metric");
			expect(ev.adapterId).toBe("react");
			expect(ev.ruleId).toBe(PROP_DRILLING_RULE_ID);
			expect(ev.subject.id).toBe("react:prop-drilling:b");
			expect(ev.subject.name).toBe("B");
			expect(ev.subject.file).toBe("src/B.tsx");
			expect(ev.metrics.drilledProps).toBe(1);
			expect(ev.metrics.upstreamSources).toBe(1);
			expect(ev.metrics.downstreamTargets).toBe(1);

			const drilledRoles = ev.roles.filter((r) => r.role === "drilled-prop");
			expect(drilledRoles).toHaveLength(1);
			expect(drilledRoles[0]!.variant).toBe("theme");

			const upstreamRoles = ev.roles.filter((r) => r.role === "upstream-source");
			expect(upstreamRoles).toHaveLength(1);
			expect(upstreamRoles[0]!.variant).toBe("A");

			const downstreamRoles = ev.roles.filter((r) => r.role === "downstream-target");
			expect(downstreamRoles).toHaveLength(1);
			expect(downstreamRoles[0]!.variant).toBe("C");
		});
	});

	// G3 — multiple drilled props → warn
	describe("G3: multiple drilled props — warn severity", () => {
		test("2 drilled props → warn, metrics.drilledProps=2", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme", "locale"] });
			const C = makeComponent({ id: "c", name: "C" });

			const findings = runGraph({
				components: [A, B, C],
				edges: [
					makePassesEdge("a", "b", ["theme", "locale"]),
					makePassesEdge("b", "c", ["theme", "locale"]),
				],
			});

			expect(findings).toHaveLength(1);
			const ev = adapterEvidence(findings[0]!);
			expect(findings[0]!.severityRaw).toBe("warn");
			expect(ev.metrics.drilledProps).toBe(2);

			const drilledProps = ev.roles
				.filter((r) => r.role === "drilled-prop")
				.map((r) => r.variant)
				.sort();
			expect(drilledProps).toEqual(["locale", "theme"]);
		});
	});

	// G4 — common-name guard
	describe("G4: common-name exclusion guard", () => {
		test("all-excluded props (className, onChange, value, style) → no finding", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({
				id: "b", name: "B",
				propNames: ["className", "onChange", "value", "style"],
			});
			const C = makeComponent({ id: "c", name: "C" });
			expect(
				runGraph({
					components: [A, B, C],
					edges: [
						makePassesEdge("a", "b", ["className", "onChange", "value", "style"]),
						makePassesEdge("b", "c", ["className", "onChange", "value", "style"]),
					],
				}),
			).toEqual([]);
		});

		test("mixed excluded + domain props → fires only for domain prop", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({
				id: "b", name: "B",
				propNames: ["className", "theme"],
			});
			const C = makeComponent({ id: "c", name: "C" });

			const findings = runGraph({
				components: [A, B, C],
				edges: [
					makePassesEdge("a", "b", ["className", "theme"]),
					makePassesEdge("b", "c", ["className", "theme"]),
				],
			});

			expect(findings).toHaveLength(1);
			const ev = adapterEvidence(findings[0]!);
			const drilledProps = ev.roles.filter((r) => r.role === "drilled-prop").map((r) => r.variant);
			expect(drilledProps).toEqual(["theme"]);
			expect(drilledProps).not.toContain("className");
		});
	});

	// G5 — multiple endpoints
	describe("G5: multiple upstream/downstream endpoints", () => {
		test("A1,A2→B→C1,C2 same prop → ONE finding, multiple upstream/downstream roles", () => {
			const A1 = makeComponent({ id: "a1", name: "A1", file: "src/A1.tsx" });
			const A2 = makeComponent({ id: "a2", name: "A2", file: "src/A2.tsx" });
			const B = makeComponent({ id: "b", name: "B", file: "src/B.tsx", propNames: ["theme"] });
			const C1 = makeComponent({ id: "c1", name: "C1", file: "src/C1.tsx" });
			const C2 = makeComponent({ id: "c2", name: "C2", file: "src/C2.tsx" });

			const findings = runGraph({
				components: [A1, A2, B, C1, C2],
				edges: [
					makePassesEdge("a1", "b", ["theme"]),
					makePassesEdge("a2", "b", ["theme"]),
					makePassesEdge("b", "c1", ["theme"]),
					makePassesEdge("b", "c2", ["theme"]),
				],
			});

			expect(findings).toHaveLength(1);
			const ev = adapterEvidence(findings[0]!);

			const drilledRoles = ev.roles.filter((r) => r.role === "drilled-prop");
			expect(drilledRoles).toHaveLength(1);
			expect(drilledRoles[0]!.variant).toBe("theme");

			const upstreamNames = ev.roles
				.filter((r) => r.role === "upstream-source")
				.map((r) => r.variant)
				.sort();
			expect(upstreamNames).toEqual(["A1", "A2"]);

			const downstreamNames = ev.roles
				.filter((r) => r.role === "downstream-target")
				.map((r) => r.variant)
				.sort();
			expect(downstreamNames).toEqual(["C1", "C2"]);

			expect(ev.metrics.upstreamSources).toBe(2);
			expect(ev.metrics.downstreamTargets).toBe(2);
		});
	});

	// G6 — determinism
	describe("G6: determinism — reversed edge input order", () => {
		test("reversed edges produce identical findings and sorted roles", () => {
			const A1 = makeComponent({ id: "a1", name: "A1", file: "src/A1.tsx" });
			const A2 = makeComponent({ id: "a2", name: "A2", file: "src/A2.tsx" });
			const B = makeComponent({ id: "b", name: "B", file: "src/B.tsx", propNames: ["theme", "locale"] });
			const C1 = makeComponent({ id: "c1", name: "C1", file: "src/C1.tsx" });
			const C2 = makeComponent({ id: "c2", name: "C2", file: "src/C2.tsx" });

			const edges: GraphEdge[] = [
				makePassesEdge("a1", "b", ["theme", "locale"]),
				makePassesEdge("a2", "b", ["theme", "locale"]),
				makePassesEdge("b", "c1", ["theme", "locale"]),
				makePassesEdge("b", "c2", ["theme", "locale"]),
			];
			const components = [A1, A2, B, C1, C2];

			const first = normalize(runGraph({ components, edges }));
			const second = normalize(
				runGraph({
					components: [...components].reverse(),
					edges: [...edges].reverse(),
				}),
			);

			expect(first).toEqual(second);
			// Roles must be sorted
			const ev = adapterEvidence(first[0]!);
			const sorted = rolesSorted(ev);
			expect(ev.roles).toEqual(sorted);
		});
	});

	// G7 — non-overlap: renders edges must not trigger
	describe("G7: non-overlap — renders edges only", () => {
		test("graph with only 'renders' edges → no finding", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			const C = makeComponent({ id: "c", name: "C" });
			expect(
				runGraph({
					components: [A, B, C],
					edges: [
						{ srcId: "a", dstId: "b", kind: "renders" },
						{ srcId: "b", dstId: "c", kind: "renders" },
					],
				}),
			).toEqual([]);
		});
	});

	// G9 — self-edge guard
	describe("G9: self-edge — passes B→B must never produce a finding", () => {
		test("single passes self-edge B→B with domain prop in B.propNames → ZERO findings", () => {
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			expect(
				runGraph({
					components: [B],
					edges: [makePassesEdge("b", "b", ["theme"])],
				}),
			).toEqual([]);
		});
	});

	// G8 — explain hook
	describe("G8: explain hook", () => {
		test("explain returns limits, whyItMatters, inspectFirst for prop-drilling finding", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			const C = makeComponent({ id: "c", name: "C" });

			const findings = runGraph({
				components: [A, B, C],
				edges: [
					makePassesEdge("a", "b", ["theme"]),
					makePassesEdge("b", "c", ["theme"]),
				],
			});

			expect(findings).toHaveLength(1);
			const analyzer = createPropDrillingAnalyzer();
			const finding = findings[0]!;
			const presented = {
				...finding,
				severity: finding.severityRaw,
				status: "active" as const,
				weight: null,
			};
			const explanation = analyzer.explain!(presented);

			expect(explanation).not.toBeNull();
			expect(explanation!.limits.length).toBeGreaterThanOrEqual(3);
			expect(explanation!.whyItMatters).toBeTruthy();
			expect(explanation!.inspectFirst.length).toBeGreaterThan(0);
		});

		test("explain returns null for different ruleId", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			const C = makeComponent({ id: "c", name: "C" });

			const findings = runGraph({
				components: [A, B, C],
				edges: [
					makePassesEdge("a", "b", ["theme"]),
					makePassesEdge("b", "c", ["theme"]),
				],
			});

			const analyzer = createPropDrillingAnalyzer();
			const finding = findings[0]!;
			const presented = {
				...finding,
				ruleId: "react/other-rule",
				severity: finding.severityRaw,
				status: "active" as const,
				weight: null,
			};
			expect(analyzer.explain!(presented)).toBeNull();
		});

		test("explain returns null when evidence kind is not adapter-metric", () => {
			const A = makeComponent({ id: "a", name: "A" });
			const B = makeComponent({ id: "b", name: "B", propNames: ["theme"] });
			const C = makeComponent({ id: "c", name: "C" });

			const findings = runGraph({
				components: [A, B, C],
				edges: [
					makePassesEdge("a", "b", ["theme"]),
					makePassesEdge("b", "c", ["theme"]),
				],
			});

			const analyzer = createPropDrillingAnalyzer();
			const finding = findings[0]!;
			const presented = {
				...finding,
				evidence: { ...finding.evidence, kind: "render-coupling" } as never,
				severity: finding.severityRaw,
				status: "active" as const,
				weight: null,
			};
			expect(analyzer.explain!(presented)).toBeNull();
		});
	});
});
