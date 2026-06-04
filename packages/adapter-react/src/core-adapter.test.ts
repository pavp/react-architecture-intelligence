import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
	analyzeRepo,
	AnalyzerRegistry,
	createSession,
	DEFAULT_CONFIG,
	type SourceFile,
} from "@rai/core";
import { COMPOUND_COMPONENT_API_DRIFT_RULE_ID } from "./compound-component-api-drift.js";
import { CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID } from "./container-presenter-role-drift.js";
import { CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID } from "./controlled-uncontrolled-prop-surface-drift.js";
import { createReactCoreAnalyzers } from "./core-adapter.js";

describe("React core analyzer adapter", () => {
	test("returns React analyzers with stable metadata", () => {
		const analyzers = createReactCoreAnalyzers({ rootDir: ".", files: [] });

		expect(
			analyzers.map((analyzer) => ({
				ruleId: analyzer.ruleId,
				framework: analyzer.framework,
			})),
		).toEqual([
			{ ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID, framework: "react" },
			{ ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID, framework: "react" },
			{
				ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
				framework: "react",
			},
		]);
	});

	test("registered React analyzers emit findings through the normal analysis path", () => {
		const files: SourceFile[] = [
			{
				file: "src/Modal.tsx",
				source:
					"export const Modal = Root;\nModal.Trigger = Trigger;\nexport function Example() { return <Modal><Modal.Trigger /><Modal.Footer /></Modal>; }\n",
			},
		];
		const session = createReactSession(files);

		const result = session.analyzeRepo({
			files,
			asOf: 0,
			runId: "react-core",
			commitSha: "sha",
		});
		const findings = session.findSharedOpportunities({
			includeSuppressed: false,
		}).opportunities;

		expect(result.counts.byType.opportunity).toBe(1);
		expect(findings).toHaveLength(1);
		expect(findings[0]!).toMatchObject({
			ruleId: COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
			severity: "info",
		});
	});

	test("emits container/presenter role divergence through the normal analysis path", () => {
		const files: SourceFile[] = [
			{
				file: "src/users.tsx",
				source:
					"export function UserContainer() { return <UserView />; }\nexport function UserView() { const [open] = useState(false); return <div>{String(open)}</div>; }\n",
			},
		];
		const session = createReactSession(files);

		const result = session.analyzeRepo({
			files,
			asOf: 0,
			runId: "react-container-presenter",
			commitSha: "sha",
		});
		const findings = session.findSharedOpportunities({
			includeSuppressed: false,
		}).opportunities;

		expect(result.counts.byType.opportunity).toBe(1);
		expect(findings.map((finding) => finding.ruleId)).toEqual([
			CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
		]);
		expect(findings[0]).toMatchObject({
			ruleId: CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
			severity: "info",
			evidence: {
				kind: "adapter-metric",
				subject: { name: "UserContainer -> UserView", file: "src/users.tsx" },
			},
		});
	});

	test("emits controlled/uncontrolled prop-surface drift through the normal analysis path", () => {
		const files: SourceFile[] = [
			{
				file: "src/Input.tsx",
				source:
					"export function Input({ value, defaultValue, onChange }) { const [draft] = useState(defaultValue); return <input />; }\n",
			},
		];
		const session = createReactSession(files);

		const result = session.analyzeRepo({
			files,
			asOf: 0,
			runId: "react-controlled-uncontrolled",
			commitSha: "sha",
		});
		const findings = session.findSharedOpportunities({
			includeSuppressed: false,
		}).opportunities;

		expect(result.counts.byType.opportunity).toBe(1);
		expect(findings.map((finding) => finding.ruleId)).toEqual([
			CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
		]);
		expect(findings[0]).toMatchObject({
			ruleId: CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
			severity: "info",
			evidence: {
				kind: "adapter-metric",
				subject: { name: "Input", file: "src/Input.tsx" },
				metrics: { mixedPropPairs: 1, handlerProps: 1, stateHookCalls: 1 },
			},
		});

		const analyzer = createReactCoreAnalyzers({ rootDir: ".", files }).find(
			(candidate) =>
				candidate.ruleId === CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
		);
		const explanation = analyzer?.explain?.(findings[0]!);
		expect(explanation?.summary).toBe(
			"Input exposes both value and defaultValue prop names in the same component prop surface.",
		);
	});

	test("healthy container/presenter pairs remain silent through parse and analyze", () => {
		const files: SourceFile[] = [
			{
				file: "src/users.tsx",
				source:
					"export function UserContainer() { return <UserView />; }\nexport function UserView() { return <div>User</div>; }\n",
			},
		];
		const session = createReactSession(files);

		const result = session.analyzeRepo({
			files,
			asOf: 0,
			runId: "react-container-presenter-healthy",
			commitSha: "sha",
		});
		const findings = session.findSharedOpportunities({
			includeSuppressed: false,
		}).opportunities;

		expect(result.counts.byType.opportunity).toBe(0);
		expect(
			findings.filter(
				(finding) => finding.ruleId === CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
			),
		).toEqual([]);
	});

	test("fixture-level healthy compound primitives remain silent through parse and analyze", () => {
		const files: SourceFile[] = ["modal.tsx", "popover.tsx"].map((name) => ({
			file: `fixtures/react/compound-primitives/${name}`,
			source: readFileSync(
				`fixtures/react/compound-primitives/${name}`,
				"utf8",
			),
		}));
		const session = createReactSession(files);

		const result = session.analyzeRepo({
			files,
			asOf: 0,
			runId: "react-healthy-fixtures",
			commitSha: "sha",
		});
		const graphResult = analyzeRepo({
			files,
			registry: createReactRegistry(files),
			findings: { insert: () => undefined } as never,
			feedback: {} as never,
			config: DEFAULT_CONFIG,
			runId: "react-healthy-fixtures-graph",
			commitSha: "sha",
			asOf: 0,
		});
		const findings = session.findSharedOpportunities({
			includeSuppressed: false,
		}).opportunities;

		expect(result.counts.byType.opportunity).toBe(0);
		expect(graphResult.graph.patternFacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "member-assignment",
					object: "Modal",
					property: "Trigger",
				}),
				expect.objectContaining({
					kind: "member-assignment",
					object: "Popover",
					property: "Content",
				}),
				expect.objectContaining({
					kind: "jsx",
					tag: "Modal.Content",
					parentTag: "Modal",
				}),
				expect.objectContaining({
					kind: "jsx",
					tag: "Popover.Trigger",
					parentTag: "Popover",
				}),
			]),
		);
		expect(
			findings.filter(
				(finding) => finding.ruleId === COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
			),
		).toEqual([]);
	});
});

function createReactSession(files: SourceFile[]) {
	return createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => createReactRegistry(files),
	});
}

function createReactRegistry(files: SourceFile[]): AnalyzerRegistry {
	const registry = new AnalyzerRegistry();
	for (const analyzer of createReactCoreAnalyzers({ rootDir: ".", files }))
		registry.register(analyzer);
	return registry;
}
