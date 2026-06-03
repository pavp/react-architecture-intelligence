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
	type PatternHookCallFact,
	type Span,
} from "@rai/core";
import {
	CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
	createContainerPresenterRoleDriftAnalyzer,
} from "./container-presenter-role-drift.js";

describe("container/presenter role drift analyzer", () => {
	test("emits no finding for a healthy paired container/presenter surface", () => {
		const findings = runGraph({
			components: [
				component({
					id: "c-container",
					name: "UserContainer",
					childComponents: ["UserView"],
				}),
				component({ id: "c-view", name: "UserView" }),
			],
			edges: [renders("c-container", "c-view")],
		});

		expect(findings).toEqual([]);
	});

	test("reports a presenter-like child with high-signal hook usage inside a paired render surface", () => {
		const findings = runGraph({
			components: [
				component({
					id: "c-container",
					name: "UserContainer",
					childComponents: ["UserView"],
					span: span("src/UserContainer.tsx", "component", 0, 80),
				}),
				component({
					id: "c-view",
					name: "UserView",
					hookCalls: ["useState"],
					span: span("src/UserView.tsx", "component", 10, 120),
				}),
			],
			edges: [renders("c-container", "c-view")],
			patternFacts: [
				hookFact("hook-state", "useState", "src/UserView.tsx", 40, 55),
			],
		});

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
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
			ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
			subject: {
				id: "react:container-presenter:c-container->c-view",
				name: "UserContainer -> UserView",
				file: "src/UserView.tsx",
				span: {
					file: "src/UserView.tsx",
					start: 40,
					end: 55,
					kind: "hook-call",
				},
			},
			metrics: {
				containerRoleSeeds: 2,
				presenterRoleSeeds: 2,
				renderPairs: 1,
				presenterHighSignalHookCalls: 1,
			},
			thresholds: {
				minContainerRoleSeeds: 1,
				minPresenterRoleSeeds: 1,
				minRenderPairs: 1,
				maxPresenterHighSignalHookCalls: 0,
			},
			topology: {
				directChildIds: ["c-view"],
				reachableNodeIds: ["c-container", "c-view", "hook-state"],
				exceeded: ["presenterHighSignalHook:useState"],
			},
		});
		expect(evidence.roles).toEqual(
			expect.arrayContaining([
				{
					role: "container-component",
					variant: "UserContainer",
					file: "src/UserContainer.tsx",
				},
				{
					role: "presenter-component",
					variant: "UserView",
					file: "src/UserView.tsx",
				},
				{
					role: "container-role-seed",
					variant: "name-suffix:Container",
					file: "src/UserContainer.tsx",
				},
				{
					role: "presenter-role-seed",
					variant: "name-suffix:View",
					file: "src/UserView.tsx",
				},
				{
					role: "render-pair",
					variant: "UserContainer->UserView",
					file: "src/UserView.tsx",
				},
				{
					role: "presenter-high-signal-hook",
					variant: "useState",
					file: "src/UserView.tsx",
				},
			]),
		);
	});

	test("keeps unpaired presenter-like hook usage silent", () => {
		const findings = runGraph({
			components: [
				component({ id: "c-view", name: "UserView", hookCalls: ["useState"] }),
			],
			patternFacts: [
				hookFact("hook-state", "useState", "src/UserView.tsx", 10, 20),
			],
		});

		expect(findings).toEqual([]);
	});

	test("keeps container-like components without a presenter-like direct child silent", () => {
		const findings = runGraph({
			components: [
				component({ id: "c-container", name: "UserContainer" }),
				component({
					id: "c-panel",
					name: "UserPanel",
					hookCalls: ["useState"],
				}),
			],
			edges: [renders("c-container", "c-panel")],
		});

		expect(findings).toEqual([]);
	});

	test("requires a renders edge instead of childComponents alone", () => {
		const findings = runGraph({
			components: [
				component({
					id: "c-container",
					name: "UserContainer",
					childComponents: ["UserView"],
				}),
				component({
					id: "c-view",
					name: "UserView",
					hookCalls: ["useState"],
				}),
			],
		});

		expect(findings).toEqual([]);
	});

	test("uses representative high-signal hook samples and ignores low-signal hooks", () => {
		for (const hookName of ["useState", "useEffect", "useQuery"]) {
			const findings = runGraph({
				components: [
					component({
						id: `c-container-${hookName}`,
						name: "UserContainer",
						childComponents: ["UserView"],
					}),
					component({
						id: `c-view-${hookName}`,
						name: "UserView",
						hookCalls: [hookName],
					}),
				],
				edges: [renders(`c-container-${hookName}`, `c-view-${hookName}`)],
			});
			expect(findings, hookName).toHaveLength(1);
		}

		for (const hookName of [
			"useMemo",
			"useContext",
			"useTheme",
			"useMediaQuery",
			"useCustomQuery",
		]) {
			const findings = runGraph({
				components: [
					component({
						id: `c-container-${hookName}`,
						name: "UserContainer",
						childComponents: ["UserView"],
					}),
					component({
						id: `c-view-${hookName}`,
						name: "UserView",
						hookCalls: [hookName],
					}),
				],
				edges: [renders(`c-container-${hookName}`, `c-view-${hookName}`)],
			});
			expect(findings, hookName).toEqual([]);
		}
	});

	test("requires non-empty suffix prefixes and avoids substring-only role matches", () => {
		expect(
			runGraph({
				components: [
					component({
						id: "c-container",
						name: "UserContainer",
						childComponents: ["UserPresenter"],
					}),
					component({
						id: "c-presenter",
						name: "UserPresenter",
						hookCalls: ["useState"],
					}),
				],
				edges: [renders("c-container", "c-presenter")],
			}),
		).toHaveLength(1);

		expect(
			runGraph({
				components: [
					component({
						id: "exact-container",
						name: "Container",
						file: "src/components/Container.tsx",
						childComponents: ["View"],
					}),
					component({
						id: "exact-view",
						name: "View",
						file: "src/components/View.tsx",
						hookCalls: ["useState"],
					}),
				],
				edges: [renders("exact-container", "exact-view")],
			}),
		).toEqual([]);

		expect(
			runGraph({
				components: [
					component({
						id: "valid-container",
						name: "UserContainer",
						childComponents: ["Presenter"],
					}),
					component({
						id: "exact-presenter",
						name: "Presenter",
						file: "src/components/Presenter.tsx",
						hookCalls: ["useState"],
					}),
				],
				edges: [renders("valid-container", "exact-presenter")],
			}),
		).toEqual([]);

		expect(
			runGraph({
				components: [
					component({
						id: "c-containerized",
						name: "ContainerizedPanel",
						file: "src/containerized/User.tsx",
						childComponents: ["Overview"],
					}),
					component({
						id: "c-overview",
						name: "Overview",
						file: "src/overview/Profile.tsx",
						hookCalls: ["useState"],
					}),
				],
				edges: [renders("c-containerized", "c-overview")],
			}),
		).toEqual([]);
	});

	test("supports exact path-segment role seeds", () => {
		const findings = runGraph({
			components: [
				component({
					id: "c-user",
					name: "User",
					file: "src/containers/User.tsx",
					childComponents: ["Profile"],
				}),
				component({
					id: "c-profile",
					name: "Profile",
					file: "src/views/Profile.tsx",
					hookCalls: ["useState"],
				}),
			],
			edges: [renders("c-user", "c-profile")],
		});

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.roles).toEqual(
			expect.arrayContaining([
				{
					role: "container-role-seed",
					variant: "path-segment:containers",
					file: "src/containers/User.tsx",
				},
				{
					role: "presenter-role-seed",
					variant: "path-segment:views",
					file: "src/views/Profile.tsx",
				},
			]),
		);

		const filenameTokenFindings = runGraph({
			components: [
				component({
					id: "c-filename-container",
					name: "User",
					file: "src/user-container.tsx",
					childComponents: ["Profile"],
				}),
				component({
					id: "c-filename-view",
					name: "Profile",
					file: "src/profile-view.tsx",
					hookCalls: ["useState"],
				}),
			],
			edges: [renders("c-filename-container", "c-filename-view")],
		});
		expect(filenameTokenFindings).toHaveLength(1);
		expect(adapterEvidence(filenameTokenFindings[0]!).roles).toEqual(
			expect.arrayContaining([
				{
					role: "container-role-seed",
					variant: "path-segment:container",
					file: "src/user-container.tsx",
				},
				{
					role: "presenter-role-seed",
					variant: "path-segment:view",
					file: "src/profile-view.tsx",
				},
			]),
		);
	});

	test("keeps findings and evidence deterministic for reversed graph input", () => {
		const components = [
			component({
				id: "b-container",
				name: "BillingContainer",
				childComponents: ["BillingView"],
			}),
			component({
				id: "b-view",
				name: "BillingView",
				hookCalls: ["useEffect", "useState"],
			}),
			component({
				id: "a-container",
				name: "AccountContainer",
				childComponents: ["AccountView"],
			}),
			component({ id: "a-view", name: "AccountView", hookCalls: ["useQuery"] }),
		];
		const edges = [
			renders("b-container", "b-view"),
			renders("a-container", "a-view"),
		];
		const facts = [
			hookFact("hook-b-effect", "useEffect", "src/BillingView.tsx", 30, 44),
			hookFact("hook-b-state", "useState", "src/BillingView.tsx", 10, 24),
			hookFact("hook-a-query", "useQuery", "src/AccountView.tsx", 10, 24),
		];

		const first = normalize(
			runGraph({ components, edges, patternFacts: facts }, "same-run"),
		);
		const second = normalize(
			runGraph(
				{
					components: [...components].reverse(),
					edges: [...edges].reverse(),
					patternFacts: [...facts].reverse(),
				},
				"same-run",
			),
		);

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

	test("reads frozen graph input without mutation", () => {
		const graph = freezeGraph({
			components: [
				component({
					id: "c-container",
					name: "UserContainer",
					childComponents: ["UserView"],
				}),
				component({ id: "c-view", name: "UserView", hookCalls: ["useState"] }),
			],
			edges: [renders("c-container", "c-view")],
			patternFacts: [
				hookFact("hook-state", "useState", "src/UserView.tsx", 10, 20),
			],
		});
		const before = JSON.stringify(graph);

		const findings = runGraph(graph, "run-container-presenter", false);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(graph)).toBe(before);
	});

	test("serialized findings avoid unproved claim language", () => {
		const [finding] = runGraph({
			components: [
				component({
					id: "c-container",
					name: "UserContainer",
					childComponents: ["UserView"],
				}),
				component({ id: "c-view", name: "UserView", hookCalls: ["useState"] }),
			],
			edges: [renders("c-container", "c-view")],
		});

		expect(JSON.stringify(finding)).not.toMatch(
			/wrong|bad separation|team intent|historical|must refactor|root cause|bug caused/i,
		);
	});

	test("explains container/presenter role drift in plain bounded language", () => {
		const analyzer = createContainerPresenterRoleDriftAnalyzer();
		const [finding] = runGraph({
			components: [
				component({ id: "c-container", name: "UserContainer" }),
				component({ id: "c-view", name: "UserView", hookCalls: ["useState"] }),
			],
			edges: [renders("c-container", "c-view")],
		});

		const explanation = analyzer.explain?.({
			...finding!,
			severity: finding!.severityRaw,
			status: "active",
			weight: null,
		});

		expect(explanation).toMatchObject({
			summary:
				"UserContainer renders UserView. UserView looks presenter-like from observed role-name/path evidence, but it also has high-signal hook evidence: useState.",
			whyItMatters:
				"This is worth checking because the repo's naming suggests a container/view split while measured syntax puts state, effect, or data-hook logic on the presenter-like side.",
			inspectFirst: expect.arrayContaining([
				"UserContainer -> UserView in src/UserView.tsx",
				"container evidence: name-suffix:Container",
				"presenter evidence: name-suffix:View",
				"hook evidence: useState",
				"threshold crossed: presenterHighSignalHook:useState",
			]),
		});
		expect(explanation?.limits.join("\n")).toMatch(
			/does not prove wrong architecture/i,
		);
		expect(explanation?.limits.join("\n")).toMatch(
			/does not infer team intent/i,
		);
		expect(JSON.stringify(explanation)).not.toMatch(
			/bad separation|team intended|must refactor|root cause is|bug caused by/i,
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
	runId = "run-container-presenter",
	cloneInput = true,
): Finding[] {
	const analyzer = createContainerPresenterRoleDriftAnalyzer();
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
			commitSha: "sha-container-presenter",
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

function renders(srcId: string, dstId: string): GraphEdge {
	return { srcId, dstId, kind: "renders" };
}

function hookFact(
	id: string,
	name: string,
	file: string,
	start: number,
	end: number,
): PatternHookCallFact {
	return {
		id,
		kind: "hook-call",
		name,
		file,
		span: span(file, "hook-call", start, end),
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
