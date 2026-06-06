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
	OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
	createOverlayControlSurfaceDriftAnalyzer,
} from "./overlay-control-surface-drift.js";

describe("overlay control surface drift analyzer", () => {
	// ── Gate A: open-state cross-element divergence ───────────────────────────

	test("Gate A EMITS info: <Dialog open> + distinct <Popover defaultOpen>", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/layout.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/layout.tsx", 20, 50),
			jsx("p1", "Popover", "src/layout.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/layout.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding).toMatchObject({
			ruleId: OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			severityRaw: "info",
		});
		const evidence = adapterEvidence(finding!);
		expect(evidence.topology.exceeded).toContain(
			`openStateSurfaceDrift:src/layout.tsx`,
		);
	});

	test("Gate A EMITS info: <Modal open> + distinct <Drawer defaultOpen>", () => {
		const findings = runFacts([
			jsx("m1", "Modal", "src/ui.tsx", 10, 200),
			jsxAttribute("a1", "Modal", "open", "literal", "true", "src/ui.tsx", 20, 50),
			jsx("dr1", "Drawer", "src/ui.tsx", 210, 400),
			jsxAttribute("a2", "Drawer", "defaultOpen", "expression", "isOpen", "src/ui.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			`openStateSurfaceDrift:src/ui.tsx`,
		);
	});

	test("Gate A: bare open (valueKind absent) on one element + defaultOpen on distinct element EMITS", () => {
		// P11-S6 precedent: absent valueKind still counts for the controlled side
		const findings = runFacts([
			jsx("d1", "Dialog", "src/bare.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "absent", "", "src/bare.tsx", 20, 50),
			jsx("p1", "Popover", "src/bare.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "false", "src/bare.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			`openStateSurfaceDrift:src/bare.tsx`,
		);
	});

	// ── Gate A SILENT: single element with both ───────────────────────────────

	test("Gate A SILENT: single <Dialog open defaultOpen> — cross-element required", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/single.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/single.tsx", 20, 50),
			jsxAttribute("a2", "Dialog", "defaultOpen", "literal", "true", "src/single.tsx", 60, 90),
		]);

		expect(findings).toEqual([]);
	});

	test("Gate A SILENT: uniform open-only across two overlays", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/uniform.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen1", "src/uniform.tsx", 20, 50),
			jsx("p1", "Popover", "src/uniform.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "open", "expression", "isOpen2", "src/uniform.tsx", 220, 250),
		]);

		expect(findings).toEqual([]);
	});

	// ── Gate B: handler-name divergence ──────────────────────────────────────

	test("Gate B EMITS info: <Dialog onOpenChange> + distinct <Drawer onClose>", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/handlers.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "onOpenChange", "expression", "setOpen", "src/handlers.tsx", 20, 50),
			jsx("dr1", "Drawer", "src/handlers.tsx", 210, 400),
			jsxAttribute("a2", "Drawer", "onClose", "expression", "handleClose", "src/handlers.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			`handlerNameSurfaceDrift:src/handlers.tsx`,
		);
	});

	test("Gate B EMITS info: <AlertDialog onOpenChange> + distinct <Sheet onDismiss>", () => {
		const findings = runFacts([
			jsx("al1", "AlertDialog", "src/alert.tsx", 10, 200),
			jsxAttribute("a1", "AlertDialog", "onOpenChange", "expression", "handler", "src/alert.tsx", 20, 50),
			jsx("sh1", "Sheet", "src/alert.tsx", 210, 400),
			jsxAttribute("a2", "Sheet", "onDismiss", "expression", "dismiss", "src/alert.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(
			`handlerNameSurfaceDrift:src/alert.tsx`,
		);
	});

	test("Gate B SILENT: uniform single handler across overlays (need >=2 distinct tokens)", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/uniform-handler.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "onOpenChange", "expression", "setOpen1", "src/uniform-handler.tsx", 20, 50),
			jsx("p1", "Popover", "src/uniform-handler.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "onOpenChange", "expression", "setOpen2", "src/uniform-handler.tsx", 220, 250),
		]);

		expect(findings).toEqual([]);
	});

	// ── Both gates fire → severity warn ──────────────────────────────────────

	test("both Gate A and Gate B fire → severity warn, exceeded.length === 2", () => {
		const findings = runFacts([
			// Gate A: Dialog open + Popover defaultOpen
			jsx("d1", "Dialog", "src/both.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/both.tsx", 20, 50),
			jsx("p1", "Popover", "src/both.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/both.tsx", 220, 250),
			// Gate B: Dialog onOpenChange + Drawer onClose
			jsx("dr1", "Drawer", "src/both.tsx", 410, 600),
			jsxAttribute("a3", "Dialog", "onOpenChange", "expression", "setOpen", "src/both.tsx", 30, 55),
			jsxAttribute("a4", "Drawer", "onClose", "expression", "handleClose", "src/both.tsx", 420, 450),
		]);

		expect(findings).toHaveLength(1);
		expect(findings[0]!.severityRaw).toBe("warn");
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toHaveLength(2);
		expect(evidence.topology.exceeded).toContain(`openStateSurfaceDrift:src/both.tsx`);
		expect(evidence.topology.exceeded).toContain(`handlerNameSurfaceDrift:src/both.tsx`);
	});

	// ── Non-overlap with S3 (CRITICAL acceptance criterion) ──────────────────

	test("NON-OVERLAP S3: component declares open+defaultOpen in propNames but <2 overlay JSX usages → SILENT", () => {
		// This proves the analyzer NEVER reads ctx.graph.components.
		// The propNames are only in graph.components (S3 definition-site domain).
		// We provide a graph.components entry with open+defaultOpen but
		// no (or fewer than 2) overlay JSX facts → analyzer must stay silent.
		const findings = runFacts(
			[
				// Only ONE overlay JSX fact — not enough for Gate A cross-element
				jsx("d1", "Dialog", "src/comp.tsx", 10, 200),
				jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/comp.tsx", 20, 50),
			],
			"run-nonoverlap",
			// Pass graph.components with propNames to tempt the analyzer
			[{ name: "MyComponent", propNames: ["open", "defaultOpen"], file: "src/comp.tsx" }],
		);

		expect(findings).toEqual([]);
	});

	test("NON-OVERLAP S3: zero overlay JSX usages (propNames only) → SILENT", () => {
		const findings = runFacts(
			[],
			"run-nonoverlap-zero",
			[{ name: "MyComp", propNames: ["open", "defaultOpen"], file: "src/comp2.tsx" }],
		);

		expect(findings).toEqual([]);
	});

	// ── Domain silencing: lowercase native tags ───────────────────────────────

	test("lowercase <dialog> tag (native HTML) — SILENT (S6 domain)", () => {
		const findings = runFacts([
			jsx("d1", "dialog", "src/native.tsx", 10, 200),
			jsxAttribute("a1", "dialog", "open", "absent", "", "src/native.tsx", 20, 50),
			jsx("d2", "dialog", "src/native.tsx", 210, 400),
			jsxAttribute("a2", "dialog", "defaultOpen", "literal", "true", "src/native.tsx", 220, 250),
		]);

		expect(findings).toEqual([]);
	});

	test("lowercase <select> tag — SILENT (S6 domain)", () => {
		const findings = runFacts([
			jsx("s1", "select", "src/native2.tsx", 10, 200),
			jsxAttribute("a1", "select", "open", "expression", "isOpen", "src/native2.tsx", 20, 50),
			jsx("s2", "select", "src/native2.tsx", 210, 400),
			jsxAttribute("a2", "select", "defaultOpen", "literal", "true", "src/native2.tsx", 220, 250),
		]);

		expect(findings).toEqual([]);
	});

	// ── Domain silencing: dotted compound member tags ─────────────────────────

	test("dotted <Modal.Trigger> tag — SILENT (S1 domain, not in OVERLAY_TAGS)", () => {
		const findings = runFacts([
			jsx("mt1", "Modal.Trigger", "src/compound.tsx", 10, 200),
			jsxAttribute("a1", "Modal.Trigger", "open", "expression", "isOpen", "src/compound.tsx", 20, 50),
			jsx("mt2", "Modal.Content", "src/compound.tsx", 210, 400),
			jsxAttribute("a2", "Modal.Content", "defaultOpen", "literal", "true", "src/compound.tsx", 220, 250),
		]);

		expect(findings).toEqual([]);
	});

	// ── <2 overlay elements → SILENT ─────────────────────────────────────────

	test("fewer than 2 overlay elements — SILENT", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/single-el.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/single-el.tsx", 20, 50),
			jsxAttribute("a2", "Dialog", "defaultOpen", "literal", "true", "src/single-el.tsx", 60, 90),
			jsxAttribute("a3", "Dialog", "onOpenChange", "expression", "setOpen", "src/single-el.tsx", 95, 130),
			jsxAttribute("a4", "Dialog", "onClose", "expression", "handleClose", "src/single-el.tsx", 135, 170),
		]);

		// Only one overlay element → Gate A and Gate B both require >=2 distinct overlay elements
		expect(findings).toEqual([]);
	});

	test("no overlay tags at all — SILENT", () => {
		const findings = runFacts([
			jsx("d1", "div", "src/no-overlay.tsx", 10, 200),
			jsxAttribute("a1", "div", "open", "expression", "isOpen", "src/no-overlay.tsx", 20, 50),
		]);

		expect(findings).toEqual([]);
	});

	// ── Cross-file isolation ──────────────────────────────────────────────────

	test("cross-file: Dialog open in file-a, Popover defaultOpen in file-b — SILENT per file", () => {
		const findings = runFacts([
			jsx("d1", "Dialog", "src/file-a.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/file-a.tsx", 20, 50),
			jsx("p1", "Popover", "src/file-b.tsx", 10, 200),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/file-b.tsx", 20, 50),
		]);

		expect(findings).toEqual([]);
	});

	// ── OVERLAY_TAGS membership ───────────────────────────────────────────────

	test("Select (capitalized) is in OVERLAY_TAGS — EMITS when cross-element drift", () => {
		// Select the overlay component (Radix/shadcn), NOT native select
		const findings = runFacts([
			jsx("sel1", "Select", "src/sel.tsx", 10, 200),
			jsxAttribute("a1", "Select", "open", "expression", "isOpen", "src/sel.tsx", 20, 50),
			jsx("cmb1", "Combobox", "src/sel.tsx", 210, 400),
			jsxAttribute("a2", "Combobox", "defaultOpen", "literal", "true", "src/sel.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
	});

	test("HoverCard, DropdownMenu, ContextMenu are in OVERLAY_TAGS", () => {
		const findings = runFacts([
			jsx("hc1", "HoverCard", "src/menus.tsx", 10, 200),
			jsxAttribute("a1", "HoverCard", "onOpenChange", "expression", "setOpen", "src/menus.tsx", 20, 50),
			jsx("dm1", "DropdownMenu", "src/menus.tsx", 210, 400),
			jsxAttribute("a2", "DropdownMenu", "onClose", "expression", "handleClose", "src/menus.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
		const evidence = adapterEvidence(findings[0]!);
		expect(evidence.topology.exceeded).toContain(`handlerNameSurfaceDrift:src/menus.tsx`);
	});

	test("ContextMenu onDismiss vs DropdownMenu onOpenChange — Gate B EMITS", () => {
		const findings = runFacts([
			jsx("cm1", "ContextMenu", "src/ctx.tsx", 10, 200),
			jsxAttribute("a1", "ContextMenu", "onDismiss", "expression", "dismiss", "src/ctx.tsx", 20, 50),
			jsx("dm1", "DropdownMenu", "src/ctx.tsx", 210, 400),
			jsxAttribute("a2", "DropdownMenu", "onOpenChange", "expression", "setOpen", "src/ctx.tsx", 220, 250),
		]);

		expect(findings).toHaveLength(1);
	});

	// ── Determinism ───────────────────────────────────────────────────────────

	test("determinism: forward vs reversed fact order produces identical findings", () => {
		const facts = [
			jsx("d1", "Dialog", "src/det.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/det.tsx", 20, 50),
			jsx("p1", "Popover", "src/det.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/det.tsx", 220, 250),
		];

		const first = normalize(runFacts(facts, "run-det"));
		const second = normalize(runFacts([...facts].reverse(), "run-det"));

		expect(first).toEqual(second);
		expect(first).toHaveLength(1);
	});

	// ── Fingerprint stability ─────────────────────────────────────────────────

	test("structural fingerprint is stable across a pure span shift (positional differs)", () => {
		const baseline = runFacts([
			jsx("d1", "Dialog", "src/shift.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/shift.tsx", 20, 50),
			jsx("p1", "Popover", "src/shift.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/shift.tsx", 220, 250),
		]);

		const shifted = runFacts([
			jsx("d1", "Dialog", "src/shift.tsx", 510, 700),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/shift.tsx", 520, 550),
			jsx("p1", "Popover", "src/shift.tsx", 710, 900),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/shift.tsx", 720, 750),
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
			jsx("d1", "Dialog", "src/frozen.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/frozen.tsx", 20, 50),
			jsx("p1", "Popover", "src/frozen.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/frozen.tsx", 220, 250),
		]);
		const before = JSON.stringify(facts);

		const findings = runFacts(facts as PatternFact[]);

		expect(findings).toHaveLength(1);
		expect(JSON.stringify(facts)).toBe(before);
	});

	// ── Explain: forbidden vocabulary + null for other ruleId ────────────────

	test("explain returns bounded language — forbidden-vocab not.toMatch", () => {
		const analyzer = createOverlayControlSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			jsx("d1", "Dialog", "src/explain.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/explain.tsx", 20, 50),
			jsx("p1", "Popover", "src/explain.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/explain.tsx", 220, 250),
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
		expect(serialized).not.toMatch(
			/\bbug\b|\bwrong\b|must (?:refactor|migrate)|will conflict|runtime behavior|two libraries|React warning|you should|root cause/i,
		);
	});

	test("explain returns null for non-matching ruleId", () => {
		const analyzer = createOverlayControlSurfaceDriftAnalyzer();
		const [finding] = runFacts([
			jsx("d1", "Dialog", "src/null-explain.tsx", 10, 200),
			jsxAttribute("a1", "Dialog", "open", "expression", "isOpen", "src/null-explain.tsx", 20, 50),
			jsx("p1", "Popover", "src/null-explain.tsx", 210, 400),
			jsxAttribute("a2", "Popover", "defaultOpen", "literal", "true", "src/null-explain.tsx", 220, 250),
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
	runId = "run-overlay-control-drift",
	components: GraphComponent[] = [],
): Finding[] {
	const analyzer = createOverlayControlSurfaceDriftAnalyzer();
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
			commitSha: "sha-overlay-control-drift",
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
	file = "src/overlay.tsx",
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
	file = "src/overlay.tsx",
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
