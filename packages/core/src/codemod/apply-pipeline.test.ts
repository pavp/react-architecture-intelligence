import { expect, test } from "vitest";
import { runApplyRefactorPipeline, type ApplyWorkspace } from "./apply-pipeline.js";
import type { CodemodGateResult } from "./capability-gate.js";
import type { DryRunPatchPreview } from "./dry-run.js";

const boundGate: CodemodGateResult = {
  status: "bound",
  finding: {
    id: "finding-1",
    ruleId: "react/shared-extraction",
    type: "opportunity",
    fingerprint: { structural: "fp-1", nominal: "n", positional: "p" },
    analysisVersion: 1,
    fpAlgoVersion: 1,
    producingRunId: "run-1",
    commitSha: "abc",
    severityRaw: "warn",
    evidence: { kind: "shared-extraction", instances: [], cosine: 1, propOverlap: 1, hookOverlap: 1, variancePoints: [], sharedSurface: [] },
    createdAt: 0,
  },
};

const preview: DryRunPatchPreview = {
  status: "ok",
  touchedFiles: ["A.tsx", "SharedButton.tsx"],
  patch: "patch",
  rollbackPatch: "rollback",
};

function workspace(overrides: Partial<ApplyWorkspace> = {}) {
  const events: string[] = [];
  const ws: ApplyWorkspace = {
    isDirty: () => false,
    applyPatch: (patch) => { events.push(`apply:${patch}`); },
    run: (command) => { events.push(`run:${command.kind}`); return { ok: true, output: `${command.kind}:ok` }; },
    hasUnexpectedChanges: (files) => { events.push(`check:${files.join(",")}`); return false; },
    rollback: (patch) => { events.push(`rollback:${patch}`); },
    commit: (message) => { events.push(`commit:${message}`); return "commit-sha"; },
    ...overrides,
  };
  return { ws, events };
}

test("dirty worktree refuses before mutation, even with force-like input", () => {
  const { ws, events } = workspace({ isDirty: () => true });

  const result = runApplyRefactorPipeline({ gate: boundGate, preview, workspace: ws, commitMessage: "feat: apply", force: true } as any);

  expect(result).toEqual({ status: "refused", reason: "dirty-worktree" });
  expect(events).toEqual([]);
});

test("typecheck failure rolls back and stops before tests or commit", () => {
  const { ws, events } = workspace({
    run: (command) => {
      events.push(`run:${command.kind}`);
      return command.kind === "typecheck" ? { ok: false, output: "typecheck failed" } : { ok: true, output: "ok" };
    },
  });

  const result = runApplyRefactorPipeline({ gate: boundGate, preview, workspace: ws, commitMessage: "feat: apply" });

  expect(result).toMatchObject({ status: "rolled-back", failedStage: "typecheck", rollbackApplied: true });
  expect(events).toEqual(["apply:patch", "run:typecheck", "rollback:rollback"]);
});

test("test failure rolls back after typecheck", () => {
  const { ws, events } = workspace({
    run: (command) => {
      events.push(`run:${command.kind}`);
      return command.kind === "test" ? { ok: false, output: "tests failed" } : { ok: true, output: "ok" };
    },
  });

  const result = runApplyRefactorPipeline({ gate: boundGate, preview, workspace: ws, commitMessage: "feat: apply" });

  expect(result).toMatchObject({ status: "rolled-back", failedStage: "test", rollbackApplied: true });
  expect(events).toEqual(["apply:patch", "run:typecheck", "run:test", "rollback:rollback"]);
});

test("unexpected changes roll back before commit", () => {
  const { ws, events } = workspace({ hasUnexpectedChanges: () => { events.push("check:unexpected"); return true; } });

  const result = runApplyRefactorPipeline({ gate: boundGate, preview, workspace: ws, commitMessage: "feat: apply" });

  expect(result).toMatchObject({ status: "rolled-back", failedStage: "git-clean", rollbackApplied: true });
  expect(events).toEqual(["apply:patch", "run:typecheck", "run:test", "check:unexpected", "rollback:rollback"]);
});

test("successful pipeline verifies, commits, and returns rollback proof", () => {
  const { ws, events } = workspace();

  const result = runApplyRefactorPipeline({ gate: boundGate, preview, workspace: ws, commitMessage: "feat: apply" });

  expect(result).toEqual({
    status: "applied",
    commitSha: "commit-sha",
    rollbackPatch: "rollback",
    verification: [
      { stage: "typecheck", ok: true, output: "typecheck:ok" },
      { stage: "test", ok: true, output: "test:ok" },
      { stage: "git-clean", ok: true, output: "no unexpected changes" },
    ],
  });
  expect(events).toEqual(["apply:patch", "run:typecheck", "run:test", "check:A.tsx,SharedButton.tsx", "commit:feat: apply"]);
});
