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
	FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
	createFormControlSurfaceDriftAnalyzer,
} from "./form-control-surface-drift.js";

describe("form control surface drift analyzer", () => {
	// ── Family 1: submit-surface divergence ──────────────────────────────────

	test("F1 positive: form with onSubmit + action across file emits finding info", () => {
		const findings = runFacts([
			jsx("f1", "form", "src/checkout.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleSubmit",
				"src/checkout.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/checkout.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/submit",
				"src/checkout.tsx",
				220,
				250,
			),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
		});
		const evidence = adapterEvidence(finding!);
		expect(evidence.metrics.formSubmitSurfaceDrift).toBe(1);
		expect(evidence.topology.exceeded).toContain(
			"formSubmitSurfaceDrift:src/checkout.tsx",
		);
	});

	test("F1 negative: handler-only (onSubmit, no action/method) — silent", () => {
		const findings = runFacts([
			jsx("f1", "form", "src/login.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleLogin",
				"src/login.tsx",
				20,
				50,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 negative: declarative-only (action, no onSubmit) — silent", () => {
		const findings = runFacts([
			jsx("f1", "form", "src/search.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"action",
				"literal",
				"/search",
				"src/search.tsx",
				20,
				50,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 negative: absent onSubmit valueKind excluded from handler surface (E2)", () => {
		// onSubmit with absent valueKind must NOT count as a submit handler
		const findings = runFacts([
			jsx("f1", "form", "src/bare.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"absent",
				"",
				"src/bare.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/bare.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/bare",
				"src/bare.tsx",
				220,
				250,
			),
		]);

		expect(findings).toEqual([]);
	});

	// ── Family 1: single-form submit-surface (OQ2 — SILENT) ────────────────

	test("F1 OQ2: single <form> with BOTH onSubmit and action — SILENT (single-form is not drift)", () => {
		// A single form element mixing both surfaces must NOT emit.
		// Family-1 drift requires >=2 distinct <form> elements.
		const findings = runFacts([
			jsx("f1", "form", "src/single.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleSubmit",
				"src/single.tsx",
				20,
				50,
			),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/api",
				"src/single.tsx",
				60,
				90,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 OQ2 variant: single <form> with onSubmit + method — SILENT", () => {
		const findings = runFacts([
			jsx("f1", "form", "src/single-method.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleSubmit",
				"src/single-method.tsx",
				20,
				50,
			),
			jsxAttribute(
				"a2",
				"form",
				"method",
				"literal",
				"post",
				"src/single-method.tsx",
				60,
				90,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 OQ2 two-distinct-forms: one <form onSubmit> + separate <form action> — FIRES (two-form divergence)", () => {
		// Two form elements with diverging submit surfaces must still emit.
		// This verifies the fix does not suppress legitimate drift.
		const findings = runFacts([
			jsx("f1", "form", "src/two-forms.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handle",
				"src/two-forms.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/two-forms.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/submit",
				"src/two-forms.tsx",
				220,
				250,
			),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			"formSubmitSurfaceDrift:src/two-forms.tsx",
		);
	});

	test("F1 OQ3: <form> with neither onSubmit, action, nor method — SILENT (absence is not drift)", () => {
		// A plain <form> with no submit surface attrs must not emit.
		const findings = runFacts([
			jsx("f1", "form", "src/bare-form.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"className",
				"literal",
				"checkout",
				"src/bare-form.tsx",
				20,
				50,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 React-19: single <form action={serverAction}> expression alone — SILENT", () => {
		// React 19 progressive-enhancement pattern: action={fn} with no onSubmit.
		// A single declarative-only form must not emit.
		const findings = runFacts([
			jsx("f1", "form", "src/react19.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"action",
				"expression",
				"serverAction",
				"src/react19.tsx",
				20,
				50,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 OQ2 regression: two forms BOTH carrying onSubmit+action — SILENT (uniform dual)", () => {
		// Two distinct forms, each with the SAME surface set (onSubmit + action).
		// Surfaces are uniform across forms → no cross-form divergence → silent.
		const findings = runFacts([
			jsx("f1", "form", "src/uniform-dual.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleSubmit",
				"src/uniform-dual.tsx",
				20,
				50,
			),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/api",
				"src/uniform-dual.tsx",
				60,
				90,
			),
			jsx("f2", "form", "src/uniform-dual.tsx", 210, 400),
			jsxAttribute(
				"a3",
				"form",
				"onSubmit",
				"expression",
				"handleOther",
				"src/uniform-dual.tsx",
				220,
				250,
			),
			jsxAttribute(
				"a4",
				"form",
				"action",
				"literal",
				"/other",
				"src/uniform-dual.tsx",
				260,
				290,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F1 OQ2 regression: two forms where A has onSubmit+action and B has only action — FIRES (cross-form divergence)", () => {
		// Form A: onSubmit + action. Form B: action only (no onSubmit).
		// Form A carries a handler surface that form B lacks → genuine divergence → fires.
		const findings = runFacts([
			jsx("f1", "form", "src/mixed-distinct.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleSubmit",
				"src/mixed-distinct.tsx",
				20,
				50,
			),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/api",
				"src/mixed-distinct.tsx",
				60,
				90,
			),
			jsx("f2", "form", "src/mixed-distinct.tsx", 210, 400),
			jsxAttribute(
				"a3",
				"form",
				"action",
				"literal",
				"/other",
				"src/mixed-distinct.tsx",
				220,
				250,
			),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			"formSubmitSurfaceDrift:src/mixed-distinct.tsx",
		);
	});

	// ── Family 2: control-binding divergence ─────────────────────────────────

	test("F2 positive: mixed value + defaultValue on input elements emits finding", () => {
		const findings = runFacts([
			jsx("i1", "input", "src/form.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"value",
				"expression",
				"name",
				"src/form.tsx",
				15,
				40,
			),
			jsx("i2", "input", "src/form.tsx", 60, 100),
			jsxAttribute(
				"a2",
				"input",
				"defaultValue",
				"literal",
				"Alice",
				"src/form.tsx",
				65,
				90,
			),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			"controlBindingSurfaceDrift:input:value/defaultValue",
		);
	});

	test("F2 positive: mixed checked + defaultChecked on input elements emits finding", () => {
		const findings = runFacts([
			jsx("i1", "input", "src/toggle.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"checked",
				"expression",
				"isOn",
				"src/toggle.tsx",
				15,
				40,
			),
			jsx("i2", "input", "src/toggle.tsx", 60, 100),
			jsxAttribute(
				"a2",
				"input",
				"defaultChecked",
				"literal",
				"true",
				"src/toggle.tsx",
				65,
				90,
			),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			"controlBindingSurfaceDrift:input:checked/defaultChecked",
		);
	});

	test("F2 negative: uniform controlled inputs only — silent (E7)", () => {
		const findings = runFacts([
			jsx("i1", "input", "src/ctrl.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"value",
				"expression",
				"val1",
				"src/ctrl.tsx",
				15,
				40,
			),
			jsx("i2", "input", "src/ctrl.tsx", 60, 100),
			jsxAttribute(
				"a2",
				"input",
				"value",
				"expression",
				"val2",
				"src/ctrl.tsx",
				65,
				90,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F2 negative: uniform uncontrolled inputs only — silent", () => {
		const findings = runFacts([
			jsx("i1", "input", "src/unctrl.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"defaultValue",
				"literal",
				"foo",
				"src/unctrl.tsx",
				15,
				40,
			),
			jsx("i2", "input", "src/unctrl.tsx", 60, 100),
			jsxAttribute(
				"a2",
				"input",
				"defaultValue",
				"literal",
				"bar",
				"src/unctrl.tsx",
				65,
				90,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("F2 negative: per-tag isolation — input and select are distinct (E13)", () => {
		// input:value mixed with select:defaultValue should NOT fire input:value/defaultValue
		// They are different tags; no cross-tag mixing
		const findings = runFacts([
			jsx("i1", "input", "src/mix.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"value",
				"expression",
				"x",
				"src/mix.tsx",
				15,
				40,
			),
			jsx("s1", "select", "src/mix.tsx", 60, 120),
			jsxAttribute(
				"a2",
				"select",
				"defaultValue",
				"literal",
				"opt",
				"src/mix.tsx",
				65,
				90,
			),
		]);

		// input has only value (no defaultValue), select has only defaultValue (no value)
		// Each pair check is per-tag, so neither fires
		expect(findings).toEqual([]);
	});

	test("F2: absent value-attr counts as a control surface (E4)", () => {
		// value with absent valueKind still counts — presence of the attr name is what matters
		const findings = runFacts([
			jsx("i1", "input", "src/absent.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"value",
				"absent",
				"",
				"src/absent.tsx",
				15,
				40,
			),
			jsx("i2", "input", "src/absent.tsx", 60, 100),
			jsxAttribute(
				"a2",
				"input",
				"defaultValue",
				"literal",
				"default",
				"src/absent.tsx",
				65,
				90,
			),
		]);

		expect(findings).toHaveLength(1);
	});

	test("F2: spread attribute name does not match slot name — ignored (E5)", () => {
		// A jsx-attribute with valueKind=spread has name like "props" not "value"
		// The name filter means spread facts are never matched as value/defaultValue
		const findings = runFacts([
			jsx("i1", "input", "src/spread.tsx", 10, 50),
			jsxAttribute(
				"a1",
				"input",
				"props",
				"spread",
				"props",
				"src/spread.tsx",
				15,
				40,
			),
			jsx("i2", "input", "src/spread.tsx", 60, 100),
			jsxAttribute(
				"a2",
				"input",
				"defaultValue",
				"literal",
				"x",
				"src/spread.tsx",
				65,
				90,
			),
		]);

		// spread attr has name "props" not "value", so controlled side is empty → silent
		expect(findings).toEqual([]);
	});

	// ── Scope / regression cases ─────────────────────────────────────────────

	test("silence: no form elements in file — silent", () => {
		const findings = runFacts([
			jsx("d1", "div", "src/layout.tsx", 10, 100),
			jsxAttribute(
				"a1",
				"div",
				"onClick",
				"expression",
				"handler",
				"src/layout.tsx",
				15,
				40,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("cross-file isolation: form in different file than input — no cross-file correlation (E11)", () => {
		const findings = runFacts([
			jsx("f1", "form", "src/form-a.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/form-a.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/form-b.tsx", 10, 200),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/api",
				"src/form-b.tsx",
				20,
				50,
			),
		]);

		// Each file independently: form-a has onSubmit only, form-b has action only → both silent
		expect(findings).toEqual([]);
	});

	test("severity escalates to warn when both F1 and F2 exceeded (divergenceCount > 1)", () => {
		const findings = runFacts([
			// F1: form with onSubmit + action
			jsx("f1", "form", "src/big.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"handleSubmit",
				"src/big.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/big.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/submit",
				"src/big.tsx",
				220,
				250,
			),
			// F2: mixed value/defaultValue on input
			jsx("i1", "input", "src/big.tsx", 410, 450),
			jsxAttribute(
				"a3",
				"input",
				"value",
				"expression",
				"v",
				"src/big.tsx",
				415,
				440,
			),
			jsx("i2", "input", "src/big.tsx", 460, 500),
			jsxAttribute(
				"a4",
				"input",
				"defaultValue",
				"literal",
				"d",
				"src/big.tsx",
				465,
				490,
			),
		]);

		expect(findings).toHaveLength(1);
		expect(findings[0]!.severityRaw).toBe("warn");
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded.length).toBeGreaterThan(1);
	});

	test("determinism: forward vs reversed fact order produces identical findings", () => {
		const facts = [
			jsx("f1", "form", "src/det.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/det.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/det.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/x",
				"src/det.tsx",
				220,
				250,
			),
		];

		const first = normalize(runFacts(facts, "run-det"));
		const second = normalize(runFacts([...facts].reverse(), "run-det"));

		expect(first).toEqual(second);
		expect(first).toHaveLength(1);
	});

	test("structural fingerprint is stable across a pure span shift (positional differs)", () => {
		const baseline = runFacts([
			jsx("f1", "form", "src/shift.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/shift.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/shift.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/x",
				"src/shift.tsx",
				220,
				250,
			),
		]);
		const shifted = runFacts([
			jsx("f1", "form", "src/shift.tsx", 510, 700),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/shift.tsx",
				520,
				550,
			),
			jsx("f2", "form", "src/shift.tsx", 710, 900),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/x",
				"src/shift.tsx",
				720,
				750,
			),
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
			jsx("f1", "form", "src/frozen.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/frozen.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/frozen.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/x",
				"src/frozen.tsx",
				220,
				250,
			),
		]);
		const before = JSON.stringify(facts);

		const findings = runFacts(facts);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(facts)).toBe(before);
	});

	test("capitalized <Form> / <Input> tags (component names) are ignored — silent", () => {
		const findings = runFacts([
			jsx("f1", "Form", "src/custom.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"Form",
				"onSubmit",
				"expression",
				"h",
				"src/custom.tsx",
				20,
				50,
			),
			jsx("f2", "Form", "src/custom.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"Form",
				"action",
				"literal",
				"/x",
				"src/custom.tsx",
				220,
				250,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("select:checked pair not allowed (tags allow-set, ADR-4) — silent", () => {
		// select does not support checked/defaultChecked; CONTROL_BINDING_PAIRS restricts
		const findings = runFacts([
			jsx("s1", "select", "src/select.tsx", 10, 100),
			jsxAttribute(
				"a1",
				"select",
				"checked",
				"expression",
				"x",
				"src/select.tsx",
				15,
				40,
			),
			jsx("s2", "select", "src/select.tsx", 110, 200),
			jsxAttribute(
				"a2",
				"select",
				"defaultChecked",
				"literal",
				"true",
				"src/select.tsx",
				115,
				140,
			),
		]);

		expect(findings).toEqual([]);
	});

	test("provides a bounded analyzer-owned explanation", () => {
		const analyzer = createFormControlSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			jsx("f1", "form", "src/explain.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/explain.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/explain.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/x",
				"src/explain.tsx",
				220,
				250,
			),
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

		const serialized = JSON.stringify(explanation);
		// Forbidden vocabulary: no runtime behavior claims, no React warnings, no bug/error language
		expect(serialized).not.toMatch(
			/\bbug\b|\bwrong\b|must refactor|runtime (?:behavior|value is (?:missing|absent))|React warning|intended API|root cause|user impact|historically changed|spread (?:contains|expand|does not contain)|controlled\/uncontrolled warning|React controlled/i,
		);
	});

	test("returns null explanation for non-matching ruleId", () => {
		const analyzer = createFormControlSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			jsx("f1", "form", "src/null-explain.tsx", 10, 200),
			jsxAttribute(
				"a1",
				"form",
				"onSubmit",
				"expression",
				"h",
				"src/null-explain.tsx",
				20,
				50,
			),
			jsx("f2", "form", "src/null-explain.tsx", 210, 400),
			jsxAttribute(
				"a2",
				"form",
				"action",
				"literal",
				"/x",
				"src/null-explain.tsx",
				220,
				250,
			),
		]);
		const other = presented({ ...finding!, ruleId: "react/other" });
		expect(analyzer.explain?.(other)).toBeNull();
	});
});

// ── Test harness ─────────────────────────────────────────────────────────────

function runFacts(
	facts: readonly PatternFact[],
	runId = "run-form-control-drift",
): Finding[] {
	const analyzer = createFormControlSurfaceDriftAnalyzer();
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
			commitSha: "sha-form-control-drift",
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
	file = "src/form.tsx",
	start = 10,
	end = 200,
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
	file = "src/form.tsx",
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
