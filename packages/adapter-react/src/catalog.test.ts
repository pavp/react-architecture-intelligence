import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeRepo, AnalyzerRegistry, DEFAULT_CONFIG } from "@rai/core";
import type { PatternFact } from "@rai/core";
import {
	REACT_PATTERN_CATALOG,
	catalogFactKinds,
	readCatalogEvidence,
} from "./catalog.js";

describe("React catalog scaffold", () => {
	test("references generic core fact kinds without emitting findings", () => {
		expect(catalogFactKinds()).toEqual([
			"import",
			"export",
			"call",
			"call-binding",
			"call-argument",
			"jsx",
			"jsx-attribute",
			"hook-call",
			"member-assignment",
			"file-role-seed",
		]);
		expect(REACT_PATTERN_CATALOG.findings).toEqual([]);
		expect(REACT_PATTERN_CATALOG.writesMemory).toBe(false);
	});

	test("consumes core pattern facts as syntax evidence", () => {
		const facts: PatternFact[] = [
			fact({
				kind: "import",
				source: "ui",
				specifiers: [{ imported: "Modal", local: "Modal", mode: "named" }],
			}),
			fact({
				kind: "member-assignment",
				object: "Modal",
				property: "Trigger",
				value: "Trigger",
			}),
			fact({ kind: "jsx", tag: "Modal.Trigger", parentTag: "Modal.Root" }),
		];

		expect(readCatalogEvidence(facts)).toEqual({
			factCount: 3,
			kinds: ["import", "jsx", "member-assignment"],
			syntaxOnly: true,
		});
	});

	test("does not emit findings or writes when fixture facts are inspected", () => {
		const result = analyzeRepo({
			files: ["modal.tsx", "popover.tsx"].map((name) => ({
				file: `fixtures/react/compound-primitives/${name}`,
				source: readFileSync(
					`fixtures/react/compound-primitives/${name}`,
					"utf8",
				),
			})),
			registry: new AnalyzerRegistry(),
			findings: { insert: () => undefined } as never,
			feedback: {} as never,
			config: DEFAULT_CONFIG,
			runId: "run-react-catalog-test",
			commitSha: "",
			asOf: 1,
		});

		expect(result.presented).toEqual([]);
		expect(result.graph.patternFacts).toContainEqual(
			expect.objectContaining({
				kind: "member-assignment",
				object: "Popover",
				property: "Trigger",
			}),
		);
		expect(result.graph.patternFacts).toContainEqual(
			expect.objectContaining({
				kind: "jsx",
				tag: "Modal.Trigger",
				parentTag: "Modal",
			}),
		);
		expect(readCatalogEvidence(result.graph.patternFacts).syntaxOnly).toBe(
			true,
		);
	});
});

function fact(
	extra: { kind: PatternFact["kind"] } & Record<string, unknown>,
): PatternFact {
	return {
		...extra,
		id: `fixture#${extra.kind}`,
		file: "fixtures/react/compound-primitives/modal.tsx",
		span: {
			file: "fixtures/react/compound-primitives/modal.tsx",
			start: 0,
			end: 1,
			kind: extra.kind,
			astPath: "test",
		},
	} as PatternFact;
}
