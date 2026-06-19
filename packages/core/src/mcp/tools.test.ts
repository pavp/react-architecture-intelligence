import { expect, test } from "vitest";
import { createSession } from "./tools.js";
import { DEFAULT_CONFIG } from "../config/resolve.js";
import type { Analyzer } from "../analyzers/analyzer.js";
import type {
	AdapterMetricEvidence,
	Finding,
	PresentedFinding,
} from "../types.js";
import type { ApplyWorkspace } from "../codemod/apply-pipeline.js";
import { AnalyzerRegistry } from "../analyzers/registry.js";
import type { PreviewProposal, ProposalBuilder, ProposalBuilderInput } from "../codemod/proposal.js";

const A = `function LoginButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default LoginButton;`;
const B = `function SignupBtn({ label, onClick, size }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default SignupBtn;`;
const C = `function CtaButton({ label, onClick, variant }) { const t = useTheme(); return <button onClick={onClick}>{label}</button>; }
export default CtaButton;`;
const files = [
	{ file: "LoginButton.tsx", source: A },
	{ file: "SignupBtn.tsx", source: B },
	{ file: "CtaButton.tsx", source: C },
];

const graphFiles = [
	{ file: "Leaf.tsx", source: "export function Leaf() { return <span />; }" },
	{ file: "Card.tsx", source: "export function Card() { return <Leaf />; }" },
	{
		file: "Sidebar.tsx",
		source: "export function Sidebar() { return <Leaf />; }",
	},
	{
		file: "Page.tsx",
		source:
			"export function Page() { return <main><Card /><Sidebar /></main>; }",
	},
];

function makeFinding(ruleId: string): Finding {
	return {
		id: `finding-${ruleId}`,
		ruleId,
		type: "opportunity",
		fingerprint: {
			structural: `${ruleId}-structural`,
			nominal: `${ruleId}-nominal`,
			positional: `${ruleId}-positional`,
		},
		analysisVersion: 1,
		fpAlgoVersion: 1,
		producingRunId: "run1",
		commitSha: "c1",
		severityRaw: "warn",
		evidence: {
			kind: "shared-extraction",
			instances: [],
			cosine: 1,
			propOverlap: 1,
			hookOverlap: 1,
			variancePoints: [],
			sharedSurface: [],
		},
		createdAt: 0,
	};
}

function analyzer(ruleId: string, run: () => Finding[]): Analyzer {
	return { ruleId, framework: "react", analyze: run };
}

function registerAnalyzer(session: unknown, testAnalyzer: Analyzer): void {
	(
		session as { registry: { register(analyzer: Analyzer): void } }
	).registry.register(testAnalyzer);
}

test("analyze_repo returns counts + handles, not a finding dump", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const r = s.analyzeRepo({ files, asOf: 0 });
	expect(r.counts.byType.opportunity).toBe(1);
	expect(r.topFingerprints.length).toBe(1);
	expect((r as any).findings).toBeUndefined(); // handles, not bodies
	expect((r as any).graph).toBeUndefined(); // graph stays internal to query_architecture
});

test("analyze_repo builds its registry from the current files when a registry factory is configured", () => {
	const seen: string[][] = [];
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: ({ files }) => {
			seen.push(files.map((file) => file.file));
			const registry = new AnalyzerRegistry();
			registry.register(
				analyzer(`factory/${files[0]!.file}`, () => [
					makeFinding(`factory/${files[0]!.file}`),
				]),
			);
			return registry;
		},
	});

	const first = s.analyzeRepo({
		files: [
			{
				file: "First.tsx",
				source: "export function First() { return <div />; }",
			},
		],
		asOf: 0,
		commitSha: "c1",
	});
	const second = s.analyzeRepo({
		files: [
			{
				file: "Second.tsx",
				source: "export function Second() { return <div />; }",
			},
		],
		asOf: 1,
		commitSha: "c2",
	});

	expect(seen).toEqual([["First.tsx"], ["Second.tsx"]]);
	expect(first.topFingerprints).toEqual(["factory/First.tsx-structural"]);
	expect(second.topFingerprints).toEqual(["factory/Second.tsx-structural"]);
});

// ─── queryArchitecture tests ────────────────────────────────────────────────

test("queryArchitecture refuses unknown questions with the valid enum", () => {
	const s = createSession({ config: DEFAULT_CONFIG });

	const r = s.queryArchitecture({ question: "hook-consumers", target: "Leaf" });

	expect(r).toEqual({
		status: "unknown_question",
		question: "hook-consumers",
		validQuestions: [
			"renders",
			"rendered-by",
			"fan-in",
			"fan-out",
			"reachability",
		],
	});
});

test("queryArchitecture requires a prior analysis", () => {
	const s = createSession({ config: DEFAULT_CONFIG });

	const r = s.queryArchitecture({ question: "renders", target: "Page" });

	expect(r.status).toBe("no_analysis");
});

test("queryArchitecture answers renders and rendered-by from the last graph", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const renders = s.queryArchitecture({ question: "renders", target: "Page" });
	const renderedBy = s.queryArchitecture({
		question: "rendered-by",
		target: "Leaf",
	});

	expect(renders.status).toBe("ok");
	expect(
		(renders as any).answer.children.map((n: { name: string }) => n.name),
	).toEqual(["Card", "Sidebar"]);
	expect((renders as any).edges).toHaveLength(2);
	expect(renderedBy.status).toBe("ok");
	expect(
		(renderedBy as any).answer.parents.map((n: { name: string }) => n.name),
	).toEqual(["Card", "Sidebar"]);
});

test("queryArchitecture answers fan-in for a shared rendered component", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const r = s.queryArchitecture({ question: "fan-in", target: "Leaf" });

	expect(r.status).toBe("ok");
	expect((r as any).answer.count).toBe(2);
});

test("queryArchitecture reachability respects the requested depth bound", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const depthOne = s.queryArchitecture({
		question: "reachability",
		target: "Page",
		depth: 1,
	});
	const depthTwo = s.queryArchitecture({
		question: "reachability",
		target: "Page",
		depth: 2,
	});

	expect(depthOne.status).toBe("ok");
	expect(
		(depthOne as any).answer.reachable.map((n: { name: string }) => n.name),
	).toEqual(["Card", "Sidebar"]);
	expect(depthTwo.status).toBe("ok");
	expect(
		(depthTwo as any).answer.reachable.map((n: { name: string }) => n.name),
	).toEqual(["Card", "Leaf", "Sidebar"]);
});

test("queryArchitecture refuses unknown targets", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const r = s.queryArchitecture({ question: "renders", target: "Missing" });

	expect(r).toEqual({ status: "unknown_target", target: "Missing" });
});

test("getNode requires a prior analysis", () => {
	const s = createSession({ config: DEFAULT_CONFIG });

	expect(s.getNode({ file: "Page.tsx" })).toEqual({
		status: "no_analysis",
		message: "run analyze_repo before get_node",
	});
});

test("getNode returns a component by file and byte range", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const r = s.getNode({ file: "Page.tsx", byteRange: [0, 80] });

	expect(r.status).toBe("ok");
	expect((r as any).node).toMatchObject({
		kind: "component",
		name: "Page",
		file: "Page.tsx",
	});
	expect((r as any).span.file).toBe("Page.tsx");
	expect((r as any).astPath).toBeTruthy();
});

