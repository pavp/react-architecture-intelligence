import { afterEach, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { readSources } from "@rai/core";
import {
	parseArgs,
	run,
	runAnalyze,
	runBackfillCommand,
	buildCliMcpServer,
} from "./cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUTTONS = resolve(HERE, "../../../fixtures/duplication/buttons");
const NEXT_APP_ROUTER_BLOAT = resolve(
	HERE,
	"../../../fixtures/next/app-router-bloat",
);
const REACT_COMPOUND_PRIMITIVES = resolve(
	HERE,
	"../../../fixtures/react/compound-primitives",
);
const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

test("parseArgs routes analyze with a directory", () => {
	expect(parseArgs(["analyze", "src"])).toEqual({ cmd: "analyze", dir: "src" });
});

test("parseArgs defaults the directory to '.'", () => {
	expect(parseArgs(["analyze"])).toEqual({ cmd: "analyze", dir: "." });
});

test("parseArgs routes mcp", () => {
	expect(parseArgs(["mcp", "/repo"])).toEqual({ cmd: "mcp", dir: "/repo" });
});

test("parseArgs routes backfill with range and db path", () => {
	expect(
		parseArgs([
			"backfill",
			"/repo",
			"--from",
			"v1",
			"--to",
			"HEAD",
			"--db",
			"rai.db",
		]),
	).toEqual({
		cmd: "backfill",
		dir: "/repo",
		from: "v1",
		to: "HEAD",
		dbPath: "rai.db",
	});
});

test("parseArgs routes install with platform and safety flags", () => {
	expect(
		parseArgs([
			"install",
			"--platform",
			"opencode,codex",
			"--platform",
			"copilot",
			"--dry-run",
			"--yes",
			"--no-instructions",
		]),
	).toEqual({
		cmd: "install",
		dir: ".",
		platforms: ["opencode,codex", "copilot"],
		dryRun: true,
		yes: true,
		json: false,
		includeInstructions: false,
	});
});

test("parseArgs routes doctor with JSON output", () => {
	expect(parseArgs(["doctor", "/repo", "--json"])).toEqual({
		cmd: "doctor",
		dir: "/repo",
		json: true,
	});
});

test("parseArgs routes explain with a direct file and JSON output", () => {
	expect(parseArgs(["explain", "LoginButton.tsx", "--json"])).toEqual({
		cmd: "explain",
		dir: ".",
		file: "LoginButton.tsx",
		json: true,
	});
});

test("parseArgs keeps explicit repo directory form for explain", () => {
	expect(parseArgs(["explain", BUTTONS, "LoginButton.tsx", "--json"])).toEqual({
		cmd: "explain",
		dir: BUTTONS,
		file: "LoginButton.tsx",
		json: true,
	});
});

test("parseArgs returns help for no args", () => {
	expect(parseArgs([]).cmd).toBe("help");
});

test("parseArgs returns help for an unknown command", () => {
	expect(parseArgs(["frobnicate"]).cmd).toBe("help");
});

test("runAnalyze on the buttons fixture finds one opportunity", async () => {
	const r = await runAnalyze(BUTTONS);
	expect(r.counts.byType.opportunity).toBe(1);
	expect(r.counts.bySeverity.warn).toBe(1);
});

test("runAnalyze on the Next fixture returns Next adapter findings through the normal result shape", async () => {
	const r = await runAnalyze(NEXT_APP_ROUTER_BLOAT);

	expect(r.counts.byType.opportunity).toBeGreaterThanOrEqual(2);
	expect(r.counts.diagnostics).toBe(0);
	expect(r.topFingerprints).toHaveLength(
		r.counts.byType.opportunity + r.counts.byType.conflict,
	);
});

test("runAnalyze on plain React emits no Next adapter diagnostics or extra findings", async () => {
	const r = await runAnalyze(BUTTONS);

	expect(r.counts.byType.opportunity).toBe(1);
	expect(r.counts.diagnostics).toBe(0);
	expect(r.diagnostics).toEqual([]);
});

test("run explain renders relevant finding summaries for a file without feedback writes", async () => {
	const cwd = process.cwd();
	process.chdir(BUTTONS);
	try {
		const output = await captureStdout(() =>
			run(["explain", "LoginButton.tsx"]),
		);

		expect(output.code).toBe(0);
		expect(output.stdout).toContain("RAI explain: LoginButton.tsx");
		expect(output.stdout).toContain("react/shared-extraction");
		expect(output.stdout).toContain("3 components share similar source shape:");
		expect(output.stdout).not.toContain(
			"RAI found 3 similar components for react/shared-extraction.",
		);
		expect(output.stdout).toContain("What to inspect first:");
		expect(output.stdout).not.toContain("Inspect first:");
		expect(output.stdout).toContain("Fingerprint:");
		expect(output.stdout).toContain(
			"Do not assume shared ownership, intent, root cause, user impact, or safe remediation from this finding alone.",
		);
		expect(output.stdout).not.toContain("record_feedback");
	} finally {
		process.chdir(cwd);
	}
});

test("run explain renders adapter-owned Next summaries through CLI composition", async () => {
	const output = await captureStdout(() =>
		run(["explain", NEXT_APP_ROUTER_BLOAT, "app/dashboard/layout.tsx"]),
	);

	expect(output.code).toBe(0);
	expect(output.stdout).toContain("next/client-boundary-bloat");
	expect(output.stdout).toContain(
		"DashboardLayout is a client boundary with render topology above configured limits",
	);
	expect(output.stdout).not.toMatch(
		/\badapter:\snext|\brule:\snext\/|\bmetric [A-Za-z0-9_]+:|\bthreshold [A-Za-z0-9_]+:|\bexceeded topology:/,
	);
});

test("run explain reports no relevant findings for an unrelated file", async () => {
	const output = await captureStdout(() =>
		run(["explain", BUTTONS, "Missing.tsx"]),
	);

	expect(output.code).toBe(0);
	expect(output.stdout).toBe("No relevant findings for Missing.tsx.\n");
});

test("run explain --json returns relevant raw findings with explanation envelopes", async () => {
	const output = await captureStdout(() =>
		run(["explain", BUTTONS, "LoginButton.tsx", "--json"]),
	);

	expect(output.code).toBe(0);
	const parsed = JSON.parse(output.stdout) as {
		file: string;
		findings: Array<{
			explanation: { summary: string; groundingFields: string[] };
			finding: {
				ruleId: string;
				severity: string;
				status: string;
				fingerprint: { structural: string };
				evidence: { kind: string; instances: unknown[] };
			};
			evidence: { kind: string; instances: unknown[] };
			groundingFields: string[];
			memory: { net: string; eventCount: number };
		}>;
	};
	expect(parsed.file).toBe("LoginButton.tsx");
	expect(parsed.findings).toHaveLength(1);
	const [item] = parsed.findings;
	expect(item!.finding).toMatchObject({
		ruleId: "react/shared-extraction",
		severity: "warn",
		status: "active",
		evidence: { kind: "shared-extraction" },
	});
	expect(item!.evidence).toEqual(item!.finding.evidence);
	expect(item!.groundingFields).toEqual(Object.keys(item!.evidence));
	expect(item!.groundingFields).toEqual(
		expect.arrayContaining(["instances", "sharedSurface"]),
	);
	expect(item!.memory).toMatchObject({ net: "neutral", eventCount: 0 });
	expect(item!.explanation.summary).toMatch(
		/^3 components share similar source shape:/,
	);
	expect(item!.explanation.summary).not.toMatch(/^RAI found/);
	expect(item!.finding.fingerprint.structural.length).toBeGreaterThan(10);
});

test("runBackfillCommand snapshots Next adapter findings with analyze parity", async () => {
	const dir = nextRepo();
	const analyze = await runAnalyze(dir);
	const backfill = await runBackfillCommand({
		dir,
		from: "HEAD~1",
		to: "HEAD",
		dbPath: ".git/rai.db",
	});

	if (backfill.status !== "ok") throw new Error(backfill.message);
	expect(backfill.commits.map((commit) => commit.status)).toEqual([
		"snapshotted",
		"snapshotted",
	]);
	expect(backfill.commits.at(-1)).toMatchObject({
		findings: analyze.topFingerprints.length,
	});
});

test("buildCliMcpServer reuses CLI adapter composition for analyze_repo", async () => {
	const { session } = await buildCliMcpServer(NEXT_APP_ROUTER_BLOAT);
	const r = session.analyzeRepo({
		files: readSourcesForTest(NEXT_APP_ROUTER_BLOAT),
		asOf: 0,
		runId: "mcp",
		commitSha: "sha",
	});

	expect(r.counts.byType.opportunity).toBeGreaterThanOrEqual(2);
	expect(r.counts.diagnostics).toBe(0);
	expect(r.topFingerprints).toHaveLength(
		r.counts.byType.opportunity + r.counts.byType.conflict,
	);
});

test("buildCliMcpServer includes React adapter compound divergence through analyze_repo", async () => {
	const { session } = await buildCliMcpServer(REACT_COMPOUND_PRIMITIVES);
	const r = session.analyzeRepo({
		files: readSources(REACT_COMPOUND_PRIMITIVES),
		asOf: 0,
		runId: "mcp-react",
		commitSha: "sha",
	});
	const findings = session
		.findSharedOpportunities({ includeSuppressed: false })
		.opportunities.filter(
			(finding) => finding.ruleId === "react/compound-component-api-drift",
		);

	expect(r.counts.byType.opportunity).toBeGreaterThanOrEqual(1);
	expect(r.counts.diagnostics).toBe(0);
	expect(findings).toHaveLength(1);
	expect(findings[0]!.evidence).toMatchObject({
		kind: "adapter-metric",
		adapterId: "react",
		topology: { exceeded: ["missingDeclarations:Footer"] },
	});
});

// Task 2.1 RED: bare rai install applies directly, exits 0, human-readable output
test("run install with no flags applies directly and emits human-readable output", async () => {
	const dir = installRepo();
	const output = await captureStdout(() =>
		run(["install", "--platform", "opencode", "--no-instructions"]),
	);

	expect(output.code).toBe(0);
	// Should NOT be JSON — human-readable summary
	expect(() => JSON.parse(output.stdout)).toThrow();
	expect(output.stdout).toMatch(/opencode/i);
	// File must actually be written
	const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as Record<string, unknown>;
	expect(written).toMatchObject({ mcp: { rai: expect.any(Object) } });
});

// Task 2.3 RED: bare rai install does NOT return confirmation-required or exit 1
test("run install without --yes does not return confirmation-required", async () => {
	const dir = installRepo();
	const output = await captureStdout(() =>
		run(["install", "--platform", "opencode", "--no-instructions"]),
	);

	expect(output.code).toBe(0);
	expect(output.stdout).not.toContain("confirmation-required");
	// No file left unwritten
	const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as Record<string, unknown>;
	expect(written).toMatchObject({ mcp: { rai: expect.any(Object) } });
});

// Task 2.4 RED: --json flag emits raw JSON envelope
test("run install --json emits raw JSON install result envelope", async () => {
	installRepo();
	const output = await captureStdout(() =>
		run(["install", "--platform", "opencode", "--no-instructions", "--json"]),
	);

	expect(output.code).toBe(0);
	const envelope = JSON.parse(output.stdout) as { status: string; operations: unknown[] };
	expect(envelope.status).toBe("ok");
	expect(envelope.operations).toBeInstanceOf(Array);
	// Must not contain prose mixed in
	expect(output.stdout.trim()).toBe(JSON.stringify(envelope, null, 2));
});

// Task 2.2 RED: --dry-run exits 0 and does not write files (human-readable or JSON both fine)
test("run install --dry-run exits 0 and writes no files", async () => {
	const dir = installRepo();
	const output = await captureStdout(() =>
		run([
			"install",
			"--platform",
			"opencode",
			"--dry-run",
			"--no-instructions",
		]),
	);

	expect(output.code).toBe(0);
	// File unchanged
	expect(readFileSync(join(dir, "opencode.json"), "utf8")).toBe("{}\n");
});

test("run install --dry-run prints a read-only plan and writes nothing", async () => {
	const dir = installRepo();
	const output = await captureStdout(() =>
		run([
			"install",
			"--platform",
			"opencode",
			"--dry-run",
			"--no-instructions",
		]),
	);

	expect(output.code).toBe(0);
	const plan = JSON.parse(output.stdout) as {
		status: string;
		operations: Array<{ path: string; dryRun: boolean }>;
	};
	expect(plan.status).toBe("ok");
	expect(plan.operations).toEqual([
		expect.objectContaining({ path: join(dir, "opencode.json"), dryRun: true }),
	]);
	expect(readFileSync(join(dir, "opencode.json"), "utf8")).toBe("{}\n");
});

// Task 3.1: inverted — bare install now applies directly (no confirmation-required)
test("run install without --yes applies directly (confirmation gate removed)", async () => {
	const dir = installRepo();
	const output = await captureStdout(() =>
		run(["install", "--platform", "opencode", "--no-instructions"]),
	);

	expect(output.code).toBe(0);
	expect(output.stdout).not.toContain("confirmation-required");
	// File is written
	const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as Record<string, unknown>;
	expect(written).toMatchObject({ mcp: { rai: expect.any(Object) } });
});

test("run install --yes --json applies MCP config and skips instructions when requested", async () => {
	const dir = installRepo();
	const output = await captureStdout(() =>
		run(["install", "--platform", "opencode", "--yes", "--json", "--no-instructions"]),
	);

	expect(output.code).toBe(0);
	const result = JSON.parse(output.stdout) as {
		status: string;
		operations: Array<{ kind: string; status: string }>;
	};
	expect(result).toMatchObject({
		status: "ok",
		operations: [{ kind: "mcp-config", status: "ok" }],
	});
	expect(
		JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")),
	).toMatchObject({ mcp: { rai: { command: "rai", args: ["mcp", dir] } } });
	expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
});

test("run doctor --json exits zero for a healthy temp project", async () => {
	doctorRepo();
	const output = await captureStdout(() => run(["doctor", ".", "--json"]));

	expect(output.code).toBe(0);
	const report = JSON.parse(output.stdout) as {
		status: string;
		checks: Array<{ name: string; status: string }>;
	};
	expect(report.status).toBe("pass");
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "MCP config", status: "pass" }),
		]),
	);
});

