import { expect, test } from "vitest";
import { tmpdir } from "node:os";
import { resolveCommitSha } from "./git-sha.js";

test("returns a 40-char hex string for a real git repo (process.cwd())", () => {
  const sha = resolveCommitSha(process.cwd());
  expect(sha).not.toBeNull();
  expect(sha).toMatch(/^[0-9a-f]{40}$/);
});

test("returns null for a non-git path (os.tmpdir())", () => {
  const sha = resolveCommitSha(tmpdir());
  expect(sha).toBeNull();
});

test("does not mutate the repo — calling resolveCommitSha is safe to repeat", () => {
  // Calling twice must not throw or change the repo state.
  // If the implementation called a mutating command it would fail on tmpdir() anyway.
  const sha1 = resolveCommitSha(process.cwd());
  const sha2 = resolveCommitSha(process.cwd());
  expect(sha1).toBe(sha2);
});