test("getNode resolves adapter metric evidence subject spans", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	registerAnalyzer(s, {
		ruleId: "adapter/metric-rule",
		framework: "react",
		analyze: (ctx) => {
			const page = ctx.graph.components.find(
				(component) => component.name === "Page",
			)!;
			const evidence: AdapterMetricEvidence = {
				kind: "adapter-metric",
				adapterId: "adapter",
				ruleId: "adapter/metric-rule",
				subject: {
					id: page.id,
					name: page.name,
					file: page.file,
					span: page.span,
					fingerprint: "page-fp",
				},
				roles: [{ role: "Boundary", variant: "test", file: page.file }],
				metrics: { reachableDepth: 2 },
				thresholds: { maxReachableDepth: 1 },
				topology: {
					directChildIds: ["Card", "Sidebar"],
					reachableNodeIds: ["Card", "Leaf", "Sidebar"],
					exceeded: ["reachableDepth"],
				},
			};
			return [
				{
					...makeFinding("adapter/metric-rule"),
					fingerprint: {
						structural: "adapter-span-fp",
						nominal: "n",
						positional: "p",
					},
					evidence,
				},
			];
		},
	});
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const r = s.getNode({ fingerprint: "adapter-span-fp" });

	expect(r.status).toBe("ok");
	expect((r as any).node).toMatchObject({
		kind: "component",
		name: "Page",
		file: "Page.tsx",
	});
	expect((r as any).span.file).toBe("Page.tsx");
});

test("rawGraphQuery refuses before analysis and unknown patterns", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	expect(s.rawGraphQuery({ cypherLike: "MATCH edges", limit: 10 })).toEqual({
		status: "no_analysis",
		message: "run analyze_repo before raw_graph_query",
	});
	s.analyzeRepo({ files: graphFiles, asOf: 0 });
	expect(s.rawGraphQuery({ cypherLike: "MATCH freeform", limit: 10 })).toEqual({
		status: "unsupported_query",
		supportedQueries: ["nodes", "edges"],
	});
});

test("rawGraphQuery returns bounded graph rows with truncation", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files: graphFiles, asOf: 0 });

	const r = s.rawGraphQuery({ cypherLike: "MATCH edges", limit: 1 });

	expect(r.status).toBe("ok");
	if (r.status !== "ok") throw new Error("expected raw graph query to succeed");
	expect(r.rows).toHaveLength(1);
	expect(r.truncated).toBe(true);
});

test("analyze_repo returns diagnostic count and details for partial analyzer failure", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	registerAnalyzer(
		s,
		analyzer("test/failing", () => {
			throw new TypeError("boom");
		}),
	);

	const r = s.analyzeRepo({ files, asOf: 0 });

	expect(r.counts.diagnostics).toBe(1);
	expect(r.diagnostics).toEqual([
		{
			ruleId: "test/failing",
			kind: "analyzer-error",
			errorName: "TypeError",
			message: "boom",
		},
	]);
});

test("analyze_repo diagnostics do not leak finding bodies, evidence, fingerprints, or feedback handles", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	registerAnalyzer(
		s,
		analyzer("test/failing", () => {
			throw new Error("boom");
		}),
	);

	const r = s.analyzeRepo({ files, asOf: 0 });
	const diagnostic = r.diagnostics[0]!;

	expect(Object.keys(diagnostic).sort()).toEqual([
		"errorName",
		"kind",
		"message",
		"ruleId",
	]);
	expect((diagnostic as any).finding).toBeUndefined();
	expect((diagnostic as any).findings).toBeUndefined();
	expect((diagnostic as any).evidence).toBeUndefined();
	expect((diagnostic as any).fingerprint).toBeUndefined();
	expect((diagnostic as any).feedbackHandle).toBeUndefined();
});

test("diagnostics are not close_session feedback targets or prompt items", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	registerAnalyzer(
		s,
		analyzer("test/failing", () => {
			throw new Error("boom");
		}),
	);
	registerAnalyzer(
		s,
		analyzer("test/success", () => [makeFinding("test/success")]),
	);

	const analyze = s.analyzeRepo({ files, asOf: 0 });
	const close = s.closeSession({
		decisions: [
			{
				fingerprint: "test/failing",
				ruleId: "test/failing",
				verdict: "reject",
			},
		],
		asOf: 1,
	});

	expect(analyze.diagnostics).toEqual([
		{
			ruleId: "test/failing",
			kind: "analyzer-error",
			errorName: "Error",
			message: "boom",
		},
	]);
	expect(close.items.some((item) => item.ruleId === "test/failing")).toBe(
		false,
	);
	expect(close.results).toEqual([
		{
			fingerprint: "test/failing",
			ruleId: "test/failing",
			accepted: false,
			refusedReason: "unknown current finding",
		},
	]);
});

test("find_shared_opportunities separates opportunities from conflicts", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files, asOf: 0 });
	const r = s.findSharedOpportunities({});
	expect(r.opportunities.length).toBe(1);
	expect(r.conflicts.length).toBe(0);
});

test("proposeRefactor returns a deterministic no-write proposal for a current opportunity", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;
	const before = countRows(s, "feedback_event");

	const first = s.proposeRefactor({ fingerprint: fp });
	const second = s.proposeRefactor({ fingerprint: fp });

	expect(first).toEqual(second);
	expect(first).toMatchObject({
		status: "ok",
		fingerprint: fp,
		ruleId: "react/shared-extraction",
		componentName: "SharedButton",
		varianceParameters: ["size", "variant"],
		writeMode: "proposal-only",
	});
	expect((first as any).patch).toBeUndefined();
	expect(countRows(s, "feedback_event")).toBe(before);
});

test("proposeRefactor refuses unknown fingerprints", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files, asOf: 0 });

	expect(s.proposeRefactor({ fingerprint: "missing" })).toEqual({
		status: "refused",
		reason: "unknown-current-finding",
	});
});

test("proposeRefactor refuses suppressed findings", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;
	s.recordFeedback({
		fingerprint: fp,
		ruleId: "react/shared-extraction",
		verdict: "reject",
		source: "human",
		asOf: 1,
	});
	s.analyzeRepo({ files, asOf: 2, analysisVersion: 2 });

	expect(s.proposeRefactor({ fingerprint: fp })).toEqual({
		status: "refused",
		reason: "suppressed-finding",
	});
});

test("applyRefactor runs the gated pipeline with an injected workspace", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0, analysisVersion: 1 });
	const fp = a.topFingerprints[0]!;
	const events: string[] = [];
	const workspace: ApplyWorkspace = {
		isDirty: () => false,
		applyPatch: () => {
			events.push("apply");
		},
		run: (command) => {
			events.push(command.kind);
			return { ok: true, output: `${command.kind}:ok` };
		},
		hasUnexpectedChanges: () => {
			events.push("git-clean");
			return false;
		},
		rollback: () => {
			events.push("rollback");
		},
		commit: () => {
			events.push("commit");
			return "a".repeat(40);
		},
	};

	const result = s.applyRefactor({
		fingerprint: fp,
		sources: files,
		targetFile: "SharedButton.tsx",
		workspace,
		commitMessage: "refactor: extract shared button",
		asOf: 9,
	});

	expect(result.status).toBe("applied");
	expect(events).toEqual(["apply", "typecheck", "test", "git-clean", "commit"]);
	expect(countRows(s, "codemod_proof")).toBe(1);
});