test("run doctor prints stable text output", async () => {
	doctorRepo();
	const output = await captureStdout(() => run(["doctor"]));

	expect(output.code).toBe(0);
	expect(output.stdout).toContain("RAI doctor: pass");
	expect(output.stdout).toContain("[pass] runtime / Node >=22");
});

test("run doctor exits non-zero for blocking config failures", async () => {
	const dir = doctorRepo();
	writeFileSync(join(dir, "opencode.json"), "{ broken");
	const output = await captureStdout(() => run(["doctor", ".", "--json"]));

	expect(output.code).toBe(1);
	const report = JSON.parse(output.stdout) as {
		status: string;
		checks: Array<{ name: string; status: string }>;
	};
	expect(report.status).toBe("fail");
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "MCP config", status: "fail" }),
		]),
	);
});

test("runBackfillCommand analyzes historical commits into a persistent db", async () => {
	const dir = repo();
	const dbPath = ".git/rai.db";
	const result = await runBackfillCommand({
		dir,
		from: "HEAD~1",
		to: "HEAD",
		dbPath,
	});

	if (result.status !== "ok") throw new Error(result.message);
	expect(result.commits.map((commit) => commit.status)).toEqual([
		"snapshotted",
		"snapshotted",
	]);
});

function repo(): string {
	const dir = mkdtempSync(join(tmpdir(), "rai-cli-backfill-"));
	dirs.push(dir);
	git(dir, "init");
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Test User");
	writeFileSync(
		join(dir, "A.tsx"),
		"export function A() { return <button>A</button>; }\n",
	);
	writeFileSync(
		join(dir, "B.tsx"),
		"export function B() { return <button>A</button>; }\n",
	);
	writeFileSync(
		join(dir, "C.tsx"),
		"export function C() { return <button>A</button>; }\n",
	);
	git(dir, "add", ".");
	git(dir, "commit", "-m", "one");
	writeFileSync(
		join(dir, "C.tsx"),
		"export function C() { return <button>C</button>; }\n",
	);
	git(dir, "add", ".");
	git(dir, "commit", "-m", "two");
	return dir;
}

