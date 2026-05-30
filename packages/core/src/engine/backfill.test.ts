import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import { runBackfill } from "./backfill.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-backfill-"));
  dirs.push(dir);
  git(dir, "init");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test User");
  writeFileSync(join(dir, "App.tsx"), "export function App() { return <main />; }\n");
  git(dir, "add", "App.tsx");
  git(dir, "commit", "-m", "one");
  writeFileSync(join(dir, "App.tsx"), "export function App() { return <main><span /></main>; }\n");
  git(dir, "add", "App.tsx");
  git(dir, "commit", "-m", "two");
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

test("backfill refuses a dirty worktree before checkout", () => {
  const dir = repo();
  const head = git(dir, "rev-parse", "HEAD");
  writeFileSync(join(dir, "dirty.txt"), "dirty\n");

  const result = runBackfill({ rootDir: dir, from: "HEAD~1", to: "HEAD", analyzeCommit: () => ({ ok: true }) });

  expect(result.status).toBe("refused");
  expect(result.reason).toBe("dirty-worktree");
  expect(git(dir, "rev-parse", "HEAD")).toBe(head);
});

test("backfill checks out each commit, continues partial failures, and restores HEAD", () => {
  const dir = repo();
  const original = git(dir, "rev-parse", "HEAD");
  const originalBranch = git(dir, "branch", "--show-current");
  const commits = [git(dir, "rev-parse", "HEAD~1"), git(dir, "rev-parse", "HEAD")];

  const result = runBackfill({
    rootDir: dir,
    from: "HEAD~1",
    to: "HEAD",
    analyzeCommit: (commit) => commit === commits[0] ? { ok: false, error: "boom" } : { ok: true, findings: 1 },
  });

  expect(result.status).toBe("ok");
  expect(result.restoredHead).toBe(original);
  expect(result.commits).toEqual([
    { commitSha: commits[0], status: "failed", error: "boom" },
    { commitSha: commits[1], status: "snapshotted", findings: 1 },
  ]);
  expect(git(dir, "rev-parse", "HEAD")).toBe(original);
  expect(git(dir, "branch", "--show-current")).toBe(originalBranch);
  expect(readFileSync(join(dir, "App.tsx"), "utf8")).toContain("<span />");
});

test("backfill reports already snapshotted commits as idempotent", () => {
  const dir = repo();
  const head = git(dir, "rev-parse", "HEAD");

  const result = runBackfill({
    rootDir: dir,
    from: "HEAD~1",
    to: "HEAD",
    hasSnapshot: (commit) => commit === head,
    analyzeCommit: () => ({ ok: true, findings: 1 }),
  });

  expect(result.status).toBe("ok");
  expect(result.commits.at(-1)).toEqual({ commitSha: head, status: "already-snapshotted" });
});
