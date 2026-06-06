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

export const OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID =
	"react/overlay-control-surface-drift";

// ── Semantic constants (adapter-owned; all overlay/dialog semantics stay local) ──

// Capitalized overlay component tag names (case-sensitive allow-set).
// Lowercase native tags (dialog, select) are NOT included — those are P11-S6 domain.
// Dotted members (Modal.Trigger) do NOT appear here — those are P11-S1 domain.
const OVERLAY_TAGS: ReadonlySet<string> = Object.freeze(
	new Set([
		"Dialog",
		"Modal",
		"Popover",
		"Drawer",
		"Sheet",
		"Tooltip",
		"AlertDialog",
		"HoverCard",
		"DropdownMenu",
		"ContextMenu",
		"Combobox",
		"Select",
	]),
);

// Open-state controlled/uncontrolled pair
const OPEN_STATE = Object.freeze({
	controlled: "open",
	uncontrolled: "defaultOpen",
} as const);

// Handler name allow-set for Gate B. onToggle OMITTED (OQ4 — rare/noisy).
const OVERLAY_HANDLER_NAMES: ReadonlySet<string> = Object.freeze(
	new Set(["onOpenChange", "onClose", "onDismiss"]),
);

export function createOverlayControlSurfaceDriftAnalyzer(): Analyzer {
	return {
		ruleId: OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeOverlayControlSurfaceDrift(ctx),
		explain: explainOverlayControlSurfaceDrift,
	};
}

// ── Core analysis ─────────────────────────────────────────────────────────────
//
// Reads ONLY ctx.graph.patternFacts (jsx + jsx-attribute kinds).
// NEVER reads ctx.graph.components — that is P11-S3's definition-site domain.
// Reading ctx.graph.components would recreate the S3 overlap this analyzer must avoid.

