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

export const DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID =
	"react/design-system-usage-surface-drift";

// ── Semantic constants (adapter-owned; all styling-prop semantics stay local) ─
//
// Variant/style prop sets are disjoint. These sets are frozen at definition.
// Prop-set additions require future calibration (OQ4 — no ad-hoc broadening).

const VARIANT_PROPS: ReadonlySet<string> = Object.freeze(
	new Set(["variant", "size", "color", "tone", "intent", "appearance"]),
);

const RAW_STYLE_PROPS: ReadonlySet<string> = Object.freeze(
	new Set(["className", "style"]),
);

export function createDesignSystemUsageSurfaceDriftAnalyzer(): Analyzer {
	return {
		ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
		framework: "react",
		analyze: (ctx: AnalysisContext): AnalyzerResult =>
			analyzeDesignSystemUsageSurfaceDrift(ctx),
		explain: explainDesignSystemUsageSurfaceDrift,
	};
}

// ── Core analysis ─────────────────────────────────────────────────────────────
//
// Reads ONLY ctx.graph.patternFacts (jsx + jsx-attribute kinds).
// NEVER reads ctx.graph.components — that is P11-S3's definition-site domain.
// Reading ctx.graph.components would recreate the S3 overlap this analyzer must avoid.
// DO NOT import ComponentNode — non-overlap constraint enforced by no-import.

