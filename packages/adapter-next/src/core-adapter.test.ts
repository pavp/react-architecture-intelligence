import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
	createDefaultAnalyzerRegistry,
	createSession,
	type SourceFile,
} from "@rai/core";
import { DEFAULT_CONFIG } from "@rai/core";
import { createNextCoreAnalyzers } from "./core-adapter.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

test("createNextCoreAnalyzers returns core-compatible analyzers with Next findings and diagnostics", () => {
	const rootDir = nextRoot("app-router-bloat");
	writeFileSync(join(rootDir, "next.config.js"), "export default {};\n");
	const files = nextFixtureFiles();
	writeNextFixtureFiles(rootDir, files);
	const registry = createDefaultAnalyzerRegistry();
	for (const analyzer of createNextCoreAnalyzers({ rootDir, files }))
		registry.register(analyzer);

	const session = createSession({ config: DEFAULT_CONFIG });
	const result = session.analyzeRepo({
		files,
		asOf: 0,
		runId: "next-run",
		commitSha: "next-sha",
	});
	const baselineCount = result.counts.byType.opportunity;

	const adapted = analyzeWithRegistry(files, registry);

	expect(adapted.counts.byType.opportunity).toBeGreaterThan(baselineCount);
	expect(adapted.counts.diagnostics).toBe(0);
	expect(adapted.topFingerprints).toHaveLength(
		adapted.counts.byType.opportunity + adapted.counts.byType.conflict,
	);
});

test("createNextCoreAnalyzers preserves adapter-owned explanations through session explain", () => {
	const rootDir = nextRoot("app-router-explain");
	writeFileSync(join(rootDir, "next.config.js"), "export default {};\n");
	const files = nextFixtureFiles();
	writeNextFixtureFiles(rootDir, files);
	const registry = createDefaultAnalyzerRegistry();
	for (const analyzer of createNextCoreAnalyzers({ rootDir, files }))
		registry.register(analyzer);
	const session = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => registry,
	});
	session.analyzeRepo({
		files,
		asOf: 0,
		runId: "next-explain",
		commitSha: "sha",
	});
	const cases = [
		{
			ruleId: "next/client-boundary-bloat",
			summary:
				"is a client boundary with render topology above configured limits",
		},
		{
			ruleId: "next/route-coupling",
			summary:
				"is a route segment with render topology above configured limits",
		},
	];

	for (const tt of cases) {
		const finding = session
			.findSharedOpportunities({ includeSuppressed: false })
			.opportunities.find((item) => item.ruleId === tt.ruleId);
		if (!finding) throw new Error(`expected ${tt.ruleId} finding`);
		const beforeFinding = cloneJson(finding);

		const explained = session.explainFinding({
			fingerprint: finding.fingerprint.structural,
		});

		expect(explained.evidence, tt.ruleId).toEqual(beforeFinding.evidence);
		expect(explained.finding, tt.ruleId).toEqual(beforeFinding);
		expect(explained.finding.fingerprint, tt.ruleId).toEqual(
			beforeFinding.fingerprint,
		);
		expect(explained.explanation.summary, tt.ruleId).toContain(tt.summary);
		expect(
			explained.explanation.inspectFirst.join("\n"),
			tt.ruleId,
		).not.toMatch(
			/\badapter:\s|\brule:\s|\bmetric [A-Za-z0-9_]+:|\bthreshold [A-Za-z0-9_]+:|\bexceeded topology:/,
		);
	}
});

test("createNextCoreAnalyzers returns no Next findings for non-Next sources", () => {
	const rootDir = mkdtempSync(join(tmpdir(), "rai-non-next-"));
	dirs.push(rootDir);
	const files = [
		{
			file: "App.tsx",
			source:
				"export function App() { return <main><Button /></main>; }\nfunction Button() { return <button />; }\n",
		},
	];
	const registry = createDefaultAnalyzerRegistry();
	for (const analyzer of createNextCoreAnalyzers({ rootDir, files }))
		registry.register(analyzer);

	const result = analyzeWithRegistry(files, registry);

	expect(result.counts.diagnostics).toBe(0);
	expect(result.counts.byType.opportunity).toBe(0);
});

function analyzeWithRegistry(
	files: SourceFile[],
	registry: ReturnType<typeof createDefaultAnalyzerRegistry>,
) {
	const session = createSession({
		config: DEFAULT_CONFIG,
		registryFactory: () => registry,
	});
	const result = session.analyzeRepo({
		files,
		asOf: 0,
		runId: "run",
		commitSha: "sha",
	});
	return result;
}

function nextRoot(name: string): string {
	const dir = mkdtempSync(join(tmpdir(), `rai-${name}-`));
	dirs.push(dir);
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({ dependencies: { next: "15.0.0" } }),
	);
	return dir;
}

function writeNextFixtureFiles(rootDir: string, files: SourceFile[]): void {
	for (const file of files) {
		const full = join(rootDir, file.file);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, file.source);
	}
}

function nextFixtureFiles(): SourceFile[] {
	return [
		{
			file: "app/dashboard/page.tsx",
			source:
				"export default function DashboardPage() { return <main><A /><B /><C /><D /></main>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n",
		},
		{
			file: "app/dashboard/layout.tsx",
			source:
				"'use client';\nexport default function DashboardLayout() { return <div><A /><B /><C /><D /></div>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n",
		},
	];
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