test("applyRefactor persists rolled-back proof after verification failure", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0, analysisVersion: 1 });
	const fp = a.topFingerprints[0]!;
	const workspace: ApplyWorkspace = {
		isDirty: () => false,
		applyPatch: () => {},
		run: (command) =>
			command.kind === "typecheck"
				? { ok: false, output: "typecheck failed" }
				: { ok: true, output: "ok" },
		hasUnexpectedChanges: () => false,
		rollback: () => {},
		commit: () => "a".repeat(40),
	};

	const result = s.applyRefactor({
		fingerprint: fp,
		sources: files,
		targetFile: "SharedButton.tsx",
		workspace,
		asOf: 10,
	});

	expect(result.status).toBe("rolled-back");
	expect(countRows(s, "codemod_proof")).toBe(1);
});

test("applyRefactor refuses suppressed findings before workspace mutation", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0, analysisVersion: 1 });
	const fp = a.topFingerprints[0]!;
	s.recordFeedback({
		fingerprint: fp,
		ruleId: "react/shared-extraction",
		verdict: "reject",
		source: "human",
		asOf: 1,
	});
	s.analyzeRepo({ files, asOf: 2, analysisVersion: 2 });
	const events: string[] = [];
	const workspace: ApplyWorkspace = {
		isDirty: () => {
			events.push("dirty-check");
			return false;
		},
		applyPatch: () => {
			events.push("apply");
		},
		run: () => ({ ok: true, output: "ok" }),
		hasUnexpectedChanges: () => false,
		rollback: () => {
			events.push("rollback");
		},
		commit: () => "a".repeat(40),
	};

	const result = s.applyRefactor({
		fingerprint: fp,
		sources: files,
		targetFile: "SharedButton.tsx",
		workspace,
	});

	expect(result).toEqual({ status: "refused", reason: "suppressed-by-memory" });
	expect(events).toEqual([]);
	expect(countRows(s, "codemod_proof")).toBe(0);
});

test("explain_finding returns additive explanation beside unchanged evidence and memory", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;
	const beforeFinding = cloneJson(
		s.findSharedOpportunities({ includeSuppressed: false }).opportunities[0]!,
	);
	const beforeFeedback = countRows(s, "feedback_event");
	const beforeFindingRows = countRows(s, "finding");
	const beforeSnapshotRows = countRows(s, "snapshot");

	const e = s.explainFinding({ fingerprint: fp });

	expect(e.evidence.kind).toBe("shared-extraction");
	expect(e.groundingFields).toContain("sharedSurface");
	expect(e.finding).toEqual(beforeFinding);
	expect(e.evidence).toEqual(beforeFinding.evidence);
	expect(e.finding.fingerprint).toEqual(beforeFinding.fingerprint);
	expect(e.finding.fingerprint.structural).toBe(fp);
	expect(e.finding.ruleId).toBe(beforeFinding.ruleId);
	expect(e.finding.severity).toBe(beforeFinding.severity);
	expect(e.finding.status).toBe(beforeFinding.status);
	expect(e.groundingFields).toEqual(Object.keys(beforeFinding.evidence));
	expect(e.memory).toMatchObject({
		weight: 0,
		confidence: 0,
		eventCount: 0,
		net: "neutral",
		lastReason: null,
	});
	expect(e.explanation).toMatchObject({
		groundingFields: expect.arrayContaining([
			"cosine",
			"propOverlap",
			"hookOverlap",
			"sharedSurface",
		]),
		glossary: expect.arrayContaining([
			expect.objectContaining({ term: "cosine", known: true }),
		]),
	});
	expect(e.explanation.summary).toMatch(
		/^3 components share similar source shape:/,
	);
	expect(e.explanation.summary).not.toMatch(/^RAI found/);
	expect(e.explanation.limits).toContain(
		"Do not assume shared ownership, intent, root cause, user impact, or safe remediation from this finding alone.",
	);
	expect(
		s.findSharedOpportunities({ includeSuppressed: false }).opportunities[0],
	).toEqual(beforeFinding);
	expect(countRows(s, "feedback_event")).toBe(beforeFeedback);
	expect(countRows(s, "finding")).toBe(beforeFindingRows);
	expect(countRows(s, "snapshot")).toBe(beforeSnapshotRows);
});

test("explain_finding uses analyzer-owned human explanation when available", () => {
	const evidence: AdapterMetricEvidence = {
		kind: "adapter-metric",
		adapterId: "test-adapter",
		ruleId: "test/human-output",
		subject: {
			id: "pair",
			name: "Alpha -> Beta",
			file: "Alpha.tsx",
			span: {
				file: "Alpha.tsx",
				start: 0,
				end: 10,
				kind: "component",
				astPath: "module>component",
			},
			fingerprint: "subject-fp",
		},
		roles: [{ role: "source-role", variant: "Alpha", file: "Alpha.tsx" }],
		metrics: { measuredThings: 1 },
		thresholds: { measuredThings: 0 },
		topology: {
			directChildIds: ["Beta"],
			reachableNodeIds: ["Alpha", "Beta"],
			exceeded: ["measuredThings"],
		},
	};
	const customAnalyzer: Analyzer = {
		ruleId: "test/human-output",
		framework: "test",
		analyze: () => [{ ...makeFinding("test/human-output"), evidence }],
		explain: (finding: PresentedFinding) => ({
			summary: `Human summary for ${finding.ruleId}`,
			whyItMatters: "This is owned by the analyzer, not generic core wording.",
			inspectFirst: ["Alpha -> Beta in Alpha.tsx"],
			limits: ["No intent or remediation is inferred."],
			groundingFields: Object.keys(finding.evidence).sort(),
			glossary: [],
		}),
	};
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const registry = new AnalyzerRegistry();
			registry.register(customAnalyzer);
			return registry;
		},
	});

	const a = s.analyzeRepo({
		files: [
			{
				file: "Alpha.tsx",
				source: "export function Alpha() { return <div />; }",
			},
		],
		asOf: 0,
		commitSha: "c1",
	});
	const fp = a.topFingerprints[0]!;
	const result = s.explainFinding({ fingerprint: fp });

	expect(result.evidence).toEqual(evidence);
	expect(result.explanation).toMatchObject({
		summary: "Human summary for test/human-output",
		whyItMatters: "This is owned by the analyzer, not generic core wording.",
		inspectFirst: ["Alpha -> Beta in Alpha.tsx"],
	});
});

test("explain_finding refuses an unknown fingerprint without synthesizing an explanation", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	s.analyzeRepo({ files, asOf: 0 });
	const beforeFeedback = countRows(s, "feedback_event");

	expect(() =>
		s.explainFinding({ fingerprint: "unknown-fingerprint" }),
	).toThrow("unknown fingerprint in current analysis");
	expect(countRows(s, "feedback_event")).toBe(beforeFeedback);
});

