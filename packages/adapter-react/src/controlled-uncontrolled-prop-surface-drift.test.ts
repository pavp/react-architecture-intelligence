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
	CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
	createControlledUncontrolledPropSurfaceDriftAnalyzer,
} from "./controlled-uncontrolled-prop-surface-drift.js";

describe("controlled/uncontrolled prop-surface drift analyzer", () => {
	test("keeps single-prop and support-only surfaces silent", () => {
		for (const props of [
			["value"],
			["defaultValue"],
			["onChange", "onValueChange"],
			["label", "onOpenChange"],
		]) {
			expect(
				runGraph({
					components: [
						component({ id: props.join("-"), name: "Input", propNames: props }),
					],
				}),
			).toEqual([]);
		}

		expect(
			runGraph({
				components: [
					component({
						id: "state-only",
						name: "Input",
						hookCalls: ["useState"],
					}),
				],
			}),
		).toEqual([]);
	});

	test.each([
		["value", "defaultValue"],
		["checked", "defaultChecked"],
		["open", "defaultOpen"],
	] as const)("reports the approved %s/%s prop pair", (controlled, uncontrolled) => {
		const findings = runGraph({
			components: [
				component({
					id: `c-${controlled}`,
					name: "Input",
					file: "src/Input.tsx",
					propNames: [controlled, uncontrolled],
					span: span("src/Input.tsx", "component", 5, 95),
				}),
			],
		});

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
			fingerprint: {
				structural: expect.stringMatching(/^[a-f0-9]{64}$/),
				nominal: expect.stringMatching(/^[a-f0-9]{64}$/),
				positional: expect.stringMatching(/^[a-f0-9]{64}$/),
			},
		});
		const evidence = adapterEvidence(finding!);
		expect(evidence).toMatchObject({
			kind: "adapter-metric",
			adapterId: "react",
			ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
			subject: {
				id: `react:controlled-uncontrolled:c-${controlled}`,
				name: "Input",
				file: "src/Input.tsx",
				span: {
					file: "src/Input.tsx",
					start: 5,
					end: 95,
					kind: "component",
				},
			},
			metrics: {
				mixedPropPairs: 1,
				controlledProps: 1,
				uncontrolledProps: 1,
				handlerProps: 0,
				stateHookCalls: 0,
				propCount: 2,
			},
			thresholds: { maxMixedPropPairs: 0 },
			topology: {
				directChildIds: [],
				reachableNodeIds: [],
				exceeded: [`controlledUncontrolledPair:${controlled}/${uncontrolled}`],
			},
		});
		expect(evidence.roles).toEqual(
			expect.arrayContaining([
				{ role: "controlled-prop", variant: controlled, file: "src/Input.tsx" },
				{
					role: "uncontrolled-prop",
					variant: uncontrolled,
					file: "src/Input.tsx",
				},
				{
					role: "controlled-uncontrolled-pair",
					variant: `${controlled}/${uncontrolled}`,
					file: "src/Input.tsx",
				},
			]),
		);
	});

	test("records support evidence only after an approved mixed pair is present", () => {
		const [finding] = runGraph({
			components: [
				component({
					id: "c-input",
					name: "Input",
					propNames: ["onChange", "defaultValue", "value"],
					hookCalls: ["useState", "useMemo", "useReducer"],
				}),
			],
		});

		const evidence = adapterEvidence(finding!);
		expect(evidence.roles).toEqual(
			expect.arrayContaining([
				{
					role: "change-handler-prop",
					variant: "onChange",
					file: "src/Input.tsx",
				},
				{ role: "state-hook", variant: "useReducer", file: "src/Input.tsx" },
				{ role: "state-hook", variant: "useState", file: "src/Input.tsx" },
			]),
		);
		expect(evidence.roles).not.toEqual(
			expect.arrayContaining([
				{ role: "state-hook", variant: "useMemo", file: "src/Input.tsx" },
			]),
		);
		expect(evidence.metrics).toMatchObject({
			handlerProps: 1,
			stateHookCalls: 2,
		});
	});

	test("escalates multiple mixed pairs to warn with deterministic evidence order", () => {
		const [finding] = runGraph({
			components: [
				component({
					id: "c-menu",
					name: "MenuButton",
					propNames: [
						"defaultOpen",
						"open",
						"defaultChecked",
						"checked",
						"onOpenChange",
						"onCheckedChange",
					],
				}),
			],
		});

		expect(finding).toMatchObject({ severityRaw: "warn" });
		const evidence = adapterEvidence(finding!);
		expect(evidence.metrics).toMatchObject({
			mixedPropPairs: 2,
			controlledProps: 2,
			uncontrolledProps: 2,
			handlerProps: 2,
			propCount: 6,
		});
		expect(evidence.topology.exceeded).toEqual([
			"controlledUncontrolledPair:checked/defaultChecked",
			"controlledUncontrolledPair:open/defaultOpen",
		]);
		expect(evidence.roles).toEqual([...evidence.roles].sort(compareRoles));
	});

	test("keeps findings and evidence deterministic for reversed graph input", () => {
		const components = [
			component({
				id: "b-input",
				name: "BillingInput",
				file: "src/BillingInput.tsx",
				propNames: ["defaultValue", "value", "onChange"],
				hookCalls: ["useReducer", "useState"],
			}),
			component({
				id: "a-switch",
				name: "AccountSwitch",
				file: "src/AccountSwitch.tsx",
				propNames: ["defaultChecked", "checked"],
			}),
		];

		const first = normalize(runGraph({ components }, "same-run"));
		const second = normalize(
			runGraph(
				{
					components: [...components].reverse().map((node) => ({
						...node,
						propNames: [...node.propNames].reverse(),
						hookCalls: [...node.hookCalls].reverse(),
					})),
				},
				"same-run",
			),
		);

		expect(first).toEqual(second);
		expect(first).toHaveLength(2);
		for (const finding of first) {
			const evidence = adapterEvidence(finding);
			expect(evidence.roles).toEqual([...evidence.roles].sort(compareRoles));
			expect(evidence.topology.exceeded).toEqual(
				[...evidence.topology.exceeded].sort(),
			);
		}
	});

	test("reads frozen graph input without mutation", () => {
		const graph = freezeGraph({
			components: [
				component({
					id: "c-input",
					name: "Input",
					propNames: ["value", "defaultValue"],
					hookCalls: ["useState"],
				}),
			],
		});
		const before = JSON.stringify(graph);

		const findings = runGraph(graph, "run-controlled-uncontrolled", false);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(graph)).toBe(before);
	});

	test("explains controlled/uncontrolled prop-surface drift in plain bounded language", () => {
		const analyzer = createControlledUncontrolledPropSurfaceDriftAnalyzer();
		const [finding] = runGraph({
			components: [
				component({
					id: "c-input",
					name: "Input",
					propNames: ["value", "defaultValue", "onChange"],
					hookCalls: ["useState"],
				}),
			],
		});

		const explanation = analyzer.explain?.({
			...finding!,
			severity: finding!.severityRaw,
			status: "active",
			weight: null,
		});

		expect(explanation).toMatchObject({
			summary:
				"Input exposes both value and defaultValue prop names in the same component prop surface.",
			whyItMatters:
				"This is worth checking because controlled and default prop names describe different observed state-ownership surfaces for the same component API slot.",
			inspectFirst: expect.arrayContaining([
				"Input in src/Input.tsx",
				"mixed prop pair observed: value/defaultValue",
				"handler props observed: onChange",
				"state hooks observed: useState",
				"threshold crossed: mixed prop pairs 1 (limit: 0)",
			]),
		});
		expect(explanation?.limits.join("\n")).toMatch(
			/does not prove runtime controlled behavior/i,
		);
		expect(explanation?.limits.join("\n")).toMatch(
			/does not infer team intent/i,
		);
		expect(JSON.stringify(explanation)).not.toMatch(
			/is runtime controlled|runtime warning is|this is a bug|must refactor|root cause is|user impact is/i,
		);
	});
});

