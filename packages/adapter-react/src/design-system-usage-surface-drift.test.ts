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
	DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
	createDesignSystemUsageSurfaceDriftAnalyzer,
} from "./design-system-usage-surface-drift.js";

describe("design system usage surface drift analyzer", () => {
	// ── Cross-usage EMITS (central acceptance scenario) ────────────────────────

	test("EMITS info: <Button variant> on one usage + <Button className> on DISTINCT usage", () => {
		// Cross-usage: variant on one Button instance, className on a different Button instance
		const findings = runFacts([
			jsx("b1", "Button", "src/page.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/page.tsx", 20, 50),
			jsx("b2", "Button", "src/page.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/page.tsx", 120, 150),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
		});
		const evidence = adapterEvidence(finding!);
		expect(evidence.topology.exceeded).toContain(
			`stylingVariantSurfaceDrift:Button:src/page.tsx`,
		);
	});

	test("EMITS info: <Card size> on one usage + <Card style> on DISTINCT usage", () => {
		const findings = runFacts([
			jsx("c1", "Card", "src/ui.tsx", 10, 100),
			jsxAttribute("a1", "Card", "size", "literal", "sm", "src/ui.tsx", 20, 50),
			jsx("c2", "Card", "src/ui.tsx", 110, 200),
			jsxAttribute("a2", "Card", "style", "expression", "{ padding: 8 }", "src/ui.tsx", 120, 150),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			`stylingVariantSurfaceDrift:Card:src/ui.tsx`,
		);
	});

	test("EMITS info: bare variant (valueKind absent) on one Button + className on another Button", () => {
		// OQ3: bare prop (valueKind absent) counts as VARIANT_PROP usage
		const findings = runFacts([
			jsx("b1", "Button", "src/bare.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "absent", "", "src/bare.tsx", 20, 50),
			jsx("b2", "Button", "src/bare.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "literal", "btn-primary", "src/bare.tsx", 120, 150),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			`stylingVariantSurfaceDrift:Button:src/bare.tsx`,
		);
	});

	// ── SILENT scenarios ───────────────────────────────────────────────────────

	test("SILENT: single <Button variant className> — cross-usage required, not single element with both", () => {
		// A single JSX usage with BOTH variant AND className does NOT alone fire the gate.
		const findings = runFacts([
			jsx("b1", "Button", "src/single-both.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/single-both.tsx", 20, 50),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/single-both.tsx", 55, 85),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: uniform variant-only across two Button usages", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/uniform-variant.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/uniform-variant.tsx", 20, 50),
			jsx("b2", "Button", "src/uniform-variant.tsx", 110, 200),
			jsxAttribute("a2", "Button", "variant", "literal", "secondary", "src/uniform-variant.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: uniform raw-only (className) across two Button usages", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/uniform-raw.tsx", 10, 100),
			jsxAttribute("a1", "Button", "className", "expression", "styles.primary", "src/uniform-raw.tsx", 20, 50),
			jsx("b2", "Button", "src/uniform-raw.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.secondary", "src/uniform-raw.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: all Button usages carry BOTH variant AND className (no variant-only or raw-only)", () => {
		// All elements have both → no divergence (all-both SILENT)
		const findings = runFacts([
			jsx("b1", "Button", "src/all-both.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/all-both.tsx", 20, 50),
			jsxAttribute("a2", "Button", "className", "expression", "styles.a", "src/all-both.tsx", 55, 85),
			jsx("b2", "Button", "src/all-both.tsx", 110, 200),
			jsxAttribute("a3", "Button", "variant", "literal", "secondary", "src/all-both.tsx", 120, 150),
			jsxAttribute("a4", "Button", "className", "expression", "styles.b", "src/all-both.tsx", 155, 185),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: fewer than 2 usages of a tag", () => {
		// Only one Button JSX element — cannot fire (requires >=2 usages)
		const findings = runFacts([
			jsx("b1", "Button", "src/single-el.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/single-el.tsx", 20, 50),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/single-el.tsx", 55, 85),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: no variant prop on any usage", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/no-variant.tsx", 10, 100),
			jsxAttribute("a1", "Button", "className", "expression", "styles.a", "src/no-variant.tsx", 20, 50),
			jsx("b2", "Button", "src/no-variant.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.b", "src/no-variant.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: no raw-style prop on any usage", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/no-raw.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/no-raw.tsx", 20, 50),
			jsx("b2", "Button", "src/no-raw.tsx", 110, 200),
			jsxAttribute("a2", "Button", "size", "literal", "sm", "src/no-raw.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	// ── Tag guard: lowercase native tags ─────────────────────────────────────

	test("SILENT: lowercase <button> native HTML tag — not matched by tag guard", () => {
		const findings = runFacts([
			jsx("b1", "button", "src/native.tsx", 10, 100),
			jsxAttribute("a1", "button", "variant", "literal", "primary", "src/native.tsx", 20, 50),
			jsx("b2", "button", "src/native.tsx", 110, 200),
			jsxAttribute("a2", "button", "className", "expression", "styles.btn", "src/native.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: lowercase <div> native HTML tag — not matched by tag guard", () => {
		const findings = runFacts([
			jsx("d1", "div", "src/native-div.tsx", 10, 100),
			jsxAttribute("a1", "div", "color", "literal", "red", "src/native-div.tsx", 20, 50),
			jsx("d2", "div", "src/native-div.tsx", 110, 200),
			jsxAttribute("a2", "div", "className", "expression", "styles.div", "src/native-div.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	// ── Tag guard: dotted member tags ──────────────────────────────────────────

	test("SILENT: dotted <Modal.Trigger> tag — S1 domain, contains '.'", () => {
		const findings = runFacts([
			jsx("mt1", "Modal.Trigger", "src/compound.tsx", 10, 100),
			jsxAttribute("a1", "Modal.Trigger", "variant", "literal", "primary", "src/compound.tsx", 20, 50),
			jsx("mt2", "Modal.Trigger", "src/compound.tsx", 110, 200),
			jsxAttribute("a2", "Modal.Trigger", "className", "expression", "styles.t", "src/compound.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	test("SILENT: dotted <Button.Icon> tag — contains '.'", () => {
		const findings = runFacts([
			jsx("bi1", "Button.Icon", "src/dotted.tsx", 10, 100),
			jsxAttribute("a1", "Button.Icon", "variant", "literal", "small", "src/dotted.tsx", 20, 50),
			jsx("bi2", "Button.Icon", "src/dotted.tsx", 110, 200),
			jsxAttribute("a2", "Button.Icon", "className", "expression", "styles.icon", "src/dotted.tsx", 120, 150),
		]);

		expect(findings).toEqual([]);
	});

	// ── NON-OVERLAP WITH S3 (CENTRAL ACCEPTANCE CRITERION) ──────────────────
	//
	// The analyzer reads jsx/jsx-attribute patternFacts ONLY.
	// It NEVER reads ctx.graph.components (P11-S3's definition-site domain).
	// These tests prove the non-overlap by populating graph.components with
	// variant/className in propNames but providing <2 divergent JSX usages.
	// The analyzer MUST stay SILENT — it must not be tempted by propNames.

	test("NON-OVERLAP S3: component declares variant+className in propNames but only 1 JSX usage → SILENT", () => {
		// If the analyzer reads ctx.graph.components, it would see variant+className in propNames.
		// But there's only ONE JSX element — not enough for the gate.
		// This proves the analyzer reads jsx/jsx-attribute facts ONLY.
		const findings = runFacts(
			[
				jsx("b1", "Button", "src/overlap.tsx", 10, 100),
				jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/overlap.tsx", 20, 50),
			],
			"run-nonoverlap",
			[{ name: "Button", propNames: ["variant", "className", "size", "style"], file: "src/overlap.tsx" }],
		);

		expect(findings).toEqual([]);
	});

	test("NON-OVERLAP S3: component declares variant+className in propNames but NO JSX usages → SILENT", () => {
		const findings = runFacts(
			[],
			"run-nonoverlap-zero",
			[{ name: "Button", propNames: ["variant", "className"], file: "src/nocomp.tsx" }],
		);

		expect(findings).toEqual([]);
	});

	test("NON-OVERLAP S3: multiple components with variant/className propNames but no divergent JSX usages → SILENT", () => {
		// Two components each with ONE jsx usage each, same tag → no cross-usage divergence
		const findings = runFacts(
			[
				jsx("b1", "Button", "src/multicomp.tsx", 10, 100),
				jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/multicomp.tsx", 20, 50),
			],
			"run-nonoverlap-multi",
			[
				{ name: "Button", propNames: ["variant", "className"], file: "src/multicomp.tsx" },
				{ name: "Card", propNames: ["variant", "style"], file: "src/multicomp.tsx" },
			],
		);

		// Only 1 Button JSX usage → still SILENT
		expect(findings).toEqual([]);
	});

	// ── Cross-file isolation ──────────────────────────────────────────────────

	test("cross-file: Button variant in file-a, Button className in file-b — SILENT per file", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/file-a.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/file-a.tsx", 20, 50),
			jsx("b2", "Button", "src/file-b.tsx", 10, 100),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/file-b.tsx", 20, 50),
		]);

		expect(findings).toEqual([]);
	});

	// ── Multiple divergent tags in one file → severity warn ──────────────────

	test("multiple divergent tags (Button + Input) in one file → severity warn, exceeded.length === 2", () => {
		const findings = runFacts([
			// Button: variant on one, className on another
			jsx("b1", "Button", "src/multi-tag.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/multi-tag.tsx", 20, 50),
			jsx("b2", "Button", "src/multi-tag.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/multi-tag.tsx", 120, 150),
			// Input: color on one, style on another
			jsx("i1", "Input", "src/multi-tag.tsx", 210, 300),
			jsxAttribute("a3", "Input", "color", "literal", "blue", "src/multi-tag.tsx", 220, 250),
			jsx("i2", "Input", "src/multi-tag.tsx", 310, 400),
			jsxAttribute("a4", "Input", "style", "expression", "{ color: 'red' }", "src/multi-tag.tsx", 320, 350),
		]);

		expect(findings).toHaveLength(1);
		expect(findings[0]!.severityRaw).toBe("warn");
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toHaveLength(2);
		expect(evidence.topology.exceeded).toContain(`stylingVariantSurfaceDrift:Button:src/multi-tag.tsx`);
		expect(evidence.topology.exceeded).toContain(`stylingVariantSurfaceDrift:Input:src/multi-tag.tsx`);
	});

	test("single divergent tag → severity info", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/single-tag.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/single-tag.tsx", 20, 50),
			jsx("b2", "Button", "src/single-tag.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/single-tag.tsx", 120, 150),
		]);

		expect(findings).toHaveLength(1);
		expect(findings[0]!.severityRaw).toBe("info");
	});

	// ── Determinism ───────────────────────────────────────────────────────────

	test("determinism: forward vs reversed fact order produces identical findings", () => {
		const facts = [
			jsx("b1", "Button", "src/det.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/det.tsx", 20, 50),
			jsx("b2", "Button", "src/det.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/det.tsx", 120, 150),
		];

		const first = normalize(runFacts(facts, "run-det"));
		const second = normalize(runFacts([...facts].reverse(), "run-det"));

		expect(first).toEqual(second);
		expect(first).toHaveLength(1);
	});

	// ── Fingerprint stability ──────────────────────────────────────────────────

	test("structural fingerprint is stable across a pure span shift (positional differs)", () => {
		const baseline = runFacts([
			jsx("b1", "Button", "src/shift.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/shift.tsx", 20, 50),
			jsx("b2", "Button", "src/shift.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/shift.tsx", 120, 150),
		]);

		const shifted = runFacts([
			jsx("b1", "Button", "src/shift.tsx", 510, 600),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/shift.tsx", 520, 550),
			jsx("b2", "Button", "src/shift.tsx", 610, 700),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/shift.tsx", 620, 650),
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

	// ── Frozen facts unmutated ────────────────────────────────────────────────

	test("reads frozen pattern facts without mutating them", () => {
		const facts = freezeFacts([
			jsx("b1", "Button", "src/frozen.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/frozen.tsx", 20, 50),
			jsx("b2", "Button", "src/frozen.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/frozen.tsx", 120, 150),
		]);
		const before = JSON.stringify(facts);

		const findings = runFacts(facts as PatternFact[]);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(facts)).toBe(before);
	});

	// ── Evidence structure ────────────────────────────────────────────────────

	test("evidence contains observed variant and raw-style prop names", () => {
		const findings = runFacts([
			jsx("b1", "Button", "src/evidence.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/evidence.tsx", 20, 50),
			jsx("b2", "Button", "src/evidence.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/evidence.tsx", 120, 150),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.adapterId).toBe("react");
		expect(evidence.ruleId).toBe(DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID);
		expect(evidence.subject.file).toBe("src/evidence.tsx");
		// Topology exceeded contains divergent tag token
		expect(evidence.topology.exceeded.length).toBeGreaterThan(0);
	});

	// ── Explain: forbidden vocabulary + null for other ruleId ────────────────

	test("explain returns bounded language — forbidden-vocab not.toMatch", () => {
		const analyzer = createDesignSystemUsageSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			jsx("b1", "Button", "src/explain.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/explain.tsx", 20, 50),
			jsx("b2", "Button", "src/explain.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/explain.tsx", 120, 150),
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
		expect(explanation!.limits).toBeDefined();
		expect(explanation!.limits!.length).toBeGreaterThan(0);

		const serialized = JSON.stringify(explanation);
		// S8 forbidden-vocab regex (substring-based — banned even inside negations)
		expect(serialized).not.toMatch(
			/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|runtime behavior|two libraries|React warning|you should|root cause/i,
		);
		// Extended S9 forbidden set
		expect(serialized).not.toMatch(/design system component/i);
		expect(serialized).not.toMatch(/component library/i);
		expect(serialized).not.toMatch(/\bthemed\b/i);
		expect(serialized).not.toMatch(/\boverride\b/i);
		expect(serialized).not.toMatch(/\bconflict\b/i);
		expect(serialized).not.toMatch(/\bincorrect\b/i);
		expect(serialized).not.toMatch(/\bruntime\b/i);
		expect(serialized).not.toMatch(/\blibrar(?:y|ies)\b/i);
	});

	test("explain returns null for non-matching ruleId", () => {
		const analyzer = createDesignSystemUsageSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			jsx("b1", "Button", "src/null-explain.tsx", 10, 100),
			jsxAttribute("a1", "Button", "variant", "literal", "primary", "src/null-explain.tsx", 20, 50),
			jsx("b2", "Button", "src/null-explain.tsx", 110, 200),
			jsxAttribute("a2", "Button", "className", "expression", "styles.btn", "src/null-explain.tsx", 120, 150),
		]);
		const other = presented({ ...finding!, ruleId: "react/other" });
		expect(analyzer.explain?.(other)).toBeNull();
	});
});

// ── Test harness ─────────────────────────────────────────────────────────────

interface GraphComponent {
	name: string;
	propNames: string[];
	file: string;
}

function runFacts(
	facts: readonly PatternFact[],
	runId = "run-design-system-usage-drift",
	components: GraphComponent[] = [],
): Finding[] {
	const analyzer = createDesignSystemUsageSurfaceDriftAnalyzer();
	return normalizeResult(
		analyzer.analyze({
			graph: {
				components: components as never[],
				hooks: [],
				modules: [],
				edges: [],
				patternFacts: facts as PatternFact[],
			},
			memory: {} as never,
			config: DEFAULT_CONFIG,
			types: { typeOf: () => null },
			runId,
			commitSha: "sha-design-system-usage-drift",
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

function jsx(
	id: string,
	tag: string,
	file = "src/design.tsx",
	start = 10,
	end = 100,
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
	file = "src/design.tsx",
	start = 15,
	end = 40,
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
