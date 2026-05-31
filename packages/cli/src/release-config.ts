import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ReleaseDryRunReport = {
  status: "pass" | "fail";
  supportedTargets: string[];
  archiveLayout: string[];
  channels: string[];
  failures: string[];
};

const supportedTargets = [
  "darwin/amd64",
  "darwin/arm64",
  "linux/amd64",
  "linux/arm64",
  "windows/amd64",
  "windows/arm64",
];

const archiveLayout = [
  "rai(.exe)",
  "lib/rai/metadata.json",
  "lib/rai/engine/packages/cli/dist/index.js",
  "lib/rai/runtime/",
  "lib/rai/native/<os>-<arch>/",
];

const channels = ["github-release-disabled", "homebrew-dry-run", "scoop-dry-run", "install-script-dry-run"];

const requiredConfigSnippets = [
  "release:\n  disable: true",
  "pnpm release:prepare",
  "goos: [darwin, linux, windows]",
  "goarch: [amd64, arm64]",
  "lib/rai/metadata.json",
  "lib/rai/engine/packages/cli/dist/index.js",
  "lib/rai/runtime",
  "lib/rai/native",
  "checksum:",
  "brews:",
  "scoops:",
];

const requiredChecklistSnippets = ["Homebrew tap", "Scoop bucket", "GitHub token", "Release tag", "Dry-run only"];

const requiredRepositoryWorkflowSnippets = [
  "main is the principal trunk/default branch target",
  "feat/rai-mvp-p0-p3 is legacy integration to retire after P8",
  "approved issue",
  "exactly one type:* label",
  "passing CI",
  "reviewable diff",
  "Conventional Commit squash merge",
  "vX.Y.Z",
  "vX.Y.Z-rc.N",
  "published tags must not move",
  "rollback uses a new patch or prerelease tag",
  "explicit maintainer/user confirmation",
  "not executed in P8-S3c",
  "real publish remains disabled",
  "P8-S3b maintainer setup",
  "branch examples: feat/p8-release-policy, fix/release-check, docs/repository-workflow, chore/release-config, test/release-validator",
  "Conventional Commit commit messages",
  "Conventional Commit PR titles",
  "repository PR template",
  "Allowed/recommended scopes",
  "GoReleaser remains release artifact publisher",
  "manual vX.Y.Z tags are release authority",
  "semantic-release is not added in P8",
  "P8-S3c adds commitlint and PR-title workflow enforcement",
  "CI enforcement is preferred over local hooks",
  "no mandatory Husky or Lefthook setup is added",
];

const requiredRepositoryChecklistSnippets = [
  "P8-S3a repository workflow policy gates",
  "P8-S3b real publish activation gates",
  "main branch protection",
  "tag protection",
];

export function validateReleaseDryRunConfig(root: string): ReleaseDryRunReport {
  const failures: string[] = [];
  const configPath = join(root, ".goreleaser.yaml");
  const checklistPath = join(root, "docs", "release-maintainer-checklist.md");
  const repositoryWorkflowPath = join(root, "docs", "repository-workflow.md");
  const installScriptPath = join(root, "scripts", "install-rai.sh");
  const workflowPath = join(root, ".github", "workflows", "release.yml");

  if (!existsSync(configPath)) {
    failures.push(".goreleaser.yaml missing");
  } else {
    const config = readFileSync(configPath, "utf8");
    for (const snippet of requiredConfigSnippets) {
      if (!config.includes(snippet)) failures.push(`.goreleaser.yaml missing ${snippet}`);
    }
  }

  if (!existsSync(checklistPath)) {
    failures.push("release maintainer checklist missing");
  } else {
    const checklist = readFileSync(checklistPath, "utf8");
    for (const snippet of requiredChecklistSnippets) {
      if (!checklist.includes(snippet)) failures.push(`release maintainer checklist missing ${snippet}`);
    }
    for (const snippet of requiredRepositoryChecklistSnippets) {
      if (!checklist.includes(snippet)) failures.push(`release maintainer checklist missing ${snippet}`);
    }
  }

  if (!existsSync(repositoryWorkflowPath)) {
    failures.push("repository workflow policy missing");
  } else {
    const repositoryWorkflow = readFileSync(repositoryWorkflowPath, "utf8");
    for (const snippet of requiredRepositoryWorkflowSnippets) {
      if (!repositoryWorkflow.includes(snippet)) failures.push(`repository workflow policy missing ${snippet}`);
    }
  }

  if (!existsSync(installScriptPath)) {
    failures.push("install script missing");
  } else {
    const installScript = readFileSync(installScriptPath, "utf8");
    if (!installScript.includes("DRY_RUN_ONLY")) failures.push("install script must be dry-run only");
  }

  if (existsSync(workflowPath)) {
    const workflow = readFileSync(workflowPath, "utf8");
    if (/goreleaser\s+release(?!\s+--snapshot)/.test(workflow)) failures.push("release workflow must not run real goreleaser publish");
  }

  return {
    status: failures.length === 0 ? "pass" : "fail",
    supportedTargets,
    archiveLayout,
    channels,
    failures,
  };
}
