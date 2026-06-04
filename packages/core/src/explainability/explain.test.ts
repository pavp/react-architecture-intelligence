import { expect, test } from "vitest";
import { explainFinding } from "./explain.js";
import type { PresentedFinding } from "../types.js";

const span = {
	file: "src/Button.tsx",
	start: 1,
	end: 20,
	kind: "FunctionDeclaration",
	astPath: "module>fn[0]",
};

function finding(evidence: PresentedFinding["evidence"]): PresentedFinding {
	return {
		id: "f1",
		ruleId: "react/shared-extraction",
		type: "opportunity",
		fingerprint: { structural: "fp", nominal: "n", positional: "p" },
		analysisVersion: 1,
		fpAlgoVersion: 1,
		producingRunId: "run",
		commitSha: "sha",
		severityRaw: "warn",
		severity: "warn",
		status: "active",
		weight: null,
		evidence,
		createdAt: 0,
	};
}

test("explainFinding builds bounded explanation from shared-extraction facts", () => {
	const result = explainFinding(
		finding({
			kind: "shared-extraction",
			instances: [
				{ name: "PrimaryButton", span, fingerprint: "a", exportKind: "named" },
				{
					name: "SecondaryButton",
					span: { ...span, file: "src/SecondaryButton.tsx" },
					fingerprint: "b",
					exportKind: "default",
				},
			],
			cosine: 0.91,
			propOverlap: 0.75,
			hookOverlap: 0.5,
			variancePoints: ["variant"],
			sharedSurface: ["label", "onClick"],
		}),
	);

	expect(result).toMatchObject({
		summary:
			"2 components share similar source shape: PrimaryButton and SecondaryButton.",
		whyItMatters:
			"This is worth checking because the listed components already share measured structure, props, or hook usage in source.",
		inspectFirst: [
			"PrimaryButton in src/Button.tsx",
			"SecondaryButton in src/SecondaryButton.tsx",
			"similarity score: 0.91",
			"prop overlap: 0.75",
			"hook overlap: 0.50",
			"shared props observed: label and onClick",
			"varying props observed: variant",
		],
		limits: expect.arrayContaining([
			"Do not assume shared ownership, intent, root cause, user impact, or safe remediation from this finding alone.",
		]),
		groundingFields: expect.arrayContaining([
			"cosine",
			"propOverlap",
			"hookOverlap",
			"sharedSurface",
		]),
	});
	expect(result.summary).not.toMatch(/^RAI found/i);
	expect(result.glossary.map((entry) => entry.term)).toEqual(
		expect.arrayContaining(["cosine", "sharedSurface"]),
	);
});

test("explainFinding reports unknown evidence keys as raw and does not invent intent", () => {
	const result = explainFinding(
		finding({
			kind: "custom-evidence",
			span,
			ownerIntent: "team-a",
		} as unknown as PresentedFinding["evidence"]),
	);

	expect(result.summary).toBe(
		'Unrecognized evidence kind "custom-evidence" for react/shared-extraction; showing raw evidence keys only.',
	);
	expect(result.whyItMatters).toBe(
		"RAI can show the source-measured keys, but no semantic explanation is registered for this evidence shape.",
	);
	expect(result.inspectFirst).toEqual([
		"raw evidence keys: kind, ownerIntent, span",
	]);
	expect(result.groundingFields).toEqual(["kind", "ownerIntent", "span"]);
	expect(result.glossary).toContainEqual({
		term: "ownerIntent",
		known: false,
		definition: "Unknown term; treat it as raw evidence from the finding.",
	});
	expect(result.whyItMatters).not.toContain("team-a");
	expect(result.limits).toContain(
		"Unknown evidence keys are raw facts, not inferred meaning.",
	);
	expect(result.limits.join("\n")).not.toContain("team-a");
});

test("explainFinding gives evidence-first summary for render-coupling evidence", () => {
	const result = explainFinding(
		finding({
			kind: "render-coupling",
			component: { name: "Dashboard", span, fingerprint: "dashboard-fp" },
			fanIn: 2,
			fanOut: 8,
			directChildren: 5,
			reachableDepth: 3,
		}),
	);

	expect(result.summary).toBe(
		"Dashboard sits at a busy render point: 2 inbound, 8 downstream, 5 direct children, depth 3.",
	);
	expect(result.whyItMatters).toBe(
		"This is worth checking because the render graph shows many relationships around one component.",
	);
	expect(result.inspectFirst).toEqual([
		"Dashboard in src/Button.tsx",
		"2 inbound render links",
		"8 downstream render links",
		"5 direct children",
		"render tree depth: 3",
	]);
	expect(result.summary).not.toMatch(/^RAI found/i);
	expect(result.inspectFirst.join("\n")).not.toMatch(
		/\b(fanIn|fanOut|directChildren|reachableDepth)=/,
	);
	expect(result.limits).toContain(
		"Do not assume shared ownership, intent, root cause, user impact, architectural correctness, or safe remediation from this finding alone.",
	);
});