interface GraphInput {
	components: readonly ComponentNode[];
	edges?: readonly GraphEdge[];
	patternFacts?: readonly PatternFact[];
}

function runGraph(
	input: GraphInput,
	runId = "run-controlled-uncontrolled",
	cloneInput = true,
): Finding[] {
	const analyzer = createControlledUncontrolledPropSurfaceDriftAnalyzer();
	const components = cloneInput
		? [...input.components]
		: (input.components as ComponentNode[]);
	const edges = cloneInput
		? [...(input.edges ?? [])]
		: ((input.edges ?? []) as GraphEdge[]);
	const patternFacts = cloneInput
		? [...(input.patternFacts ?? [])]
		: ((input.patternFacts ?? []) as PatternFact[]);
	return normalizeResult(
		analyzer.analyze({
			graph: {
				components,
				hooks: [],
				modules: [],
				edges,
				patternFacts,
			},
			memory: {} as never,
			config: DEFAULT_CONFIG,
			types: { typeOf: () => null },
			runId,
			commitSha: "sha-controlled-uncontrolled",
			analysisVersion: 1,
			embeddingModelVersion: "test",
			boundaryRules: [],
		} satisfies AnalysisContext),
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

function component(
	overrides: Partial<ComponentNode> & Pick<ComponentNode, "id" | "name">,
): ComponentNode {
	const file = overrides.file ?? `src/${overrides.name}.tsx`;
	return {
		id: overrides.id,
		name: overrides.name,
		span: overrides.span ?? span(file, "component", 0, 100),
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

function span(file: string, kind: string, start: number, end: number): Span {
	return { file, kind, start, end, astPath: `${file}:${kind}:${start}:${end}` };
}

function freezeGraph(input: GraphInput): GraphInput {
	for (const component of input.components) {
		Object.freeze(component.span);
		Object.freeze(component.propNames);
		Object.freeze(component.hookCalls);
		Object.freeze(component.childComponents);
		Object.freeze(component.compositionMarkers);
		Object.freeze(component);
	}
	for (const edge of input.edges ?? []) Object.freeze(edge);
	for (const fact of input.patternFacts ?? []) {
		Object.freeze(fact.span);
		Object.freeze(fact);
	}
	return Object.freeze({
		components: Object.freeze([...input.components]),
		edges: Object.freeze([...(input.edges ?? [])]),
		patternFacts: Object.freeze([...(input.patternFacts ?? [])]),
	}) as GraphInput;
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