test("record_feedback (human reject) then re-analyze -> finding suppressed", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;
	const fb = s.recordFeedback({
		fingerprint: fp,
		ruleId: "react/shared-extraction",
		verdict: "reject",
		source: "human",
		asOf: 0,
	});
	expect(fb.accepted).toBe(true);
	const a2 = s.analyzeRepo({ files, asOf: 0, analysisVersion: 2 });
	expect(a2.counts.suppressed).toBe(1);
});

test("record_feedback refuses a phantom fingerprint", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const r = s.recordFeedback({
		fingerprint: "phantom",
		ruleId: "r",
		verdict: "reject",
		source: "human",
		asOf: 0,
	});
	expect(r.accepted).toBe(false);
});

test("explainFinding includes lastReason from most recent non-null feedback reason", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;
	s.recordFeedback({
		fingerprint: fp,
		ruleId: "react/shared-extraction",
		verdict: "reject",
		source: "human",
		reason: "arch-reason",
		asOf: 1,
	});
	const e = s.explainFinding({ fingerprint: fp });
	expect(e.memory.lastReason).toBe("arch-reason");
});

test("explainFinding lastReason is null when no feedback with non-null reason exists", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;
	const e = s.explainFinding({ fingerprint: fp });
	expect(e.memory.lastReason).toBeNull();
});

test("closeSession without decisions returns current prompt items and writes no feedback", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const r = s.closeSession({});

	expect(r.items).toEqual([
		expect.objectContaining({
			fingerprint: fp,
			ruleId: "react/shared-extraction",
			type: "opportunity",
			severity: "warn",
			status: "active",
		}),
	]);
	expect(r.results).toEqual([]);
	expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession with summary but no decisions returns prompt context and writes no feedback", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const r = s.closeSession({
		summary: "Looks like we should reject this later.",
	});

	expect(r.items.map((item) => item.fingerprint)).toEqual([fp]);
	expect(r.summary).toBe("Looks like we should reject this later.");
	expect(r.results).toEqual([]);
	expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession with explicit known decision records feedback", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const r = s.closeSession({
		decisions: [
			{
				fingerprint: fp,
				ruleId: "react/shared-extraction",
				verdict: "reject",
				reason: "not reusable",
			},
		],
		asOf: 7,
	});

	expect(r.results).toEqual([
		{ fingerprint: fp, ruleId: "react/shared-extraction", accepted: true },
	]);
	const e = s.explainFinding({ fingerprint: fp });
	expect(e.memory.eventCount).toBe(1);
	expect(e.memory.lastReason).toBe("not reusable");
});

test("closeSession refuses unknown decision fingerprint and writes no feedback", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const r = s.closeSession({
		decisions: [
			{
				fingerprint: "phantom",
				ruleId: "react/shared-extraction",
				verdict: "reject",
			},
		],
		asOf: 7,
	});

	expect(r.results).toEqual([
		{
			fingerprint: "phantom",
			ruleId: "react/shared-extraction",
			accepted: false,
			refusedReason: "unknown current finding",
		},
	]);
	expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession refuses mismatched ruleId and writes no feedback", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const r = s.closeSession({
		decisions: [{ fingerprint: fp, ruleId: "wrong/rule", verdict: "reject" }],
		asOf: 7,
	});

	expect(r.results).toEqual([
		{
			fingerprint: fp,
			ruleId: "wrong/rule",
			accepted: false,
			refusedReason: "unknown current finding",
		},
	]);
	expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

test("closeSession ignores ambiguous summary text without decisions", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const r = s.closeSession({
		summary: "We probably do not want this finding.",
	});

	expect(r.results).toEqual([]);
	expect(s.explainFinding({ fingerprint: fp }).memory.eventCount).toBe(0);
});

// ─── getDrift tests ────────────────────────────────────────────────────────

function seedSnapshot(
	session: ReturnType<typeof createSession>,
	rows: Array<{
		commit_sha: string;
		fingerprint: string;
		rule_id: string;
		severity_raw?: string;
		evidence_digest: string;
		created_at?: number;
	}>,
) {
	const db = (session as any).db;
	const stmt = db.prepare(
		"INSERT OR REPLACE INTO snapshot (commit_sha, fingerprint, rule_id, severity_raw, evidence_digest, created_at) VALUES (?,?,?,?,?,?)",
	);
	for (const r of rows) {
		stmt.run(
			r.commit_sha,
			r.fingerprint,
			r.rule_id,
			r.severity_raw ?? "warn",
			r.evidence_digest,
			r.created_at ?? Date.now(),
		);
	}
}

function countRows(
	session: ReturnType<typeof createSession>,
	table: string,
): number {
	const db = (session as any).db;
	return (
		db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number }
	).cnt;
}

test("getDrift does not trigger analysis (zero writes)", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	// no seeded rows — both commits absent
	s.getDrift({ baseCommit: "abc", headCommit: "def" });
	expect(countRows(s, "snapshot")).toBe(0);
	expect(countRows(s, "finding")).toBe(0);
	expect(countRows(s, "feedback_event")).toBe(0);
});

test("getDrift: added finding detected", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "base1",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "base1",
			fingerprint: "fpB",
			rule_id: "react/rc",
			evidence_digest: "d2",
		},
		{
			commit_sha: "head1",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "head1",
			fingerprint: "fpB",
			rule_id: "react/rc",
			evidence_digest: "d2",
		},
		{
			commit_sha: "head1",
			fingerprint: "fpC",
			rule_id: "react/rc",
			evidence_digest: "d3",
		},
	]);
	const r = s.getDrift({ baseCommit: "base1", headCommit: "head1" });
	expect(r.status).toBe("ok");
	const added = (r as any).added as Array<{ fingerprint: string }>;
	expect(added.map((x) => x.fingerprint)).toContain("fpC");
	expect((r as any).removed).toHaveLength(0);
});

test("getDrift: removed finding detected", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "base2",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "base2",
			fingerprint: "fpB",
			rule_id: "react/rc",
			evidence_digest: "d2",
		},
		{
			commit_sha: "head2",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
	]);
	const r = s.getDrift({ baseCommit: "base2", headCommit: "head2" });
	expect(r.status).toBe("ok");
	const removed = (r as any).removed as Array<{ fingerprint: string }>;
	expect(removed.map((x) => x.fingerprint)).toContain("fpB");
	expect((r as any).added).toHaveLength(0);
});

test("getDrift: differing evidence_digest → persisted 'changed'", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "base3",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "digest-v1",
		},
		{
			commit_sha: "head3",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "digest-v2",
		},
	]);
	const r = s.getDrift({ baseCommit: "base3", headCommit: "head3" });
	expect(r.status).toBe("ok");
	const persisted = (r as any).persisted as Array<{
		fingerprint: string;
		stability: string;
	}>;
	const entry = persisted.find((p) => p.fingerprint === "fpA");
	expect(entry?.stability).toBe("changed");
});

test("getDrift: identical evidence_digest → persisted 'stable'", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "base4",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "same-digest",
		},
		{
			commit_sha: "head4",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "same-digest",
		},
	]);
	const r = s.getDrift({ baseCommit: "base4", headCommit: "head4" });
	expect(r.status).toBe("ok");
	const persisted = (r as any).persisted as Array<{
		fingerprint: string;
		stability: string;
	}>;
	const entry = persisted.find((p) => p.fingerprint === "fpA");
	expect(entry?.stability).toBe("stable");
});

