import { spawnSync } from "node:child_process";

export interface BackfillAnalyzeOk { ok: true; findings?: number | undefined; }
export interface BackfillAnalyzeFail { ok: false; error: string; }
export type BackfillAnalyzeResult = BackfillAnalyzeOk | BackfillAnalyzeFail;

export type BackfillCommitResult =
  | { commitSha: string; status: "snapshotted"; findings?: number | undefined }
  | { commitSha: string; status: "already-snapshotted" }
  | { commitSha: string; status: "failed"; error: string };

export type BackfillResult =
  | { status: "ok"; commits: BackfillCommitResult[]; restoredHead: string }
  | { status: "refused"; reason: "dirty-worktree"; message: string };

export interface BackfillInput {
  rootDir: string;
  from: string;
  to: string;
  analyzeCommit: (commitSha: string) => BackfillAnalyzeResult;
  hasSnapshot?: ((commitSha: string) => boolean) | undefined;
}

export function runBackfill(input: BackfillInput): BackfillResult {
  if (isDirty(input.rootDir)) {
    return { status: "refused", reason: "dirty-worktree", message: "backfill requires a clean worktree" };
  }

  const originalHead = git(input.rootDir, ["rev-parse", "HEAD"]).stdout.trim();
  const originalRef = git(input.rootDir, ["branch", "--show-current"]).stdout.trim() || originalHead;
  const fromSha = git(input.rootDir, ["rev-parse", input.from]).stdout.trim();
  const commits = [
    fromSha,
    ...git(input.rootDir, ["rev-list", "--reverse", `${input.from}..${input.to}`]).stdout
      .split("\n")
      .filter(Boolean),
  ].filter((commit, index, all) => all.indexOf(commit) === index);
  const results: BackfillCommitResult[] = [];

  try {
    for (const commitSha of commits) {
      if (input.hasSnapshot?.(commitSha)) {
        results.push({ commitSha, status: "already-snapshotted" });
        continue;
      }
      try {
        git(input.rootDir, ["checkout", "--detach", commitSha]);
        const analyzed = input.analyzeCommit(commitSha);
        if (analyzed.ok) {
          results.push({ commitSha, status: "snapshotted", ...(analyzed.findings !== undefined ? { findings: analyzed.findings } : {}) });
        } else {
          results.push({ commitSha, status: "failed", error: analyzed.error });
        }
      } catch (error) {
        results.push({ commitSha, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    git(input.rootDir, ["checkout", originalRef]);
  }

  return { status: "ok", commits: results, restoredHead: originalHead };
}

function isDirty(rootDir: string): boolean {
  return git(rootDir, ["status", "--porcelain"]).stdout.trim().length > 0;
}

function git(rootDir: string, args: string[]): { stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return { stdout: result.stdout, stderr: result.stderr };
}
