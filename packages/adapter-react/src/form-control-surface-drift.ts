import { createHash } from "node:crypto";
import {
	explainTerm,
	type AdapterMetricEvidence,
	type AnalysisContext,
	type Analyzer,
	type AnalyzerResult,
	type ExplanationEnvelope,
	type Finding,
	type PatternFact,
	type PatternJsxAttributeFact,
	type PatternJsxFact,
	type PresentedFinding,
	type Severity,
	type Span,
} from "@rai/core";

export const FORM_CONTROL_SURFACE_DRIFT_RULE_ID =
	"react/form-control-surface-drift";

// ── Semantic constants (adapter-owned; all HTML/React semantics stay local) ──

const FORM_TAG = "form";
const SUBMIT_HANDLER_ATTR = "onSubmit";
const DECLARATIVE_SUBMIT_ATTRS = new Set(["action", "method"]);

const CONTROL_TAGS = new Set(["input", "select", "textarea"]);

interface ControlBindingPair {
	slot: string;
	controlled: string;
	uncontrolled: string;
	tags: Set<string>;
}

const CONTROL_BINDING_PAIRS: ControlBindingPair[] = [
	{
		slot: "value",
		controlled: "value",
		uncontrolled: "defaultValue",
		// input, select, textarea all support value/defaultValue
		tags: new Set(["input", "select", "textarea"]),
	},
	{
		slot: "checked",
		controlled: "checked",
		uncontrolled: "defaultChecked",
		// Only input supports checked/defaultChecked — select/textarea do not
		tags: new Set(["input"]),
	},
];

export function createFormControlSurfaceDriftAnalyzer(): Analyzer {
	return {
		ruleId: FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeFormControlSurfaceDrift(ctx),
		explain: explainFormControlSurfaceDrift,
	};
}