test("getDrift: ruleId filter narrows results", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "base5",
			fingerprint: "fpA",
			rule_id: "react/render-coupling",
			evidence_digest: "d1",
		},
		{
			commit_sha: "base5",
			fingerprint: "fpB",
			rule_id: "react/over-abstraction",
			evidence_digest: "d2",
		},
		{
			commit_sha: "head5",
			fingerprint: "fpA",
			rule_id: "react/render-coupling",
			evidence_digest: "d1",
		},
		{
			commit_sha: "head5",
			fingerprint: "fpB",
			rule_id: "react/over-abstraction",
			evidence_digest: "d2",
		},
		{
			commit_sha: "head5",
			fingerprint: "fpC",
			rule_id: "react/render-coupling",
			evidence_digest: "d3",
		},
	]);
	const r = s.getDrift({
		baseCommit: "base5",
		headCommit: "head5",
		ruleId: "react/render-coupling",
	});
	expect(r.status).toBe("ok");
	const added = (r as any).added as Array<{
		fingerprint: string;
		rule_id: string;
	}>;
	const persisted = (r as any).persisted as Array<{
		fingerprint: string;
		rule_id: string;
	}>;
	const removed = (r as any).removed as Array<{
		fingerprint: string;
		rule_id: string;
	}>;
	const allEntries = [...added, ...persisted, ...removed];
	expect(allEntries.every((e) => e.rule_id === "react/render-coupling")).toBe(
		true,
	);
	expect(allEntries.some((e) => e.rule_id === "react/over-abstraction")).toBe(
		false,
	);
});

test("getDrift: unknown base commit → status unknown_commit with base SHA", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "known-head",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "known-base",
			fingerprint: "fpX",
			rule_id: "react/rc",
			evidence_digest: "dx",
		},
	]);
	const r = s.getDrift({ baseCommit: "unknown-sha", headCommit: "known-head" });
	expect(r.status).toBe("unknown_commit");
	expect((r as any).commit).toBe("unknown-sha");
	// no writes
	expect(countRows(s, "finding")).toBe(0);
});

test("getDrift: unknown head commit → status unknown_commit with head SHA", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "known-base2",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "also-known",
			fingerprint: "fpB",
			rule_id: "react/rc",
			evidence_digest: "d2",
		},
	]);
	const r = s.getDrift({
		baseCommit: "known-base2",
		headCommit: "unknown-head",
	});
	expect(r.status).toBe("unknown_commit");
	expect((r as any).commit).toBe("unknown-head");
});

test("getDrift: only one distinct commit analyzed → insufficient_history", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "only-sha",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
	]);
	const r = s.getDrift({ baseCommit: "only-sha", headCommit: "only-sha" });
	expect(r.status).toBe("insufficient_history");
	expect((r as any).snapshotCount).toBe(1);
	expect((r as any).requiredSnapshots).toBe(2);
	expect((r as any).added).toEqual([]);
	expect((r as any).removed).toEqual([]);
});

test("getDrift: unknown state is never silent-clean (no ok with empty arrays)", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	// fewer than 2 distinct commits
	seedSnapshot(s, [
		{
			commit_sha: "single-commit",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
	]);
	const r = s.getDrift({
		baseCommit: "single-commit",
		headCommit: "single-commit",
	});
	// must NOT be status "ok"
	expect(r.status).not.toBe("ok");
	// must be one of the named error statuses
	expect(["unknown_commit", "insufficient_history"]).toContain(r.status);
});

// ─── CRITICAL-1: presence checks must fire before insufficient_history ────────

test("getDrift: absent base with 1 snapshot row → unknown_commit(base), not insufficient_history", () => {
	// Spec scenario 8: "Unknown base commit is refused" — regardless of snapshot count
	const s = createSession({ config: DEFAULT_CONFIG });
	// Only 1 distinct commit in DB — cnt < 2 would fire first under the buggy order
	seedSnapshot(s, [
		{
			commit_sha: "known-sha",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
	]);
	const r = s.getDrift({ baseCommit: "absent-sha", headCommit: "known-sha" });
	expect(r.status).toBe("unknown_commit");
	expect((r as any).commit).toBe("absent-sha");
});

test("getDrift: absent head with 1 snapshot row → unknown_commit(head), not insufficient_history", () => {
	// Symmetric case: head absent, base present, cnt = 1
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "known-sha",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
	]);
	const r = s.getDrift({ baseCommit: "known-sha", headCommit: "absent-sha" });
	expect(r.status).toBe("unknown_commit");
	expect((r as any).commit).toBe("absent-sha");
});

// ─── Phase 1 type-compilation tests (Task 1.1 RED) ────────────────────────────

// These tests verify that PreviewProposal is assignable to ProposeRefactorResult
// and that it has the shape required by the spec.
test("PreviewProposal type is assignable to ProposeRefactorResult union (type-compilation guard)", () => {
	// If PreviewProposal does not exist in proposal.ts this import fails at typecheck.
	// If the fields are wrong, the assignment below fails at typecheck.
	const preview: PreviewProposal = {
		status: "preview",
		kind: "preview-only",
		fingerprint: "fp-abc",
		ruleId: "react/prop-drilling",
		subject: { name: "Middle", file: "Middle.tsx", span: {} as any },
		observations: ["Middle forwards theme without using it."],
		consider: ["Context API", "shared hook", "prop consolidation"],
		limits: ["Name-level only."],
		writeMode: "proposal-only",
	};
	// preview.status must be "preview" — compile-time check
	const s: string = preview.status;
	// writeMode must be "proposal-only" — compile-time check
	const wm: "proposal-only" = preview.writeMode;
	expect(s).toBe("preview");
	expect(wm).toBe("proposal-only");
});

test("ProposalBuilder interface shape is correct (type-compilation guard)", () => {
	// Verifies ProposalBuilder and ProposalBuilderInput exist and have the expected shape.
	const stubBuilder: ProposalBuilder = {
		ruleId: "react/prop-drilling",
		build: (_input: ProposalBuilderInput) => ({
			status: "refused" as const,
			reason: "unsupported-rule" as const,
		}),
	};
	expect(stubBuilder.ruleId).toBe("react/prop-drilling");
});

// ─── Phase 2 dispatch tests (Task 2.1 RED) ────────────────────────────────────

function makePropDrillingFinding(fingerprint: string): Finding {
	const evidence: AdapterMetricEvidence = {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: "react/prop-drilling",
		subject: {
			id: "react:prop-drilling:B-id",
			name: "Middle",
			file: "Middle.tsx",
			span: { file: "Middle.tsx", start: 0, end: 50, kind: "component", astPath: "module>component" },
			fingerprint: "subj-fp",
		},
		roles: [
			{ role: "drilled-prop", variant: "theme", file: "Middle.tsx" },
			{ role: "upstream-source", variant: "App", file: "App.tsx" },
			{ role: "downstream-target", variant: "Leaf", file: "Leaf.tsx" },
		],
		metrics: { drilledProps: 1, upstreamSources: 1, downstreamTargets: 1, propCount: 3 },
		thresholds: { maxDrilledProps: 0 },
		topology: { directChildIds: ["Leaf-id"], reachableNodeIds: ["App-id"], exceeded: ["propDrilling:theme"] },
	};
	return {
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
	};
}