function analyzeOverlayControlSurfaceDrift(ctx: AnalysisContext): Finding[] {
	const facts = [...ctx.graph.patternFacts].sort(compareFacts);

	// Partition into the two fact kinds we need
	const jsxFacts = facts.filter(isJsxFact);
	const attrFacts = facts.filter(isJsxAttributeFact);

	// Per-file analysis (file-scoped, no cross-file correlation)
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

		// Collect contributing ids for topology
		const contributingJsxIds = collectContributingJsxIds(fileJsx, exceeded);
		const contributingAttrIds = collectContributingAttrIds(fileAttrs, exceeded);

		// Primary span: lowest span.start among contributing facts; tie-break by compareFacts
		const primarySpan = primarySpanFor(fileJsx, fileAttrs, exceeded, file);

		// Structural fingerprint inputs (span/id free — stable across pure span shifts)
		const divergenceTypes = exceeded
			.map((token) => token.slice(0, token.indexOf(":")))
			.filter((v, i, a) => a.indexOf(v) === i)
			.sort();

		const observedOverlayTags = sortedUnique(fileJsx.map((f) => f.tag));

		const divergentAttrNames = sortedUnique([
			...fileAttrs
				.filter(
					(a) =>
						a.name === OPEN_STATE.controlled || a.name === OPEN_STATE.uncontrolled,
				)
				.map((a) => a.name),
			...fileAttrs
				.filter((a) => OVERLAY_HANDLER_NAMES.has(a.name))
				.map((a) => a.name),
		]);

		const structuralFp = sha(
			JSON.stringify({
				ruleId: OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
				file,
				divergenceTypes,
				observedOverlayTags,
				divergentAttrNames,
			}),
		);

		const subjectId = `react:overlay-control-surface:${file}`;
		const findingId = sha(
			[
				ctx.runId,
				OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
				file,
				structuralFp,
			].join("|"),
		);

		// Roles
		const roles: AdapterMetricEvidence["roles"] = [];
		for (const f of fileJsx) {
			roles.push({ role: "overlay-element", variant: f.tag, file: f.file });
		}
		for (const a of fileAttrs.filter(
			(attr) =>
				attr.name === OPEN_STATE.controlled ||
				attr.name === OPEN_STATE.uncontrolled,
		)) {
			roles.push({
				role: "open-state-binding",
				variant: a.name,
				file: a.file,
			});
		}
		for (const a of fileAttrs.filter((attr) =>
			OVERLAY_HANDLER_NAMES.has(attr.name),
		)) {
			roles.push({ role: "handler-binding", variant: a.name, file: a.file });
		}

		const evidence: AdapterMetricEvidence = {
			kind: "adapter-metric",
			adapterId: "react",
			ruleId: OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
			subject: {
				id: subjectId,
				name: file,
				file,
				span: primarySpan,
				fingerprint: structuralFp,
			},
			roles: uniqueRoles(roles).sort(compareRoles),
			metrics: {
				overlayElements: fileJsx.length,
				divergenceSignals: divergenceCount,
				observedOverlayTagCount: observedOverlayTags.length,
				divergentAttrCount: divergentAttrNames.length,
			},
			thresholds: {
				minOverlayElementsForDrift: 2,
				maxDivergenceSignals: 0,
			},
			topology: {
				directChildIds: sortedUnique(contributingJsxIds),
				reachableNodeIds: sortedUnique(contributingAttrIds),
				exceeded: [...exceeded].sort(),
			},
		};

		findings.push({
			id: findingId,
			ruleId: OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
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

// ── computeExceeded ───────────────────────────────────────────────────────────
//
// Gate A (cross-element open-state): one overlay element carries `open`
// (valueKind != "absent") AND a DIFFERENT overlay element carries `defaultOpen`.
// A single element with both does NOT satisfy Gate A.
//
// Gate B (handler-name): >=2 distinct overlay elements use >= 2 distinct handler
// tokens from OVERLAY_HANDLER_NAMES, where at least two of those elements each
// contribute a different token from each other.
//
// CRITICAL: ctx.graph.components is NEVER read here (P11-S3 non-overlap constraint).

function computeExceeded(
	file: string,
	fileJsx: readonly PatternJsxFact[],
	fileAttrs: readonly PatternJsxAttributeFact[],
): string[] {
	const tokens: string[] = [];

	// Must have at least 2 distinct overlay elements for either gate to fire
	if (fileJsx.length < 2) return tokens;

	// Gate A: cross-element open-state divergence via spanContains
	// Build per-element sets of open-state attribute names
	const elsWithOpen = new Set<string>(); // element ids that have `open` (any valueKind counts — P11-S6 precedent)
	const elsWithDefaultOpen = new Set<string>(); // element ids that have `defaultOpen`

	for (const el of fileJsx) {
		for (const a of fileAttrs) {
			if (!spanContains(el.span, a.span)) continue;
			if (a.name === OPEN_STATE.controlled) {
				elsWithOpen.add(el.id);
			}
			if (a.name === OPEN_STATE.uncontrolled) {
				elsWithDefaultOpen.add(el.id);
			}
		}
	}

	// Cross-element: exists at least one element with `open` AND a DIFFERENT
	// element with `defaultOpen`. Single element with both does NOT satisfy this.
	const crossA = [...elsWithOpen].some((id) => {
		// There must be some element with defaultOpen that is NOT this same element
		return [...elsWithDefaultOpen].some((did) => did !== id);
	});

	if (crossA) {
		tokens.push(`openStateSurfaceDrift:${file}`);
	}

	// Gate B: handler-name divergence
	// Build per-element set of handler tokens they contribute
	const handlersByEl = new Map<string, Set<string>>(); // elId -> Set of handler names
	for (const el of fileJsx) {
		for (const a of fileAttrs) {
			if (!OVERLAY_HANDLER_NAMES.has(a.name)) continue;
			if (a.valueKind === "absent") continue;
			if (!spanContains(el.span, a.span)) continue;
			if (!handlersByEl.has(el.id)) handlersByEl.set(el.id, new Set());
			handlersByEl.get(el.id)!.add(a.name);
		}
	}

	// Distinct overlay elements with at least 1 handler token
	const distinctEls = [...handlersByEl.entries()].filter(
		([, tokens]) => tokens.size > 0,
	);

	// Collect all distinct handler tokens across contributing elements
	const allTokens = new Set<string>();
	for (const [, set] of distinctEls) {
		for (const t of set) allTokens.add(t);
	}

	// Gate B fires when: >=2 distinct overlay elements contribute handlers AND
	// >=2 distinct handler tokens exist AND at least 2 distinct elements contribute
	// different tokens (i.e. not all elements use the same single token).
	if (distinctEls.length >= 2 && allTokens.size >= 2) {
		// Verify that at least two elements have non-identical token sets
		// (prevents uniform onOpenChange+onClose on all elements from firing the gate
		// unless the TOKENS themselves are different between elements)
		const tokenSets = distinctEls.map(([, set]) => [...set].sort().join(","));
		const uniqueTokenSets = new Set(tokenSets);
		if (uniqueTokenSets.size >= 2) {
			tokens.push(`handlerNameSurfaceDrift:${file}`);
		} else {
			// Even if all token sets are identical, if any two elements contribute
			// different token subsets together we still fire.
			// But: if all elements have the exact same token set, tokens are uniform → silent.
			// (Already handled by uniqueTokenSets.size check above.)
			// Fallback: if all elements contribute the same unique handler (size=1 each),
			// the allTokens.size >= 2 guard above ensures we need >=2 distinct token names.
		}
	}

	return sortedUnique(tokens);
}

// ── Contributing id collectors ────────────────────────────────────────────────

function collectContributingJsxIds(
	fileJsx: readonly PatternJsxFact[],
	exceeded: readonly string[],
): string[] {
	// For overlay analyzer, all overlay JSX elements in the file contribute
	if (exceeded.length === 0) return [];
	return fileJsx.map((f) => f.id);
}

function collectContributingAttrIds(
	fileAttrs: readonly PatternJsxAttributeFact[],
	exceeded: readonly string[],
): string[] {
	const ids: string[] = [];
	if (exceeded.length === 0) return ids;

	const hasOpenState = exceeded.some((t) => t.startsWith("openStateSurfaceDrift:"));
	const hasHandlers = exceeded.some((t) => t.startsWith("handlerNameSurfaceDrift:"));

	for (const a of fileAttrs) {
		if (hasOpenState && (a.name === OPEN_STATE.controlled || a.name === OPEN_STATE.uncontrolled)) {
			ids.push(a.id);
		}
		if (hasHandlers && OVERLAY_HANDLER_NAMES.has(a.name)) {
			ids.push(a.id);
		}
	}

	return ids;
}

// ── Primary span ──────────────────────────────────────────────────────────────

function primarySpanFor(
	fileJsx: readonly PatternJsxFact[],
	fileAttrs: readonly PatternJsxAttributeFact[],
	exceeded: readonly string[],
	file: string,
): Span {
	const candidates: PatternFact[] = [];

	const hasOpenState = exceeded.some((t) => t.startsWith("openStateSurfaceDrift:"));
	const hasHandlers = exceeded.some((t) => t.startsWith("handlerNameSurfaceDrift:"));

	candidates.push(...fileJsx);

	if (hasOpenState) {
		candidates.push(
			...fileAttrs.filter(
				(a) =>
					a.name === OPEN_STATE.controlled ||
					a.name === OPEN_STATE.uncontrolled,
			),
		);
	}

	if (hasHandlers) {
		candidates.push(
			...fileAttrs.filter((a) => OVERLAY_HANDLER_NAMES.has(a.name)),
		);
	}

	if (candidates.length === 0) {
		const first = fileJsx[0];
		return first
			? first.span
			: { file, start: 0, end: 0, kind: "jsx", astPath: "" };
	}

	const sorted = [...candidates].sort(compareFacts);
	const byStart = [...sorted].sort((a, b) => a.span.start - b.span.start);
	return byStart[0]!.span;
}

// ── Explain hook ──────────────────────────────────────────────────────────────
//
// Documented limits (design §8):
// 1. Observes only the literal overlay tag names and attribute names as written in the source.
//    Does not describe how overlay components behave when the app is running, whether any
//    panel opens, portal or focus-trap effect.
// 2. Makes no claim about accessibility, ARIA roles, or keyboard interaction.
// 3. Does not identify which UI library the tag names or handler names belong to, nor whether
//    the observed names are correct for any particular version.
// 4. Does not assert that the observed attribute names interact, override, or conflict with
//    one another, nor does it indicate a defect; names are compared in current source only.
// 5. Makes no claim about intent, underlying cause, or remediation; finding is file-scoped and
//    no code change is required or implied.

function explainOverlayControlSurfaceDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence;
	const exceeded = evidence.topology.exceeded;
	const file = evidence.subject.file;

	const hasOpenState = exceeded.some((t) => t.startsWith("openStateSurfaceDrift:"));
	const hasHandlers = exceeded.some((t) => t.startsWith("handlerNameSurfaceDrift:"));

	const summary = buildSummary(file, hasOpenState, hasHandlers);
	const groundingFields = Object.keys(evidence).sort();

	return {
		summary,
		whyItMatters:
			"This is worth reviewing because the observed overlay component attribute names in this file are not uniform, which can make the open-state and handler contract of the overlay usage harder to review consistently.",
		inspectFirst: buildInspectFirst(evidence, hasOpenState, hasHandlers),
		limits: [
			"RAI observes only the literal overlay tag names and attribute names as written in the source; it does not describe how these components behave when the app is running, whether any panel opens, or the portal and focus-trap effects.",
			"RAI makes no claim about accessibility, ARIA roles, or keyboard interaction.",
			"RAI does not identify which UI library the observed tag names or handler names belong to, nor whether the observed names are the correct API for any particular version.",
			"RAI does not assert that the observed attribute names interact, override, or indicate a defect; names are compared in current source only.",
			"RAI makes no claim about intent, underlying cause, or remediation; this finding is file-scoped and no code change is required or implied.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

function buildSummary(
	file: string,
	hasOpenState: boolean,
	hasHandlers: boolean,
): string {
	if (hasOpenState && hasHandlers) {
		return `${file} has observed overlay open-state attribute divergence (open and defaultOpen on distinct overlay elements) and handler-name divergence across overlay elements in this file.`;
	}
	if (hasOpenState) {
		return `${file} has observed overlay open-state attribute divergence: open and defaultOpen attribute names appear on distinct overlay elements in this file.`;
	}
	if (hasHandlers) {
		return `${file} has observed overlay handler-name divergence: distinct overlay elements use different handler attribute names in this file.`;
	}
	return `${file} has observed overlay control surface divergence.`;
}

function buildInspectFirst(
	evidence: AdapterMetricEvidence,
	hasOpenState: boolean,
	hasHandlers: boolean,
): string[] {
	const items: string[] = [`${evidence.subject.file}`];

	if (hasOpenState) {
		items.push(
			`open-state: observed open and defaultOpen on distinct overlay elements`,
		);
	}

	if (hasHandlers) {
		items.push(
			`handler-name: distinct overlay elements use different handler attribute names`,
		);
	}

	items.push(
		`overlay elements observed: ${(evidence.metrics.overlayElements as number) ?? 0}`,
		`divergence signals observed: ${(evidence.metrics.divergenceSignals as number) ?? evidence.topology.exceeded.length}`,
	);

	return items;
}

// ── Fact guards ───────────────────────────────────────────────────────────────

function isJsxFact(fact: PatternFact): fact is PatternJsxFact {
	if (fact.kind !== "jsx") return false;
	const tag = (fact as PatternJsxFact).tag;
	// Only capitalized, non-dotted overlay tags (case-sensitive allow-set)
	return OVERLAY_TAGS.has(tag);
}

function isJsxAttributeFact(fact: PatternFact): fact is PatternJsxAttributeFact {
	if (fact.kind !== "jsx-attribute") return false;
	const attr = fact as PatternJsxAttributeFact;
	// Attribute must be on an overlay tag and be one of the tracked attribute names
	return (
		OVERLAY_TAGS.has(attr.tag) &&
		(attr.name === OPEN_STATE.controlled ||
			attr.name === OPEN_STATE.uncontrolled ||
			OVERLAY_HANDLER_NAMES.has(attr.name))
	);
}

// ── Helpers (mirror P11-S6 convention) ───────────────────────────────────────

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

function sha(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