function analyzeFormControlSurfaceDrift(ctx: AnalysisContext): Finding[] {
	const facts = [...ctx.graph.patternFacts].sort(compareFacts);

	// Partition once into the fact kinds we need
	const jsxFacts = facts.filter(isJsxFact);
	const attrFacts = facts.filter(isJsxAttributeFact);

	// Group by file for per-file analysis
	const files = sortedUnique([
		...jsxFacts.map((f) => f.file),
		...attrFacts.map((f) => f.file),
	]);

	const findings: Finding[] = [];

	for (const file of files) {
		const fileJsx = jsxFacts.filter((f) => f.file === file);
		const fileAttrs = attrFacts.filter((f) => f.file === file);

		const exceeded = computeExceeded(file, fileJsx, fileAttrs);
		if (exceeded.length === 0) continue;

		const divergenceCount = exceeded.length;
		const severity = severityFor(divergenceCount);

		// Collect contributing attribute fact ids for topology
		const contributingAttrIds = collectContributingAttrIds(
			fileAttrs,
			exceeded,
		);
		const contributingJsxIds = collectContributingJsxIds(
			fileJsx,
			exceeded,
		);

		// Primary span: lowest span.start among contributing facts; tie-break by compareFacts
		const primarySpan = primarySpanFor(fileJsx, fileAttrs, exceeded, file);

		// Structural fingerprint: divergence labels + observed attr names (span/id free)
		const divergenceTypes = exceeded
			.map((token) => token.slice(0, token.indexOf(":")))
			.filter((v, i, a) => a.indexOf(v) === i)
			.sort();

		const submitSurfaceNames = sortedUnique([
			...fileAttrs
				.filter((a) => a.name === SUBMIT_HANDLER_ATTR && a.valueKind !== "absent")
				.map(() => SUBMIT_HANDLER_ATTR),
			...fileAttrs
				.filter((a) => DECLARATIVE_SUBMIT_ATTRS.has(a.name))
				.map((a) => a.name),
		]);

		const controlBindingLabels = exceeded
			.filter((t) => t.startsWith("controlBindingSurfaceDrift:"))
			.map((t) => t.slice("controlBindingSurfaceDrift:".length))
			.sort();

		const structuralFp = sha(
			JSON.stringify({
				ruleId: FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
				file,
				divergenceTypes,
				submitSurfaces: submitSurfaceNames,
				controlBindingLabels,
			}),
		);

		const subjectId = `react:form-control-surface:${file}`;
		const findingId = sha(
			[ctx.runId, FORM_CONTROL_SURFACE_DRIFT_RULE_ID, file, structuralFp].join(
				"|",
			),
		);

		// Metrics
		const formJsx = fileJsx.filter((f) => f.tag === FORM_TAG);
		const formAttrs = fileAttrs.filter((a) => a.tag === FORM_TAG);
		const hasSubmitHandler = fileAttrs.some(
			(a) => a.tag === FORM_TAG && a.name === SUBMIT_HANDLER_ATTR && a.valueKind !== "absent",
		);
		const hasDeclarativeSubmit = fileAttrs.some(
			(a) => a.tag === FORM_TAG && DECLARATIVE_SUBMIT_ATTRS.has(a.name),
		);
		const formSubmitSurfaceDrift = exceeded.filter((t) =>
			t.startsWith("formSubmitSurfaceDrift:"),
		).length;
		const controlPairsMixed = exceeded.filter((t) =>
			t.startsWith("controlBindingSurfaceDrift:"),
		).length;

		// All observed control attr names in file
		const controlAttrNames = sortedUnique(
			fileAttrs
				.filter((a) => CONTROL_TAGS.has(a.tag))
				.map((a) => a.name),
		);

		// Roles
		const roles: AdapterMetricEvidence["roles"] = [];
		for (const f of formJsx) {
			roles.push({ role: "form-element", variant: "form", file: f.file });
		}
		for (const a of formAttrs.filter(
			(a) => a.name === SUBMIT_HANDLER_ATTR && a.valueKind !== "absent",
		)) {
			roles.push({
				role: "form-submit-handler",
				variant: SUBMIT_HANDLER_ATTR,
				file: a.file,
			});
		}
		for (const a of formAttrs.filter((a) =>
			DECLARATIVE_SUBMIT_ATTRS.has(a.name),
		)) {
			roles.push({
				role: "form-declarative-submit",
				variant: a.name,
				file: a.file,
			});
		}
		for (const f of fileJsx.filter((f) => CONTROL_TAGS.has(f.tag))) {
			roles.push({
				role: "control-element",
				variant: f.tag,
				file: f.file,
			});
		}
		for (const pair of CONTROL_BINDING_PAIRS) {
			for (const tag of pair.tags) {
				const controlled = fileAttrs.filter(
					(a) => a.tag === tag && a.name === pair.controlled,
				);
				const uncontrolled = fileAttrs.filter(
					(a) => a.tag === tag && a.name === pair.uncontrolled,
				);
				if (controlled.length > 0) {
					for (const a of controlled) {
						roles.push({
							role: "controlled-binding",
							variant: `${tag}:${pair.controlled}`,
							file: a.file,
						});
					}
				}
				if (uncontrolled.length > 0) {
					for (const a of uncontrolled) {
						roles.push({
							role: "uncontrolled-binding",
							variant: `${tag}:${pair.uncontrolled}`,
							file: a.file,
						});
					}
				}
				if (controlled.length > 0 && uncontrolled.length > 0) {
					roles.push({
						role: "control-binding-pair",
						variant: `${tag}:${pair.controlled}/${pair.uncontrolled}`,
						file,
					});
				}
			}
		}

		const evidence: AdapterMetricEvidence = {
			kind: "adapter-metric",
			adapterId: "react",
			ruleId: FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
			subject: {
				id: subjectId,
				name: file,
				file,
				span: primarySpan,
				fingerprint: structuralFp,
			},
			roles: uniqueRoles(roles).sort(compareRoles),
			metrics: {
				forms: formJsx.length,
				formSubmitHandlerSurfaces: hasSubmitHandler ? 1 : 0,
				formDeclarativeSubmitSurfaces: hasDeclarativeSubmit ? 1 : 0,
				formSubmitSurfaceDrift,
				controlBindingPairsMixed: controlPairsMixed,
				controlAttributesObserved: controlAttrNames.length,
				surfaceDivergences: divergenceCount,
			},
			thresholds: {
				minSurfacesForDrift: 2,
				maxFormSubmitSurfaceDrift: 0,
				maxControlBindingPairsMixed: 0,
			},
			topology: {
				directChildIds: sortedUnique(contributingJsxIds),
				reachableNodeIds: sortedUnique(contributingAttrIds),
				exceeded: [...exceeded].sort(),
			},
		};

		findings.push({
			id: findingId,
			ruleId: FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
			type: "opportunity",
			fingerprint: {
				structural: structuralFp,
				nominal: sha(file),
				positional: sha(
					[file, primarySpan.start, primarySpan.end].join("|"),
				),
			},
			analysisVersion: ctx.analysisVersion,
			fpAlgoVersion: 1,
			producingRunId: ctx.runId,
			commitSha: ctx.commitSha,
			severityRaw: severity,
			evidence,
			createdAt: 0,
		});
	}

	return findings.sort(compareFindings);
}

