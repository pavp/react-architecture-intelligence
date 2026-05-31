import { afterEach, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs, run, runAnalyze, runBackfillCommand, buildCliMcpServer } from "./cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUTTONS = resolve(HERE, "../../../fixtures/duplication/buttons");
const NEXT_APP_ROUTER_BLOAT = resolve(HERE, "../../../fixtures/next/app-router-bloat");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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
  expect(parseArgs(["backfill", "/repo", "--from", "v1", "--to", "HEAD", "--db", "rai.db"])).toEqual({
    cmd: "backfill",
    dir: "/repo",
    from: "v1",
    to: "HEAD",
    dbPath: "rai.db",
  });
});

test("parseArgs routes install with platform and safety flags", () => {
  expect(parseArgs(["install", "--platform", "opencode,codex", "--platform", "copilot", "--dry-run", "--yes", "--no-instructions"])).toEqual({
    cmd: "install",
    dir: ".",
    platforms: ["opencode,codex", "copilot"],
    dryRun: true,
    yes: true,
    includeInstructions: false,
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
  expect(r.topFingerprints).toHaveLength(r.counts.byType.opportunity + r.counts.byType.conflict);
});

test("runAnalyze on plain React emits no Next adapter diagnostics or extra findings", async () => {
  const r = await runAnalyze(BUTTONS);

  expect(r.counts.byType.opportunity).toBe(1);
  expect(r.counts.diagnostics).toBe(0);
  expect(r.diagnostics).toEqual([]);
});

test("runBackfillCommand snapshots Next adapter findings with analyze parity", async () => {
  const dir = nextRepo();
  const analyze = await runAnalyze(dir);
  const backfill = await runBackfillCommand({ dir, from: "HEAD~1", to: "HEAD", dbPath: ".git/rai.db" });

  expect(backfill.status).toBe("ok");
  expect(backfill.commits.map((commit) => commit.status)).toEqual(["snapshotted", "snapshotted"]);
  expect(backfill.commits.at(-1)).toMatchObject({ findings: analyze.topFingerprints.length });
});

test("buildCliMcpServer reuses CLI adapter composition for analyze_repo", async () => {
  const { session } = await buildCliMcpServer(NEXT_APP_ROUTER_BLOAT);
  const r = session.analyzeRepo({ files: readSourcesForTest(NEXT_APP_ROUTER_BLOAT), asOf: 0, runId: "mcp", commitSha: "sha" });

  expect(r.counts.byType.opportunity).toBeGreaterThanOrEqual(2);
  expect(r.counts.diagnostics).toBe(0);
  expect(r.topFingerprints).toHaveLength(r.counts.byType.opportunity + r.counts.byType.conflict);
});

test("run install --dry-run prints a read-only plan and writes nothing", async () => {
  const dir = installRepo();
  const output = await captureStdout(() => run(["install", "--platform", "opencode", "--dry-run", "--no-instructions"]));

  expect(output.code).toBe(0);
  const plan = JSON.parse(output.stdout) as { status: string; operations: Array<{ path: string; dryRun: boolean }> };
  expect(plan.status).toBe("ok");
  expect(plan.operations).toEqual([expect.objectContaining({ path: join(dir, "opencode.json"), dryRun: true })]);
  expect(readFileSync(join(dir, "opencode.json"), "utf8")).toBe("{}\n");
});

test("run install without --yes prints a plan and requires confirmation before writing", async () => {
  const dir = installRepo();
  const output = await captureStdout(() => run(["install", "--no-instructions"]));

  expect(output.code).toBe(1);
  const envelope = JSON.parse(output.stdout) as { status: string; plan: { operations: unknown[] } };
  expect(envelope.status).toBe("confirmation-required");
  expect(envelope.plan.operations).toHaveLength(2);
  expect(readFileSync(join(dir, "opencode.json"), "utf8")).toBe("{}\n");
});

test("run install --yes applies MCP config and skips instructions when requested", async () => {
  const dir = installRepo();
  const output = await captureStdout(() => run(["install", "--platform", "opencode", "--yes", "--no-instructions"]));

  expect(output.code).toBe(0);
  const result = JSON.parse(output.stdout) as { status: string; operations: Array<{ kind: string; status: string }> };
  expect(result).toMatchObject({ status: "ok", operations: [{ kind: "mcp-config", status: "ok" }] });
  expect(JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8"))).toMatchObject({ mcp: { rai: { command: "rai", args: ["mcp", dir] } } });
  expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
});

test("runBackfillCommand analyzes historical commits into a persistent db", async () => {
  const dir = repo();
  const dbPath = ".git/rai.db";
  const result = await runBackfillCommand({ dir, from: "HEAD~1", to: "HEAD", dbPath });

  expect(result.status).toBe("ok");
  expect(result.commits.map((commit) => commit.status)).toEqual(["snapshotted", "snapshotted"]);
});

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-cli-backfill-"));
  dirs.push(dir);
  git(dir, "init");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test User");
  writeFileSync(join(dir, "A.tsx"), "export function A() { return <button>A</button>; }\n");
  writeFileSync(join(dir, "B.tsx"), "export function B() { return <button>A</button>; }\n");
  writeFileSync(join(dir, "C.tsx"), "export function C() { return <button>A</button>; }\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "one");
  writeFileSync(join(dir, "C.tsx"), "export function C() { return <button>C</button>; }\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "two");
  return dir;
}

function readSourcesForTest(rootDir: string): { file: string; source: string }[] {
  return [
    { file: "app/dashboard/page.tsx", source: "export default function DashboardPage() { return <main><A /><B /><C /><D /></main>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n" },
    { file: "app/dashboard/layout.tsx", source: "'use client';\nexport default function DashboardLayout() { return <div><A /><B /><C /><D /></div>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n" },
  ];
}

function nextRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-cli-next-backfill-"));
  dirs.push(dir);
  git(dir, "init");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test User");
  mkdirSync(join(dir, "app", "dashboard"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  writeFileSync(join(dir, "next.config.js"), "export default {};\n");
  writeFileSync(join(dir, "app", "dashboard", "page.tsx"), "export default function DashboardPage() { return <main><A /><B /></main>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "one");
  writeFileSync(join(dir, "app", "dashboard", "page.tsx"), "export default function DashboardPage() { return <main><A /><B /><C /><D /></main>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n");
  writeFileSync(join(dir, "app", "dashboard", "layout.tsx"), "'use client';\nexport default function DashboardLayout() { return <div><A /><B /><C /><D /></div>; }\nfunction A() { return <section />; }\nfunction B() { return <section />; }\nfunction C() { return <section><D /></section>; }\nfunction D() { return <section />; }\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "two");
  return dir;
}

function installRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rai-cli-install-")));
  dirs.push(dir);
  writeFileSync(join(dir, "opencode.json"), "{}\n");
  return dir;
}

async function captureStdout(runCommand: () => Promise<number>): Promise<{ code: number; stdout: string }> {
  const originalCwd = process.cwd();
  const originalStdoutWrite = process.stdout.write;
  let stdout = "";
  process.chdir(dirs.at(-1) ?? originalCwd);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    return { code: await runCommand(), stdout };
  } finally {
    process.chdir(originalCwd);
    process.stdout.write = originalStdoutWrite;
  }
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