function analyzeDesignSystemUsageSurfaceDrift(ctx: AnalysisContext): Finding[] {
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

		// Extract divergent tags from token set (strip exact `:${file}` suffix — colon-safe)
		const divergentTags = exceeded
			.map((token) => {
				// Token format: stylingVariantSurfaceDrift:{tag}:{file}
				// Strip the prefix and then the exact file suffix (colon-safe)
				const withoutPrefix = token.startsWith("stylingVariantSurfaceDrift:")
					? token.slice("stylingVariantSurfaceDrift:".length)
					: token;
				// Strip the exact `:${file}` suffix
				const fileSuffix = `:${file}`;
				return withoutPrefix.endsWith(fileSuffix)
					? withoutPrefix.slice(0, withoutPrefix.length - fileSuffix.length)
					: withoutPrefix;
			})
			.filter((v, i, a) => a.indexOf(v) === i)
			.sort();

		// Collect observed variant/raw prop names across contributing attribute facts
		const observedVariantProps = sortedUnique(
			fileAttrs
				.filter((a) => VARIANT_PROPS.has(a.name) && divergentTags.includes(a.tag))
				.map((a) => a.name),
		);
		const observedRawProps = sortedUnique(
			fileAttrs
				.filter((a) => RAW_STYLE_PROPS.has(a.name) && divergentTags.includes(a.tag))
				.map((a) => a.name),
		);

		const divergenceTypes = exceeded
			.map((token) => token.slice(0, token.indexOf(":")))
			.filter((v, i, a) => a.indexOf(v) === i)
			.sort();

		// Structural fingerprint (span/id free — stable across pure span shifts)
		const structuralFp = sha(
			JSON.stringify({
				ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
				file,
				divergenceTypes,
				divergentTags,
				observedVariantProps,
				observedRawProps,
			}),
		);

		// Primary span: lowest span.start among contributing jsx facts for divergent tags
		const primarySpan = primarySpanFor(fileJsx, fileAttrs, divergentTags, file);

		const subjectId = `react:design-system-usage-surface:${file}`;
		const findingId = sha(
			[
				ctx.runId,
				DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
				file,
				structuralFp,
			].join("|"),
		);

		// Roles: contributing jsx elements and their variant/raw attributes
		const roles: AdapterMetricEvidence["roles"] = [];
		for (const f of fileJsx.filter((f) => divergentTags.includes(f.tag))) {
			roles.push({ role: "ds-element", variant: f.tag, file: f.file });
		}
		for (const a of fileAttrs.filter(
			(attr) => VARIANT_PROPS.has(attr.name) && divergentTags.includes(attr.tag),
		)) {
			roles.push({ role: "variant-prop-binding", variant: a.name, file: a.file });
		}
		for (const a of fileAttrs.filter(
			(attr) => RAW_STYLE_PROPS.has(attr.name) && divergentTags.includes(attr.tag),
		)) {
			roles.push({ role: "raw-style-binding", variant: a.name, file: a.file });
		}

		const evidence: AdapterMetricEvidence = {
			kind: "adapter-metric",
			adapterId: "react",
			ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
			subject: {
				id: subjectId,
				name: file,
				file,
				span: primarySpan,
				fingerprint: structuralFp,
			},
			roles: uniqueRoles(roles).sort(compareRoles),
			metrics: {
				divergenceCount,
				observedVariantPropCount: observedVariantProps.length,
				observedRawPropCount: observedRawProps.length,
				divergentTagCount: divergentTags.length,
			},
			thresholds: {
				minUsagesPerTagForDrift: 2,
				maxDivergenceSignals: 0,
			},
			topology: {
				directChildIds: sortedUnique(
					fileJsx
						.filter((f) => divergentTags.includes(f.tag))
						.map((f) => f.id),
				),
				reachableNodeIds: sortedUnique(
					fileAttrs
						.filter(
							(a) =>
								(VARIANT_PROPS.has(a.name) || RAW_STYLE_PROPS.has(a.name)) &&
								divergentTags.includes(a.tag),
						)
						.map((a) => a.id),
				),
				exceeded: [...exceeded].sort(),
			},
		};

		findings.push({
			id: findingId,
			ruleId: DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID,
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
// Per file, per tag T (capitalized non-dotted): fire when
//   >= 2 distinct usages of T
//   AND some usage has a VARIANT_PROP (hasVariant)
//   AND some usage has a RAW_STYLE_PROP (hasRaw)
//   AND (>=1 usage has variant-without-raw OR >=1 usage has raw-without-variant).
// A single usage carrying BOTH does NOT alone fire.
// A single element with both and another element with nothing is also SILENT.
//
// CRITICAL: ctx.graph.components is NEVER read here (P11-S3 non-overlap constraint).

function computeExceeded(
	file: string,
	fileJsx: readonly PatternJsxFact[],
	fileAttrs: readonly PatternJsxAttributeFact[],
): string[] {
	// Group jsx usages by tag (each usage = one jsx fact)
	const usagesByTag = new Map<string, PatternJsxFact[]>();
	for (const el of fileJsx) {
		if (!usagesByTag.has(el.tag)) usagesByTag.set(el.tag, []);
		usagesByTag.get(el.tag)!.push(el);
	}

	const tokens: string[] = [];

	for (const [tag, usages] of usagesByTag) {
		// Must have at least 2 distinct usages of this tag
		if (usages.length < 2) continue;

		// Per-usage: determine which prop categories it carries via spanContains
		// Bare variant (valueKind absent) counts as present (OQ3)
		interface UsageSurface {
			hasVariant: boolean;
			hasRaw: boolean;
		}
		const surfaces: UsageSurface[] = usages.map((el) => {
			let hasVariant = false;
			let hasRaw = false;
			for (const a of fileAttrs) {
				if (!spanContains(el.span, a.span)) continue;
				if (VARIANT_PROPS.has(a.name)) hasVariant = true;
				if (RAW_STYLE_PROPS.has(a.name)) hasRaw = true;
			}
			return { hasVariant, hasRaw };
		});

		// Gate: some usage hasVariant AND some usage hasRaw
		const someVariant = surfaces.some((s) => s.hasVariant);
		const someRaw = surfaces.some((s) => s.hasRaw);
		if (!someVariant || !someRaw) continue;

		// Cross-usage divergence: >=1 variant-without-raw OR >=1 raw-without-variant
		const hasVariantOnly = surfaces.some((s) => s.hasVariant && !s.hasRaw);
		const hasRawOnly = surfaces.some((s) => s.hasRaw && !s.hasVariant);
		if (!hasVariantOnly && !hasRawOnly) continue;

		// Emit token for this divergent tag
		tokens.push(`stylingVariantSurfaceDrift:${tag}:${file}`);
	}

	return sortedUnique(tokens);
}

// ── Primary span ──────────────────────────────────────────────────────────────

function primarySpanFor(
	fileJsx: readonly PatternJsxFact[],
	_fileAttrs: readonly PatternJsxAttributeFact[],
	divergentTags: readonly string[],
	file: string,
): Span {
	const contributing = fileJsx.filter((f) => divergentTags.includes(f.tag));

	if (contributing.length === 0) {
		const first = fileJsx[0];
		return first
			? first.span
			: { file, start: 0, end: 0, kind: "jsx", astPath: "" };
	}

	const byStart = [...contributing].sort((a, b) => a.span.start - b.span.start);
	return byStart[0]!.span;
}

// ── Explain hook ──────────────────────────────────────────────────────────────
//
// Documented limits (design §7 / ADR-6):
// 1. Observes only the literal tag and prop names as written in the source.
//    Does not establish which package a component comes from.
// 2. Does not describe what these props do when the app runs.
// 3. Does not assert whether the observed difference is intended.
// 4. Does not resolve spread attributes ({...props}); spread-applied prop names
//    are not visible in current source-only facts.
// 5. Makes no inference about package membership or provenance from the tag name.
// 6. Makes no claim about intent, underlying cause, or remediation; finding is
//    file-scoped and no code change is required or implied.

function explainDesignSystemUsageSurfaceDrift(
	finding: PresentedFinding,
): ExplanationEnvelope | null {
	if (
		finding.ruleId !== DESIGN_SYSTEM_USAGE_SURFACE_DRIFT_RULE_ID ||
		finding.evidence.kind !== "adapter-metric"
	) {
		return null;
	}

	const evidence = finding.evidence;
	const exceeded = evidence.topology.exceeded;
	const file = evidence.subject.file;

	// Extract divergent tag names from exceeded tokens
	const tags = exceeded
		.filter((t) => t.startsWith("stylingVariantSurfaceDrift:"))
		.map((t) => {
			const withoutPrefix = t.slice("stylingVariantSurfaceDrift:".length);
			const fileSuffix = `:${file}`;
			return withoutPrefix.endsWith(fileSuffix)
				? withoutPrefix.slice(0, withoutPrefix.length - fileSuffix.length)
				: withoutPrefix;
		})
		.sort();

	const tagList = tags.join(", ");
	const summary =
		tags.length > 0
			? `${file} has observed styling prop surface divergence across distinct JSX usages of ${tagList}: some usages carry variant-family prop names (${VARIANT_PROPS_LIST}) and other usages carry raw-style prop names (${RAW_STYLE_PROPS_LIST}).`
			: `${file} has observed styling prop surface divergence across distinct JSX usages in this file.`;

	const groundingFields = Object.keys(evidence).sort();

	return {
		summary,
		whyItMatters:
			"This is worth reviewing because the observed prop names used on distinct JSX usages of the same capitalized tag are not uniform — some usages pass variant-family prop names and others pass raw-style prop names.",
		inspectFirst: [
			`${file}`,
			`divergent tags observed: ${tagList || "(none)"}`,
			`divergence signals: ${exceeded.length}`,
		],
		limits: [
			"RAI observes only the literal tag and prop names as written; it does not establish which package a component comes from, what these props do when the app runs, or whether the observed difference is intended.",
			"RAI does not resolve spread attributes ({...props}); prop names passed via spread are not visible in current source-only facts.",
			"RAI makes no inference about package membership or provenance from the observed tag name alone.",
			"RAI makes no claim about intent, underlying cause, or remediation; this finding is file-scoped and no code change is required or implied.",
		],
		groundingFields,
		glossary: groundingFields.map(explainTerm),
	};
}

// Human-readable prop-set labels for summary text (only observed names — no claims)
const VARIANT_PROPS_LIST = [...VARIANT_PROPS].sort().join("/");
const RAW_STYLE_PROPS_LIST = [...RAW_STYLE_PROPS].sort().join("/");

// ── Fact guards ───────────────────────────────────────────────────────────────

function isJsxFact(fact: PatternFact): fact is PatternJsxFact {
	if (fact.kind !== "jsx") return false;
	const tag = (fact as PatternJsxFact).tag;
	// Tag guard: first char uppercase letter AND not a dotted member expression.
	// Lowercase native tags (div/button/span) are NOT matched — P11-S6 domain.
	// Dotted compound tags (Modal.Trigger) are NOT matched — P11-S1 domain.
	return tag.length > 0 && tag[0] === tag[0]!.toUpperCase() && tag[0] !== tag[0]!.toLowerCase() && !tag.includes(".");
}

function isJsxAttributeFact(fact: PatternFact): fact is PatternJsxAttributeFact {
	if (fact.kind !== "jsx-attribute") return false;
	const attr = fact as PatternJsxAttributeFact;
	// Attribute must be on a capitalized non-dotted tag and be a tracked prop name
	return (
		isCapitalizedNonDotted(attr.tag) &&
		(VARIANT_PROPS.has(attr.name) || RAW_STYLE_PROPS.has(attr.name))
	);
}

function isCapitalizedNonDotted(tag: string): boolean {
	return (
		tag.length > 0 &&
		tag[0] === tag[0]!.toUpperCase() &&
		tag[0] !== tag[0]!.toLowerCase() &&
		!tag.includes(".")
	);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