function readSourcesForTest(
	_rootDir: string,
): { file: string; source: string }[] {
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

function nextRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "rai-cli-next-backfill-"));
	dirs.push(dir);
	git(dir, "init");
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Test User");
	mkdirSync(join(dir, "app", "dashboard"), { recursive: true });
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({ dependencies: { next: "15.0.0" } }),
	);
	writeFileSync(join(dir, "next.config.js"), "export default {};\n");
	writeFileSync(
		join(dir, "app", "dashboard", "page.tsx"),
		"export default function DashboardPage() { return <main><A /><B /></main>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\n",
	);
	git(dir, "add", ".");
	git(dir, "commit", "-m", "one");
	writeFileSync(
		join(dir, "app", "dashboard", "page.tsx"),
		"export default function DashboardPage() { return <main><A /><B /><C /><D /></main>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n",
	);
	writeFileSync(
		join(dir, "app", "dashboard", "layout.tsx"),
		"'use client';\nexport default function DashboardLayout() { return <div><A /><B /><C /><D /></div>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n",
	);
	git(dir, "add", ".");
	git(dir, "commit", "-m", "two");
	return dir;
}

function installRepo(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "rai-cli-install-")));
	dirs.push(dir);
	writeFileSync(join(dir, "opencode.json"), "{}\n");
	process.env.XDG_CONFIG_HOME = join(dir, ".config");
	return dir;
}

function doctorRepo(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "rai-cli-doctor-")));
	dirs.push(dir);
	mkdirSync(join(dir, "packages", "cli", "dist"), { recursive: true });
	writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture" }));
	writeFileSync(
		join(dir, "packages", "cli", "dist", "index.js"),
		"#!/usr/bin/env node\n",
	);
	writeFileSync(
		join(dir, "opencode.json"),
		JSON.stringify({ mcp: { rai: { command: "rai", args: ["mcp", dir] } } }),
	);
	return dir;
}

async function captureStdout(
	runCommand: () => Promise<number>,
): Promise<{ code: number; stdout: string }> {
	const originalCwd = process.cwd();
	const originalStdoutWrite = process.stdout.write;
	const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	let stdout = "";
	process.chdir(dirs.at(-1) ?? originalCwd);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		stdout +=
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		return true;
	}) as typeof process.stdout.write;
	try {
		return { code: await runCommand(), stdout };
	} finally {
		process.chdir(originalCwd);
		process.stdout.write = originalStdoutWrite;
		if (originalXdgConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
		}
	}
}

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout.trim();
}
