import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import { createGitWorkspace } from "./git-workspace.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-workspace-"));
  dirs.push(dir);
  git(dir, "init");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test User");
  writeFileSync(join(dir, "A.txt"), "old\n");
  git(dir, "add", "A.txt");
  git(dir, "commit", "-m", "init");
  return dir;
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

const patch = `diff --git a/A.txt b/A.txt
index 3367afd..3e75765 100644
--- a/A.txt
+++ b/A.txt
@@ -1 +1 @@
-old
+new
`;

const rollbackPatch = `diff --git a/A.txt b/A.txt
index 3e75765..3367afd 100644
--- a/A.txt
+++ b/A.txt
@@ -1 +1 @@
-new
+old
`;

test("git workspace detects dirty tree", () => {
  const dir = repo();
  const ws = createGitWorkspace({ rootDir: dir, typecheckCommand: ["true"], testCommand: ["true"] });
  writeFileSync(join(dir, "A.txt"), "dirty\n");

  expect(ws.isDirty()).toBe(true);
});

test("git workspace applies and rolls back patches", () => {
  const dir = repo();
  const ws = createGitWorkspace({ rootDir: dir, typecheckCommand: ["true"], testCommand: ["true"] });

  ws.applyPatch(patch);
  expect(readFileSync(join(dir, "A.txt"), "utf8")).toBe("new\n");

  ws.rollback(rollbackPatch);
  expect(readFileSync(join(dir, "A.txt"), "utf8")).toBe("old\n");
});

test("git workspace runs configured verification commands", () => {
  const dir = repo();
  const ws = createGitWorkspace({ rootDir: dir, typecheckCommand: ["true"], testCommand: ["false"] });

  expect(ws.run({ kind: "typecheck" }).ok).toBe(true);
  expect(ws.run({ kind: "test" }).ok).toBe(false);
});

test("git workspace commits changes and returns commit sha", () => {
  const dir = repo();
  const ws = createGitWorkspace({ rootDir: dir, typecheckCommand: ["true"], testCommand: ["true"] });

  ws.applyPatch(patch);
  expect(ws.hasUnexpectedChanges(["A.txt"])).toBe(false);
  const sha = ws.commit("feat: apply patch");

  expect(sha).toMatch(/^[0-9a-f]{40}$/);
});