test("explainFinding keeps known topology guidance human-readable", () => {
	const result = explainFinding(
		finding({
			kind: "hook-topology",
			hook: { name: "useDashboardData", span, fingerprint: "hook-fp" },
			fanIn: 1,
			fanOut: 4,
			directDependencies: 2,
			reachableDepth: 3,
		}),
	);

	expect(result.summary).toBe(
		"useDashboardData sits at a busy hook dependency point: 1 inbound, 4 downstream, 2 direct dependencies, depth 3.",
	);
	expect(result.whyItMatters).toBe(
		"This is worth checking because the dependency graph shows many relationships around one hook.",
	);
	expect(result.inspectFirst).toEqual([
		"useDashboardData in src/Button.tsx",
		"1 inbound dependency link",
		"4 downstream dependency links",
		"2 direct dependencies",
		"dependency tree depth: 3",
	]);
	expect(result.summary).not.toMatch(/^RAI found/i);
	expect(result.inspectFirst.join("\n")).not.toMatch(
		/\b(fanIn|fanOut|directDependencies|reachableDepth)=/,
	);
});

test("explainFinding avoids raw key-value guidance for known evidence kinds", () => {
	const cases: Array<{
		name: string;
		evidence: PresentedFinding["evidence"];
		expectedSummary: string;
		expectedInspectFirst: string[];
	}> = [
		{
			name: "over-abstraction",
			evidence: {
				kind: "over-abstraction",
				component: { name: "Dashboard", span, fingerprint: "dashboard-fp" },
				propCount: 7,
				hookCount: 2,
				childCount: 3,
				compositionMarkerCount: 1,
				conditionalBranchCount: 4,
			},
			expectedSummary:
				"Dashboard has a large measured component surface: 7 props, 2 hooks, 3 rendered children, 1 composition marker, and 4 conditional branches.",
			expectedInspectFirst: [
				"Dashboard in src/Button.tsx",
				"7 props",
				"2 hooks",
				"3 rendered children",
				"1 composition marker",
				"4 conditional branches",
			],
		},
		{
			name: "boundary-violation",
			evidence: {
				kind: "boundary-violation",
				convention: {
					id: "ui-boundary",
					edgeKind: "renders",
					policy: "forbid",
					reason: "Keep app shell separate.",
				},
				edge: {
					kind: "renders",
					from: {
						id: "Dashboard",
						kind: "component",
						name: "Dashboard",
						file: "src/Dashboard.tsx",
						span: { ...span, file: "src/Dashboard.tsx" },
					},
					to: {
						id: "Button",
						kind: "component",
						name: "Button",
						file: "src/Button.tsx",
						span,
					},
				},
			},
			expectedSummary:
				"Configured convention ui-boundary forbids this render link: Dashboard -> Button.",
			expectedInspectFirst: [
				"Dashboard in src/Dashboard.tsx",
				"Button in src/Button.tsx",
				"forbidden render link under convention ui-boundary",
				"config reason: Keep app shell separate.",
			],
		},
	];

	for (const tt of cases) {
		const result = explainFinding(finding(tt.evidence));

		expect(result.summary, tt.name).toBe(tt.expectedSummary);
		expect(result.summary, tt.name).not.toMatch(/^RAI found/i);
		expect(result.inspectFirst, tt.name).toEqual(tt.expectedInspectFirst);
		expect(result.inspectFirst.join("\n"), tt.name).not.toMatch(
			/\b[A-Za-z][A-Za-z0-9.]*=/,
		);
	}
});

test("explainFinding labels adapter-metric fallback values as raw when no hook exists", () => {
	const result = explainFinding(
		finding({
			kind: "adapter-metric",
			adapterId: "next",
			ruleId: "next/client-boundary-bloat",
			subject: {
				id: "AppRoute",
				name: "AppRoute",
				file: "app/page.tsx",
				span: { ...span, file: "app/page.tsx" },
				fingerprint: "route-fp",
			},
			roles: [{ role: "route", variant: "app", file: "app/page.tsx" }],
			metrics: { clientComponentCount: 6 },
			thresholds: { clientComponentCount: 3 },
			topology: {
				directChildIds: ["Child"],
				reachableNodeIds: ["Child", "Leaf"],
				exceeded: ["clientComponentCount"],
			},
		}),
	);

	expect(result.summary).toBe(
		"Unrecognized adapter metric for next/client-boundary-bloat; showing raw adapter facts only.",
	);
	expect(result.inspectFirst).toEqual([
		"AppRoute in app/page.tsx",
		"raw adapter id: next",
		"raw rule id: next/client-boundary-bloat",
		"raw roles: app (route) in app/page.tsx",
		"raw metric keys: clientComponentCount",
		"raw threshold keys: clientComponentCount",
		"raw topology exceeded keys: clientComponentCount",
	]);
	expect(result.inspectFirst.join("\n")).not.toMatch(
		/(^|\n)(adapter|rule):\s|(^|\n)metric [A-Za-z0-9_]+:|(^|\n)threshold [A-Za-z0-9_]+:|(^|\n)exceeded topology:/,
	);
});

test("explainFinding gives raw inspect-first fallback for unknown evidence", () => {
	const result = explainFinding(
		finding({
			kind: "custom-evidence",
			span,
			count: 3,
		} as unknown as PresentedFinding["evidence"]),
	);

	expect(result.inspectFirst).toEqual(["raw evidence keys: count, kind, span"]);
	expect(result.summary).toBe(
		'Unrecognized evidence kind "custom-evidence" for react/shared-extraction; showing raw evidence keys only.',
	);
});