function makeStubPropDrillingBuilder(): ProposalBuilder {
	return {
		ruleId: "react/prop-drilling",
		build: ({ finding, limits }) => ({
			status: "preview" as const,
			kind: "preview-only" as const,
			fingerprint: finding.fingerprint.structural,
			ruleId: "react/prop-drilling",
			subject: { name: "Middle", file: "Middle.tsx", span: {} as any },
			observations: ["Middle forwards theme."],
			consider: ["Context API", "shared hook", "prop consolidation"],
			limits,
			writeMode: "proposal-only" as const,
		}),
	};
}

test("proposeRefactor dispatches to registered builder for prop-drilling finding (happy path)", () => {
	// RED: Session.proposeRefactor does not yet check proposalBuilders → dispatches to
	// buildSharedExtractionProposal which refuses with unsupported-rule for prop-drilling.
	const propDrillingBuilder = makeStubPropDrillingBuilder();
	const propDrillingFinding = makePropDrillingFinding("pd-fp-1");

	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const registry = new AnalyzerRegistry();
			registry.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [propDrillingFinding] });
			return registry;
		},
		proposalBuilders: [propDrillingBuilder],
	});
	const files = [
		{ file: "App.tsx", source: "export function App() { return <Middle theme=\"dark\" />; }" },
		{ file: "Middle.tsx", source: "export function Middle({ theme }) { return <Leaf theme={theme} />; }" },
		{ file: "Leaf.tsx", source: "export function Leaf({ theme }) { return <div className={theme} />; }" },
	];
	s.analyzeRepo({ files, asOf: 0 });

	const result = s.proposeRefactor({ fingerprint: "pd-fp-1" });

	expect(result.status).toBe("preview");
	expect((result as any).writeMode).toBe("proposal-only");
	expect((result as any).ruleId).toBe("react/prop-drilling");
	// No patch field
	expect((result as any).patch).toBeUndefined();
});

test("proposeRefactor refuses with unsupported-rule when no builder registered for ruleId", () => {
	// RED: no proposalBuilders in SessionOpts → dispatch falls through to shared-extraction
	// which returns unsupported-rule. Once dispatch seam is in place the refusal comes from there.
	const propDrillingFinding = makePropDrillingFinding("pd-fp-no-builder");

	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const registry = new AnalyzerRegistry();
			registry.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [propDrillingFinding] });
			return registry;
		},
		// No proposalBuilders injected
	});
	const files = [
		{ file: "Middle.tsx", source: "export function Middle({ theme }) { return <Leaf theme={theme} />; }" },
	];
	s.analyzeRepo({ files, asOf: 0 });

	const result = s.proposeRefactor({ fingerprint: "pd-fp-no-builder" });

	expect(result.status).toBe("refused");
	expect((result as any).reason).toBe("unsupported-rule");
});

test("proposeRefactor refuses stale prop-drilling fingerprint (unknown-current-finding)", () => {
	const s = createSession({
		config: DEFAULT_CONFIG,
		proposalBuilders: [makeStubPropDrillingBuilder()],
	});
	s.analyzeRepo({ files, asOf: 0 });

	const result = s.proposeRefactor({ fingerprint: "stale-pd-fp" });

	expect(result).toEqual({ status: "refused", reason: "unknown-current-finding" });
});

test("proposeRefactor refuses suppressed prop-drilling finding", () => {
	let callCount = 0;
	const makeVersionedFinding = () => {
		callCount++;
		const f = makePropDrillingFinding("pd-fp-suppressed");
		return { ...f, id: `finding-pd-fp-suppressed-v${callCount}` };
	};

	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const registry = new AnalyzerRegistry();
			registry.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [makeVersionedFinding()] });
			return registry;
		},
		proposalBuilders: [makeStubPropDrillingBuilder()],
	});
	const testFiles = [
		{ file: "Middle.tsx", source: "export function Middle({ theme }) { return <Leaf theme={theme} />; }" },
	];
	s.analyzeRepo({ files: testFiles, asOf: 0 });
	s.recordFeedback({ fingerprint: "pd-fp-suppressed", ruleId: "react/prop-drilling", verdict: "reject", source: "human", asOf: 1 });
	s.analyzeRepo({ files: testFiles, asOf: 2, analysisVersion: 2 });

	const result = s.proposeRefactor({ fingerprint: "pd-fp-suppressed" });

	expect(result).toEqual({ status: "refused", reason: "suppressed-finding" });
});

// Regression lock: shared-extraction path must be UNCHANGED after factory injection
test("proposeRefactor shared-extraction path unchanged after proposalBuilders injection (regression lock)", () => {
	const s = createSession({
		config: DEFAULT_CONFIG,
		proposalBuilders: [makeStubPropDrillingBuilder()],
	});
	const a = s.analyzeRepo({ files, asOf: 0 });
	const fp = a.topFingerprints[0]!;

	const result = s.proposeRefactor({ fingerprint: fp });

	expect(result.status).toBe("ok");
	expect((result as any).writeMode).toBe("proposal-only");
	expect((result as any).ruleId).toBe("react/shared-extraction");
});

// apply_refactor on prop-drilling fingerprint must refuse (no proof, no mutation)
test("applyRefactor refuses prop-drilling fingerprint (no apply path reachable from preview)", () => {
	const propDrillingFinding = makePropDrillingFinding("pd-fp-apply-refuse");

	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const registry = new AnalyzerRegistry();
			registry.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [propDrillingFinding] });
			return registry;
		},
		proposalBuilders: [makeStubPropDrillingBuilder()],
	});
	const testFiles = [
		{ file: "Middle.tsx", source: "export function Middle({ theme }) { return <Leaf theme={theme} />; }" },
	];
	s.analyzeRepo({ files: testFiles, asOf: 0, analysisVersion: 1 });
	const mutationEvents: string[] = [];
	const workspace: ApplyWorkspace = {
		isDirty: () => false,
		applyPatch: () => { mutationEvents.push("apply"); },
		run: () => ({ ok: true, output: "ok" }),
		hasUnexpectedChanges: () => false,
		rollback: () => { mutationEvents.push("rollback"); },
		commit: () => "a".repeat(40),
	};

	const result = s.applyRefactor({
		fingerprint: "pd-fp-apply-refuse",
		sources: testFiles,
		targetFile: "Out.tsx",
		workspace,
	});

	expect(result.status).toBe("refused");
	expect(mutationEvents).toHaveLength(0);
	expect(countRows(s, "codemod_proof")).toBe(0);
});

// ─── WARNING-1: happy-path ok result must write nothing ───────────────────────