function computeExceeded(
	file: string,
	fileJsx: readonly PatternJsxFact[],
	fileAttrs: readonly PatternJsxAttributeFact[],
): string[] {
	const tokens: string[] = [];

	// Family 1: submit-surface divergence requires >=2 DISTINCT <form> elements
	// where at least one form has a submit-handler surface (onSubmit, non-absent)
	// and at least one DIFFERENT form has a declarative submit surface (action/method).
	// A single <form> carrying both surfaces does NOT satisfy the gate (OQ2: silent).
	// Rationale: drift = divergence BETWEEN elements; a lone dual-surface form is a
	// valid React 19 progressive-enhancement pattern, not an architectural inconsistency.
	const formElements = fileJsx.filter((f) => f.tag === FORM_TAG);
	if (formElements.length >= 2) {
		// Tag each form element with the surfaces it carries
		const formsWithHandler = new Set<string>();
		const formsWithDeclarative = new Set<string>();
		for (const formEl of formElements) {
			for (const a of fileAttrs) {
				if (a.tag !== FORM_TAG) continue;
				if (!spanContains(formEl.span, a.span)) continue;
				if (a.name === SUBMIT_HANDLER_ATTR && a.valueKind !== "absent") {
					formsWithHandler.add(formEl.id);
				}
				if (DECLARATIVE_SUBMIT_ATTRS.has(a.name)) {
					formsWithDeclarative.add(formEl.id);
				}
			}
		}
		// Divergence: handler surface and declarative surface exist on different form elements
		const handlerForms = [...formsWithHandler];
		const declarativeForms = [...formsWithDeclarative];
		const hasCrossFormDivergence = handlerForms.some(
			(id) => !formsWithDeclarative.has(id),
		) || declarativeForms.some(
			(id) => !formsWithHandler.has(id),
		);
		if (handlerForms.length > 0 && declarativeForms.length > 0 && hasCrossFormDivergence) {
			tokens.push(`formSubmitSurfaceDrift:${file}`);
		}
	}

	// Family 2: per (pair, tag) mixed controlled/uncontrolled
	for (const pair of CONTROL_BINDING_PAIRS) {
		for (const tag of pair.tags) {
			// Only native lowercase tags (enforced by CONTROL_TAGS check on jsx facts)
			const hasControlled = fileAttrs.some(
				(a) => a.tag === tag && a.name === pair.controlled,
			);
			const hasUncontrolled = fileAttrs.some(
				(a) => a.tag === tag && a.name === pair.uncontrolled,
			);
			if (hasControlled && hasUncontrolled) {
				tokens.push(
					`controlBindingSurfaceDrift:${tag}:${pair.controlled}/${pair.uncontrolled}`,
				);
			}
		}
	}

	return sortedUnique(tokens);
}

function collectContributingAttrIds(
	fileAttrs: readonly PatternJsxAttributeFact[],
	exceeded: readonly string[],
): string[] {
	const ids: string[] = [];

	if (exceeded.some((t) => t.startsWith("formSubmitSurfaceDrift:"))) {
		// Contributing: onSubmit attrs + action/method attrs on form tags
		for (const a of fileAttrs) {
			if (
				a.tag === FORM_TAG &&
				(a.name === SUBMIT_HANDLER_ATTR || DECLARATIVE_SUBMIT_ATTRS.has(a.name))
			) {
				ids.push(a.id);
			}
		}
	}

	for (const token of exceeded) {
		if (!token.startsWith("controlBindingSurfaceDrift:")) continue;
		const label = token.slice("controlBindingSurfaceDrift:".length);
		const colonIdx = label.indexOf(":");
		const tag = label.slice(0, colonIdx);
		const slashIdx = label.indexOf("/");
		const controlled = label.slice(colonIdx + 1, slashIdx);
		const uncontrolled = label.slice(slashIdx + 1);
		for (const a of fileAttrs) {
			if (a.tag === tag && (a.name === controlled || a.name === uncontrolled)) {
				ids.push(a.id);
			}
		}
	}

	return ids;
}

