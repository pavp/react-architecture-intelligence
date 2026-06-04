import type { Analyzer, AnalysisContext, SourceFile } from "@rai/core";
import { detectNext } from "./detect.js";
import { enrichNext } from "./enrich.js";
import {
	createClientBoundaryBloatAnalyzer,
	explainClientBoundaryBloatFinding,
} from "./client-boundary-bloat.js";
import {
	createRouteCouplingAnalyzer,
	explainRouteCouplingFinding,
} from "./route-coupling.js";

export interface NextCoreAnalyzerInput {
	rootDir: string;
	files: SourceFile[];
}

export function createNextCoreAnalyzers(
	input: NextCoreAnalyzerInput,
): Analyzer[] {
	if (!detectNext(input.rootDir)) return [];
	return [
		adaptNextAnalyzer({
			ruleId: "next/route-coupling",
			input,
			explain: explainRouteCouplingFinding,
			analyze: (ctx) =>
				createRouteCouplingAnalyzer({
					thresholds: {
						maxFanIn: 2,
						maxFanOut: 3,
						maxDirectChildren: 3,
						maxReachableNodes: 3,
						maxReachableDepth: 2,
					},
				}).analyze(nextInput(input, ctx)),
		}),
		adaptNextAnalyzer({
			ruleId: "next/client-boundary-bloat",
			input,
			explain: explainClientBoundaryBloatFinding,
			analyze: (ctx) => {
				const detection = detectNext(input.rootDir);
				if (!detection) return { findings: [], diagnostics: [] };
				const enrichment = enrichNext({
					graph: ctx.graph,
					detection,
					files: input.files,
				});
				if ((enrichment.roleIndex.get("ClientComponent") ?? []).length === 0)
					return { findings: [], diagnostics: [] };
				return createClientBoundaryBloatAnalyzer({
					thresholds: {
						maxFanOut: 3,
						maxDirectChildren: 3,
						maxReachableNodes: 3,
						maxReachableDepth: 2,
					},
				}).analyze({ ...nextInput(input, ctx), detection });
			},
		}),
	];
}

function adaptNextAnalyzer(input: {
	ruleId: string;
	input: NextCoreAnalyzerInput;
	analyze: (
		ctx: AnalysisContext,
	) => ReturnType<ReturnType<typeof createRouteCouplingAnalyzer>["analyze"]>;
	explain?: Analyzer["explain"] | undefined;
}): Analyzer {
	return {
		ruleId: input.ruleId,
		framework: "next",
		analyze: input.analyze,
		...(input.explain ? { explain: input.explain } : {}),
	};
}

function nextInput(input: NextCoreAnalyzerInput, ctx: AnalysisContext) {
	const detection = detectNext(input.rootDir);
	const enrichment = detection
		? enrichNext({ graph: ctx.graph, detection, files: input.files })
		: { nodeTags: new Map(), extraEdges: [], roleIndex: new Map() };
	return {
		graph: ctx.graph,
		detection,
		enrichment,
		runId: ctx.runId,
		commitSha: ctx.commitSha,
		analysisVersion: ctx.analysisVersion,
	};
}