test("getDrift: ok-status result writes nothing to finding, snapshot, or feedback_event", () => {
	const s = createSession({ config: DEFAULT_CONFIG });
	seedSnapshot(s, [
		{
			commit_sha: "commit-a",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "commit-a",
			fingerprint: "fpB",
			rule_id: "react/rc",
			evidence_digest: "d2",
		},
		{
			commit_sha: "commit-b",
			fingerprint: "fpA",
			rule_id: "react/rc",
			evidence_digest: "d1",
		},
		{
			commit_sha: "commit-b",
			fingerprint: "fpC",
			rule_id: "react/rc",
			evidence_digest: "d3",
		},
	]);
	const beforeSnapshot = countRows(s, "snapshot");
	const beforeFinding = countRows(s, "finding");
	const beforeFeedback = countRows(s, "feedback_event");

	const r = s.getDrift({ baseCommit: "commit-a", headCommit: "commit-b" });

	expect(r.status).toBe("ok");
	expect(countRows(s, "snapshot")).toBe(beforeSnapshot);
	expect(countRows(s, "finding")).toBe(beforeFinding);
	expect(countRows(s, "feedback_event")).toBe(beforeFeedback);
});

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

// ─── P16-S2: findProposals tests (RED → GREEN) ────────────────────────────────

function makeSharedExtractionFinding(fingerprint: string): Finding {
	return {
		id: `finding-se-${fingerprint}`,
		ruleId: "react/shared-extraction",
		type: "opportunity",
		fingerprint: {
			structural: fingerprint,
			nominal: `nom-${fingerprint}`,
			positional: `pos-${fingerprint}`,
		},
		analysisVersion: 1,
		fpAlgoVersion: 1,
		producingRunId: "run-se",
		commitSha: "c-se",
		severityRaw: "warn",
		evidence: {
			kind: "shared-extraction",
			instances: [],
			cosine: 0.9,
			propOverlap: 0.8,
			hookOverlap: 0.0,
			variancePoints: [],
			sharedSurface: [],
		},
		createdAt: 0,
	};
}

function makeAdapterMetricFinding(fingerprint: string, subjectName: string): Finding {
	const evidence: AdapterMetricEvidence = {
		kind: "adapter-metric",
		adapterId: "react",
		ruleId: "react/prop-drilling",
		subject: {
			id: `react:prop-drilling:${subjectName}-id`,
			name: subjectName,
			file: `${subjectName}.tsx`,
			span: { file: `${subjectName}.tsx`, start: 0, end: 50, kind: "component", astPath: "module>component" },
			fingerprint: `subj-${fingerprint}`,
		},
		roles: [{ role: "drilled-prop", variant: "theme", file: `${subjectName}.tsx` }],
		metrics: { drilledProps: 1, upstreamSources: 1, downstreamTargets: 1, propCount: 3 },
		thresholds: { maxDrilledProps: 0 },
		topology: { directChildIds: [], reachableNodeIds: [], exceeded: ["propDrilling:theme"] },
	};
	return {
		id: `finding-am-${fingerprint}`,
		ruleId: "react/prop-drilling",
		type: "opportunity",
		fingerprint: {
			structural: fingerprint,
			nominal: `nom-${fingerprint}`,
			positional: `pos-${fingerprint}`,
		},
		analysisVersion: 1,
		fpAlgoVersion: 1,
		producingRunId: "run-am",
		commitSha: "c-am",
		severityRaw: "warn",
		evidence,
		createdAt: 0,
	};
}

function makeUnknownRuleFinding(fingerprint: string): Finding {
	return {
		id: `finding-unk-${fingerprint}`,
		ruleId: "react/unknown-rule",
		type: "opportunity",
		fingerprint: {
			structural: fingerprint,
			nominal: `nom-${fingerprint}`,
			positional: `pos-${fingerprint}`,
		},
		analysisVersion: 1,
		fpAlgoVersion: 1,
		producingRunId: "run-unk",
		commitSha: "c-unk",
		severityRaw: "info",
		evidence: {
			kind: "shared-extraction",
			instances: [],
			cosine: 0.5,
			propOverlap: 0.5,
			hookOverlap: 0,
			variancePoints: [],
			sharedSurface: [],
		},
		createdAt: 0,
	};
}

test("findProposals returns no_analysis when analyze_repo has not run", () => {
	const s = createSession({ config: DEFAULT_CONFIG });

	const r = s.findProposals();

	expect(r).toEqual({
		status: "no_analysis",
		message: "run analyze_repo before find_proposals",
	});
});

test("findProposals reports shared-extraction finding as actionable without a registered builder", () => {
	const seFinding = makeSharedExtractionFinding("se-fp-1");
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({ ruleId: "react/shared-extraction", framework: "react", analyze: () => [seFinding] });
			return reg;
		},
	});
	s.analyzeRepo({ files: [{ file: "A.tsx", source: "export function A() { return <div />; }" }], asOf: 0 });

	const r = s.findProposals();

	expect(r).not.toHaveProperty("status", "no_analysis");
	const result = r as { actionable: Array<{ fingerprint: string; ruleId: string; subject?: string }>; count: number };
	expect(result.actionable).toHaveLength(1);
	expect(result.actionable[0]).toMatchObject({ fingerprint: "se-fp-1", ruleId: "react/shared-extraction" });
	expect(result.actionable[0]).not.toHaveProperty("subject");
	expect(result.count).toBe(1);
});

test("findProposals reports prop-drilling finding actionable when builder is registered, with subject", () => {
	const pdFinding = makeAdapterMetricFinding("pd-fp-2", "NavBar");
	const stubBuilder: ProposalBuilder = {
		ruleId: "react/prop-drilling",
		build: ({ finding, limits }) => ({
			status: "preview" as const,
			kind: "preview-only" as const,
			fingerprint: finding.fingerprint.structural,
			ruleId: "react/prop-drilling",
			subject: { name: "NavBar", file: "NavBar.tsx", span: {} as any },
			observations: ["NavBar forwards props."],
			consider: ["Context API"],
			limits,
			writeMode: "proposal-only" as const,
		}),
	};
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [pdFinding] });
			return reg;
		},
		proposalBuilders: [stubBuilder],
	});
	s.analyzeRepo({ files: [{ file: "NavBar.tsx", source: "export function NavBar({ t }) { return <span />; }" }], asOf: 0 });

	const r = s.findProposals() as { actionable: Array<{ fingerprint: string; ruleId: string; subject?: string }>; count: number };

	expect(r.actionable).toHaveLength(1);
	expect(r.actionable[0]).toMatchObject({ fingerprint: "pd-fp-2", ruleId: "react/prop-drilling", subject: "NavBar" });
	expect(r.count).toBe(1);
});

test("findProposals excludes finding whose ruleId has no builder and is not shared-extraction", () => {
	const unknownFinding = makeUnknownRuleFinding("unk-fp-1");
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({ ruleId: "react/unknown-rule", framework: "react", analyze: () => [unknownFinding] });
			return reg;
		},
	});
	s.analyzeRepo({ files: [{ file: "A.tsx", source: "export function A() { return <div />; }" }], asOf: 0 });

	const r = s.findProposals() as { actionable: unknown[]; count: number };

	expect(r.actionable).toHaveLength(0);
	expect(r.count).toBe(0);
});

