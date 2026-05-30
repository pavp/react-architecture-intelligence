import { spawnSync } from "node:child_process";

/**
 * Resolves the current HEAD commit SHA for the given repo path.
 * Read-only — uses `git rev-parse HEAD` with no checkout or mutation.
 * Returns null if the path is not a git repo or the command fails for any reason.
 */
export function resolveCommitSha(repoPath: string): string | null {
  const result = spawnSync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  const sha = result.stdout.trim();
  return sha.length > 0 ? sha : null;
}
