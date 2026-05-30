import { afterEach, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs, runAnalyze, runBackfillCommand } from "./cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUTTONS = resolve(HERE, "../../../fixtures/duplication/buttons");
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

test("parseArgs returns help for no args", () => {
  expect(parseArgs([]).cmd).toBe("help");
});

test("parseArgs returns help for an unknown command", () => {
  expect(parseArgs(["frobnicate"]).cmd).toBe("help");
});

test("runAnalyze on the buttons fixture finds one opportunity", () => {
  const r = runAnalyze(BUTTONS);
  expect(r.counts.byType.opportunity).toBe(1);
  expect(r.counts.bySeverity.warn).toBe(1);
});

test("runBackfillCommand analyzes historical commits into a persistent db", () => {
  const dir = repo();
  const dbPath = ".git/rai.db";
  const result = runBackfillCommand({ dir, from: "HEAD~1", to: "HEAD", dbPath });

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

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