test("findProposals excludes suppressed findings by default", () => {
	let callCount = 0;
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({
				ruleId: "react/shared-extraction",
				framework: "react",
				analyze: () => {
					callCount++;
					const f = makeSharedExtractionFinding("se-fp-suppress");
					return [{ ...f, id: `finding-se-fp-suppress-v${callCount}` }];
				},
			});
			return reg;
		},
	});
	const testFiles = [{ file: "A.tsx", source: "export function A() { return <div />; }" }];
	s.analyzeRepo({ files: testFiles, asOf: 0 });
	s.recordFeedback({ fingerprint: "se-fp-suppress", ruleId: "react/shared-extraction", verdict: "reject", source: "human", asOf: 1 });
	s.analyzeRepo({ files: testFiles, asOf: 2, analysisVersion: 2 });

	const r = s.findProposals() as { actionable: unknown[]; count: number };

	expect(r.actionable).toHaveLength(0);
	expect(r.count).toBe(0);
});

test("findProposals includes suppressed findings when includeSuppressed is true", () => {
	let callCount = 0;
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({
				ruleId: "react/shared-extraction",
				framework: "react",
				analyze: () => {
					callCount++;
					const f = makeSharedExtractionFinding("se-fp-include-supp");
					return [{ ...f, id: `finding-se-fp-include-supp-v${callCount}` }];
				},
			});
			return reg;
		},
	});
	const testFiles = [{ file: "A.tsx", source: "export function A() { return <div />; }" }];
	s.analyzeRepo({ files: testFiles, asOf: 0 });
	s.recordFeedback({ fingerprint: "se-fp-include-supp", ruleId: "react/shared-extraction", verdict: "reject", source: "human", asOf: 1 });
	s.analyzeRepo({ files: testFiles, asOf: 2, analysisVersion: 2 });

	const r = s.findProposals({ includeSuppressed: true }) as { actionable: Array<{ fingerprint: string }>; count: number };

	expect(r.actionable).toHaveLength(1);
	expect(r.actionable[0]!.fingerprint).toBe("se-fp-include-supp");
	expect(r.count).toBe(1);
});

test("findProposals ruleId filter narrows results to matching rule only", () => {
	const seFinding = makeSharedExtractionFinding("se-fp-filter");
	const pdFinding = makeAdapterMetricFinding("pd-fp-filter", "Comp");
	const stubBuilder: ProposalBuilder = {
		ruleId: "react/prop-drilling",
		build: ({ finding, limits }) => ({
			status: "preview" as const,
			kind: "preview-only" as const,
			fingerprint: finding.fingerprint.structural,
			ruleId: "react/prop-drilling",
			subject: { name: "Comp", file: "Comp.tsx", span: {} as any },
			observations: [],
			consider: [],
			limits,
			writeMode: "proposal-only" as const,
		}),
	};
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({ ruleId: "react/shared-extraction", framework: "react", analyze: () => [seFinding] });
			reg.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [pdFinding] });
			return reg;
		},
		proposalBuilders: [stubBuilder],
	});
	s.analyzeRepo({ files: [{ file: "A.tsx", source: "export function A() { return <div />; }" }], asOf: 0 });

	const r = s.findProposals({ ruleId: "react/prop-drilling" }) as { actionable: Array<{ ruleId: string }>; count: number };

	expect(r.actionable.every((a) => a.ruleId === "react/prop-drilling")).toBe(true);
	expect(r.count).toBe(r.actionable.length);
});

test("findProposals returns results in deterministic order (fingerprint asc, ruleId asc tie-break)", () => {
	const f1 = makeSharedExtractionFinding("aaaa-fp");
	const f2 = makeSharedExtractionFinding("zzzz-fp");
	const f3 = makeSharedExtractionFinding("mmmm-fp");
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			// Intentionally register in non-alpha order
			reg.register({ ruleId: "react/shared-extraction", framework: "react", analyze: () => [f3, f1, f2] });
			return reg;
		},
	});
	s.analyzeRepo({ files: [{ file: "A.tsx", source: "export function A() { return <div />; }" }], asOf: 0 });

	const r = s.findProposals() as { actionable: Array<{ fingerprint: string }> };

	expect(r.actionable.map((a) => a.fingerprint)).toEqual(["aaaa-fp", "mmmm-fp", "zzzz-fp"]);
});

test("findProposals count equals actionable length", () => {
	const f1 = makeSharedExtractionFinding("cnt-fp-1");
	const f2 = makeSharedExtractionFinding("cnt-fp-2");
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({ ruleId: "react/shared-extraction", framework: "react", analyze: () => [f1, f2] });
			return reg;
		},
	});
	s.analyzeRepo({ files: [{ file: "A.tsx", source: "export function A() { return <div />; }" }], asOf: 0 });

	const r = s.findProposals() as { actionable: unknown[]; count: number };

	expect(r.count).toBe(r.actionable.length);
});

// CRITICAL agreement-invariant test: findProposals actionable set must exactly match
// proposeRefactor's non-unsupported-rule set for the same session state.
test("CRITICAL agreement-invariant: findProposals actionable ↔ proposeRefactor non-unsupported-rule", () => {
	const seFinding = makeSharedExtractionFinding("inv-se-fp");
	const pdFinding = makeAdapterMetricFinding("inv-pd-fp", "Comp");
	const unknownFinding = makeUnknownRuleFinding("inv-unk-fp");
	const stubBuilder: ProposalBuilder = {
		ruleId: "react/prop-drilling",
		build: ({ finding, limits }) => ({
			status: "preview" as const,
			kind: "preview-only" as const,
			fingerprint: finding.fingerprint.structural,
			ruleId: "react/prop-drilling",
			subject: { name: "Comp", file: "Comp.tsx", span: {} as any },
			observations: [],
			consider: [],
			limits,
			writeMode: "proposal-only" as const,
		}),
	};
	const s = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => {
			const reg = new AnalyzerRegistry();
			reg.register({ ruleId: "react/shared-extraction", framework: "react", analyze: () => [seFinding] });
			reg.register({ ruleId: "react/prop-drilling", framework: "react", analyze: () => [pdFinding] });
			reg.register({ ruleId: "react/unknown-rule", framework: "react", analyze: () => [unknownFinding] });
			return reg;
		},
		proposalBuilders: [stubBuilder],
	});
	s.analyzeRepo({ files: [{ file: "A.tsx", source: "export function A() { return <div />; }" }], asOf: 0 });

	const proposals = s.findProposals() as { actionable: Array<{ fingerprint: string }> };
	const actionableFingerprints = new Set(proposals.actionable.map((a) => a.fingerprint));

	// Every fingerprint findProposals calls actionable must be accepted by proposeRefactor
	for (const fp of actionableFingerprints) {
		const result = s.proposeRefactor({ fingerprint: fp });
		expect(result.status).not.toBe("refused");
		if (result.status === "refused") {
			expect((result as any).reason).not.toBe("unsupported-rule");
		}
	}

	// Every fingerprint proposeRefactor accepts (not unsupported-rule) must be in actionable
	const allFingerprints = ["inv-se-fp", "inv-pd-fp", "inv-unk-fp"];
	for (const fp of allFingerprints) {
		const result = s.proposeRefactor({ fingerprint: fp });
		if (result.status !== "refused" || (result as any).reason !== "unsupported-rule") {
			// proposeRefactor accepts this → must be actionable
			expect(actionableFingerprints.has(fp)).toBe(true);
		} else {
			// proposeRefactor refuses with unsupported-rule → must NOT be actionable
			expect(actionableFingerprints.has(fp)).toBe(false);
		}
	}
});