function collectContributingJsxIds(
	fileJsx: readonly PatternJsxFact[],
	exceeded: readonly string[],
): string[] {
	const ids: string[] = [];

	if (exceeded.some((t) => t.startsWith("formSubmitSurfaceDrift:"))) {
		for (const f of fileJsx) {
			if (f.tag === FORM_TAG) ids.push(f.id);
		}
	}

	for (const token of exceeded) {
		if (!token.startsWith("controlBindingSurfaceDrift:")) continue;
		const label = token.slice("controlBindingSurfaceDrift:".length);
		const tag = label.slice(0, label.indexOf(":"));
		for (const f of fileJsx) {
			if (f.tag === tag) ids.push(f.id);
		}
	}

	return ids;
}

function primarySpanFor(
	fileJsx: readonly PatternJsxFact[],
	fileAttrs: readonly PatternJsxAttributeFact[],
	exceeded: readonly string[],
	file: string,
): Span {
	// Gather contributing facts, pick lowest span.start; tie-break by compareFacts
	const candidates: PatternFact[] = [];

	if (exceeded.some((t) => t.startsWith("formSubmitSurfaceDrift:"))) {
		candidates.push(...fileJsx.filter((f) => f.tag === FORM_TAG));
		candidates.push(
			...fileAttrs.filter(
				(a) =>
					a.tag === FORM_TAG &&
					(a.name === SUBMIT_HANDLER_ATTR ||
						DECLARATIVE_SUBMIT_ATTRS.has(a.name)),
			),
		);
	}

	for (const token of exceeded) {
		if (!token.startsWith("controlBindingSurfaceDrift:")) continue;
		const label = token.slice("controlBindingSurfaceDrift:".length);
		const tag = label.slice(0, label.indexOf(":"));
		const slashIdx = label.indexOf("/");
		const controlled = label.slice(label.indexOf(":") + 1, slashIdx);
		const uncontrolled = label.slice(slashIdx + 1);
		candidates.push(...fileJsx.filter((f) => f.tag === tag));
		candidates.push(
			...fileAttrs.filter(
				(a) =>
					a.tag === tag && (a.name === controlled || a.name === uncontrolled),
			),
		);
	}

	if (candidates.length === 0) {
		// Fallback: first jsx fact in file
		const first = fileJsx[0];
		return first
			? first.span
			: { file, start: 0, end: 0, kind: "jsx", astPath: "" };
	}

	const sorted = [...candidates].sort(compareFacts);
	const byStart = sorted.sort((a, b) => a.span.start - b.span.start);
	return byStart[0]!.span;
}

// ── Explain hook ──────────────────────────────────────────────────────────────
//
// Documented limits (per design §8):
// 1. Syntax-surface observation only — no runtime behavior, React warnings, defects, or required changes.
// 2. Names compared in current source within a single file only.
// 3. parentTag is the immediate lexical parent tag from observed facts; no form-membership resolution.
// 4. All occurrences of `action` attribute treated as one submit surface regardless of valueKind,
//    including React 19 `action={fn}`. No URL-vs-server-action distinction.
// 5. type=hidden and type=submit are NOT excluded from control analysis (OQ4 deferred).
// 6. Spread attributes are ignored by the name filter; no claim about spread contents.

function explainFormControlSurfaceDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== FORM_CONTROL_SURFACE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence;
	const exceeded = evidence.topology.exceeded;
	const file = evidence.subject.file;

	const hasSubmitDrift = exceeded.some((t) =>
		t.startsWith("formSubmitSurfaceDrift:"),
	);
	const controlPairs = exceeded
		.filter((t) => t.startsWith("controlBindingSurfaceDrift:"))
		.map((t) => t.slice("controlBindingSurfaceDrift:".length));

	const summary = summaryFor(file, hasSubmitDrift, controlPairs);
	const groundingFields = Object.keys(evidence).sort();

	return {
		summary,
		whyItMatters:
			"This is worth checking because the observed form and control attribute surfaces in this file are not uniform, which can make the form's submission and control value contract harder to review or maintain consistently.",
		inspectFirst: buildInspectFirst(evidence, hasSubmitDrift, controlPairs),
		limits: [
			"This is a syntax-surface observation only; it does not establish live execution behavior, framework warnings, defects, or any required code change.",
			"RAI only compares observed attribute names in current source within a single file; no cross-file or import resolution is performed.",
			"The parentTag field is the immediate lexical parent tag from observed facts; RAI does not resolve which inputs belong to which form element.",
			"All occurrences of the `action` attribute are treated as one submit surface regardless of valueKind, including React 19 action={fn}; no URL-vs-server-action distinction is made.",
			"Inputs with type=hidden or type=submit are not excluded from control-binding analysis; this is a known documentation-only limitation.",
			"Spread attributes are excluded by the attribute name filter; RAI makes no claim about which names a spread object provides.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function summaryFor(
	file: string,
	hasSubmitDrift: boolean,
	controlPairs: string[],
): string {
	const hasControlDrift = controlPairs.length > 0;

	if (hasSubmitDrift && hasControlDrift) {
		const pairList = formatList(controlPairs);
		return `${file} has observed submit-surface divergence (onSubmit and a declarative submit attribute co-present) and control-binding divergence for ${pairList}.`;
	}
	if (hasSubmitDrift) {
		return `${file} has observed submit-surface divergence: both an onSubmit attribute and a declarative submit attribute (action or method) are present across the file's form elements.`;
	}
	if (controlPairs.length > 1) {
		const pairList = formatList(controlPairs);
		return `${file} has observed control-binding divergence for multiple pairs: ${pairList}.`;
	}
	if (controlPairs.length === 1) {
		return `${file} has observed control-binding divergence: both ${controlPairs[0]} attribute names appear on same-type elements in this file.`;
	}
	return `${file} has observed form control surface divergence.`;
}

function buildInspectFirst(
	evidence: AdapterMetricEvidence,
	hasSubmitDrift: boolean,
	controlPairs: string[],
): string[] {
	const items: string[] = [`${evidence.subject.file}`];

	if (hasSubmitDrift) {
		items.push(
			`submit-surface: onSubmit handler observed: ${(evidence.metrics.formSubmitHandlerSurfaces ?? 0) > 0 ? "yes" : "no"}`,
			`submit-surface: declarative submit attribute (action/method) observed: ${(evidence.metrics.formDeclarativeSubmitSurfaces ?? 0) > 0 ? "yes" : "no"}`,
		);
	}

	if (controlPairs.length > 0) {
		items.push(
			`control-binding pairs with divergence: ${controlPairs.join(", ")}`,
			`control attributes observed: ${evidence.metrics.controlAttributesObserved ?? 0}`,
		);
	}

	items.push(
		`surface divergence signals observed: ${evidence.metrics.surfaceDivergences ?? evidence.topology.exceeded.length}`,
	);

	return items;
}

// ── Fact guards ───────────────────────────────────────────────────────────────

function isJsxFact(fact: PatternFact): fact is PatternJsxFact {
	if (fact.kind !== "jsx") return false;
	// Only native lowercase tags (form, input, select, textarea)
	const tag = (fact as PatternJsxFact).tag;
	return tag === FORM_TAG || CONTROL_TAGS.has(tag);
}

function isJsxAttributeFact(
	fact: PatternFact,
): fact is PatternJsxAttributeFact {
	if (fact.kind !== "jsx-attribute") return false;
	const attr = fact as PatternJsxAttributeFact;
	const tag = attr.tag;
	return tag === FORM_TAG || CONTROL_TAGS.has(tag);
}

// ── Helpers (copied verbatim from P11-S5 convention, ADR-7) ──────────────────

function severityFor(divergenceCount: number): Severity {
	return divergenceCount > 1 ? "warn" : "info";
}

function spanContains(container: Span, child: Span): boolean {
	return (
		container.file === child.file &&
		child.start >= container.start &&
		child.end <= container.end
	);
}

function compareFacts(a: PatternFact, b: PatternFact): number {
	return (
		a.id.localeCompare(b.id) ||
		a.file.localeCompare(b.file) ||
		a.span.start - b.span.start ||
		a.span.end - b.span.end ||
		a.kind.localeCompare(b.kind)
	);
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

function compareFindings(a: Finding, b: Finding): number {
	return (
		a.fingerprint.structural.localeCompare(b.fingerprint.structural) ||
		a.fingerprint.nominal.localeCompare(b.fingerprint.nominal) ||
		a.fingerprint.positional.localeCompare(b.fingerprint.positional)
	);
}

function uniqueRoles(
	roles: AdapterMetricEvidence["roles"],
): AdapterMetricEvidence["roles"] {
	const byKey = new Map<string, AdapterMetricEvidence["roles"][number]>();
	for (const role of roles)
		byKey.set(`${role.role}:${role.variant}:${role.file}`, role);
	return [...byKey.values()];
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort();
}

function formatList(values: readonly string[]): string {
	if (values.length === 0) return "none";
	if (values.length === 1) return values[0]!;
	return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
