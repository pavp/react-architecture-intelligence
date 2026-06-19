import { describe, expect, test } from "vitest";
import { buildPropDrillingProposalBuilder, PROP_DRILLING_PROPOSAL_RULE_ID } from "./prop-drilling-proposal.js";
import type { ProposalBuilderInput } from "@rai/core";
import type { PresentedFinding, AdapterMetricEvidence } from "@rai/core";

// ── Shared test fixtures ────────────────────────────────────────────────────

function makeSpan() {
	return { file: "Middle.tsx", start: 0, end: 100, kind: "component" as const, astPath: "module>component" };
}

function makePropDrillingInput(overrides?: Partial<{
	fingerprint: string;
	drilledProps: string[];
	upstreamName: string;
	downstreamName: string;
	limits: string[];
}>): ProposalBuilderInput {
	const fingerprint = overrides?.fingerprint ?? "pd-fp-test";
	const drilledProps = overrides?.drilledProps ?? ["theme"];
	const upstreamName = overrides?.upstreamName ?? "App";
	const downstreamName = overrides?.downstreamName ?? "Leaf";
	const limits = overrides?.limits ?? [
		"Name-level only: matches prop names, not values.",
		"Cannot determine whether this component uses the prop itself.",
		"This is an opportunity signal, not a confirmed bug.",
	];

	const evidence: AdapterMetricEvidence = {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: "react/prop-drilling",
		subject: {
			id: "react:prop-drilling:Middle-id",
			name: "Middle",
			file: "Middle.tsx",
			span: makeSpan(),
			fingerprint: "subj-fp",
		},
		roles: [
			...drilledProps.map((p) => ({ role: "drilled-prop", variant: p, file: "Middle.tsx" })),
			{ role: "upstream-source", variant: upstreamName, file: "App.tsx" },
			{ role: "downstream-target", variant: downstreamName, file: "Leaf.tsx" },
		],
		metrics: {
			drilledProps: drilledProps.length,
			upstreamSources: 1,
			downstreamTargets: 1,
			propCount: drilledProps.length + 2,
		},
		thresholds: { maxDrilledProps: 0 },
		topology: {
			directChildIds: ["Leaf-id"],
			reachableNodeIds: ["App-id"],
			exceeded: drilledProps.map((p) => `propDrilling:${p}`),
		},
	};

	const finding: PresentedFinding = {
		id: `finding-${fingerprint}`,
		ruleId: "react/prop-drilling",
		type: "opportunity",
		fingerprint: { structural: fingerprint, nominal: `nom-${fingerprint}`, positional: `pos-${fingerprint}` },
		analysisVersion: 1,
		fpAlgoVersion: 1,
		producingRunId: "run1",
		commitSha: "c1",
		severityRaw: "warn",
		evidence,
		createdAt: 0,
		weight: undefined,
		status: "active",
		severity: "warn",
	};

	return { finding, limits };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("buildPropDrillingProposalBuilder", () => {
	test("builder has ruleId react/prop-drilling", () => {
		const builder = buildPropDrillingProposalBuilder();
		expect(builder.ruleId).toBe("react/prop-drilling");
	});

	test("PROP_DRILLING_PROPOSAL_RULE_ID constant equals react/prop-drilling", () => {
		expect(PROP_DRILLING_PROPOSAL_RULE_ID).toBe("react/prop-drilling");
	});

	describe("grounded preview — happy path", () => {
		test("returns status preview with required shape fields", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.kind).toBe("preview-only");
			expect(result.writeMode).toBe("proposal-only");
			expect(result.ruleId).toBe("react/prop-drilling");
		});

		test("fingerprint matches finding fingerprint (passthrough)", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ fingerprint: "unique-fp-abc" }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.fingerprint).toBe("unique-fp-abc");
		});

		test("subject.name matches evidence subject name", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.subject.name).toBe("Middle");
		});

		test("subject.file matches evidence subject file", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.subject.file).toBe("Middle.tsx");
		});

		test("drilledProps matches evidence drilled-prop roles, sorted", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ drilledProps: ["theme"] }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect((result as any).drilledProps).toEqual(["theme"]);
		});

		test("upstreamRole matches evidence upstream-source role", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ upstreamName: "App" }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect((result as any).upstreamRole).toBe("App");
		});

		test("downstreamRole matches evidence downstream-target role", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ downstreamName: "Leaf" }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect((result as any).downstreamRole).toBe("Leaf");
		});

		test("observations array is non-empty and mentions subject and drilled props", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ drilledProps: ["theme"] }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.observations.length).toBeGreaterThan(0);
			// observations must reference grounded evidence, not invented strings
			const joined = result.observations.join(" ");
			expect(joined).toMatch(/Middle/);
		});
	});

	describe("limits passthrough", () => {
		test("limits in output equals limits passed in verbatim", () => {
			const builder = buildPropDrillingProposalBuilder();
			const customLimits = ["limit-A", "limit-B", "limit-C"];
			const result = builder.build(makePropDrillingInput({ limits: customLimits }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.limits).toEqual(customLimits);
		});

		test("limits are passed through even when empty array", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ limits: [] }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.limits).toEqual([]);
		});
	});

	describe("multi-prop sorting", () => {
		test("multiple drilled props appear sorted in drilledProps", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput({ drilledProps: ["zIndex", "color", "align"] }));

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect((result as any).drilledProps).toEqual(["align", "color", "zIndex"]);
		});
	});

	describe("non-prescriptive consider template", () => {
		test("consider is non-empty and does not assert which option is correct", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			expect(result.consider.length).toBeGreaterThan(0);
		});

		test("consider template lists multiple options without prescribing one", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect(result.status).toBe("preview");
			if (result.status !== "preview") throw new Error("expected preview");
			// Must include non-prescriptive marker — RAI does not know which is correct
			const joined = result.consider.join(" ");
			expect(joined).toMatch(/does not know|not.*correct|not.*safe|not.*prescribe/i);
		});
	});

	describe("wrong ruleId refusal", () => {
		test("wrong ruleId on finding returns refused unsupported-rule", () => {
			const builder = buildPropDrillingProposalBuilder();
			const input = makePropDrillingInput();
			// Override the finding's ruleId to a different rule
			const wrongInput: ProposalBuilderInput = {
				...input,
				finding: { ...input.finding, ruleId: "react/render-coupling" },
			};

			const result = builder.build(wrongInput);

			expect(result.status).toBe("refused");
			expect((result as any).reason).toBe("unsupported-rule");
		});
	});

	describe("no-patch invariant", () => {
		test("output has no patch field", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect((result as any).patch).toBeUndefined();
		});

		test("output has no diff field", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect((result as any).diff).toBeUndefined();
		});

		test("output has no sourceInstances field", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect((result as any).sourceInstances).toBeUndefined();
		});

		test("output has no varianceParameters field", () => {
			const builder = buildPropDrillingProposalBuilder();
			const result = builder.build(makePropDrillingInput());

			expect((result as any).varianceParameters).toBeUndefined();
		});
	});
});
