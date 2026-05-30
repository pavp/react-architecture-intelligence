import { spawnSync } from "node:child_process";
import type { ApplyWorkspace, VerificationCommand } from "./apply-pipeline.js";

export interface GitWorkspaceOpts {
  rootDir: string;
  typecheckCommand: string[];
  testCommand: string[];
}

export function createGitWorkspace(opts: GitWorkspaceOpts): ApplyWorkspace {
  return {
    isDirty: () => git(opts.rootDir, ["status", "--porcelain"]).stdout.trim().length > 0,
    applyPatch: (patch) => { git(opts.rootDir, ["apply", "--whitespace=nowarn"], patch); },
    run: (command) => runConfigured(opts.rootDir, command.kind === "typecheck" ? opts.typecheckCommand : opts.testCommand),
    hasUnexpectedChanges: (touchedFiles) => hasUnexpectedChanges(opts.rootDir, touchedFiles),
    rollback: (rollbackPatch) => { git(opts.rootDir, ["apply", "--whitespace=nowarn"], rollbackPatch); },
    commit: (message) => {
      git(opts.rootDir, ["add", "."]);
      git(opts.rootDir, ["commit", "-m", message]);
      return git(opts.rootDir, ["rev-parse", "HEAD"]).stdout.trim();
    },
  };
}

function runConfigured(rootDir: string, command: string[]): { ok: boolean; output: string } {
  const [bin, ...args] = command;
  if (!bin) return { ok: false, output: "empty command" };
  const result = spawnSync(bin, args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { ok: result.status === 0, output: (result.stdout + result.stderr).trim() };
}

function hasUnexpectedChanges(rootDir: string, touchedFiles: string[]): boolean {
  const touched = new Set(touchedFiles);
  const changed = git(rootDir, ["status", "--porcelain"]).stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  return changed.some((file) => !touched.has(file));
}

function git(rootDir: string, args: string[], stdin?: string): { stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd: rootDir, input: stdin, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return { stdout: result.stdout, stderr: result.stderr };
}
