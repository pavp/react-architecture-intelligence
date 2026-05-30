import type { CodemodGateResult } from "./capability-gate.js";
import type { DryRunPatchPreview } from "./dry-run.js";

export type VerificationStage = "typecheck" | "test" | "git-clean";

export interface VerificationCommand {
  kind: "typecheck" | "test";
}

export interface VerificationResult {
  stage: VerificationStage;
  ok: boolean;
  output: string;
}

export interface ApplyWorkspace {
  isDirty(): boolean;
  applyPatch(patch: string): void;
  run(command: VerificationCommand): { ok: boolean; output: string };
  hasUnexpectedChanges(touchedFiles: string[]): boolean;
  rollback(rollbackPatch: string): void;
  commit(message: string): string;
}

export type ApplyPipelineResult =
  | { status: "refused"; reason: "gate-refused" | "preview-refused" | "dirty-worktree" }
  | { status: "rolled-back"; failedStage: VerificationStage; rollbackApplied: true; verification: VerificationResult[] }
  | { status: "applied"; commitSha: string; rollbackPatch: string; verification: VerificationResult[] };

export interface ApplyPipelineInput {
  gate: CodemodGateResult;
  preview: DryRunPatchPreview;
  workspace: ApplyWorkspace;
  commitMessage: string;
}

export function runApplyRefactorPipeline(input: ApplyPipelineInput): ApplyPipelineResult {
  if (input.gate.status !== "bound") return { status: "refused", reason: "gate-refused" };
  if (input.preview.status !== "ok") return { status: "refused", reason: "preview-refused" };
  if (input.workspace.isDirty()) return { status: "refused", reason: "dirty-worktree" };

  const verification: VerificationResult[] = [];
  input.workspace.applyPatch(input.preview.patch);

  const typecheck = runStage(input.workspace, "typecheck");
  verification.push(typecheck);
  if (!typecheck.ok) return rollback(input.workspace, input.preview.rollbackPatch, "typecheck", verification);

  const test = runStage(input.workspace, "test");
  verification.push(test);
  if (!test.ok) return rollback(input.workspace, input.preview.rollbackPatch, "test", verification);

  const clean = !input.workspace.hasUnexpectedChanges(input.preview.touchedFiles);
  verification.push({ stage: "git-clean", ok: clean, output: clean ? "no unexpected changes" : "unexpected changes" });
  if (!clean) return rollback(input.workspace, input.preview.rollbackPatch, "git-clean", verification);

  const commitSha = input.workspace.commit(input.commitMessage);
  return { status: "applied", commitSha, rollbackPatch: input.preview.rollbackPatch, verification };
}

function runStage(workspace: ApplyWorkspace, kind: "typecheck" | "test"): VerificationResult {
  const result = workspace.run({ kind });
  return { stage: kind, ok: result.ok, output: result.output };
}

function rollback(workspace: ApplyWorkspace, rollbackPatch: string, failedStage: VerificationStage, verification: VerificationResult[]): ApplyPipelineResult {
  workspace.rollback(rollbackPatch);
  return { status: "rolled-back", failedStage, rollbackApplied: true, verification };
}
