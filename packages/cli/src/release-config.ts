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

const channels = [
  "github-release-enabled",
  "homebrew:pavp/homebrew-tap",
  "scoop:pavp/scoop-bucket",
  "snapshot-preflight-retained",
];

const requiredConfigSnippets = [
  "pnpm release:prepare",
  "goos: [darwin, linux, windows]",
  "goarch: [amd64, arm64]",
  "lib/rai/metadata.json",
  "lib/rai/engine/packages/cli/dist/index.js",
  "lib/rai/runtime",
  "lib/rai/native",
  "checksum:",
  "brews:",
  'owner: "pavp"',
  'name: "homebrew-tap"',
  "scoops:",
  'name: "scoop-bucket"',
  "{{ .Env.RAI_HOMEBREW_TAP_TOKEN }}",
  "{{ .Env.RAI_SCOOP_BUCKET_TOKEN }}",
];

const requiredSecrets = ["RAI_RELEASE_GITHUB_TOKEN", "RAI_HOMEBREW_TAP_TOKEN", "RAI_SCOOP_BUCKET_TOKEN"];

const installAvailabilityNote = "first successful vX.Y.Z release makes Homebrew/Scoop install available";

const requiredChecklistSnippets = [
  ...requiredSecrets,
  installAvailabilityNote,
  "apply does not create tags or releases",
  "rollback for GitHub Release assets, Homebrew formulae, and Scoop manifests",
];

const requiredRepositoryWorkflowSnippets = [
  "main is the principal trunk/default branch target",
  "refs/tags/v* blocks deletion and non-fast-forward",
  "publish workflow must fail closed without release secrets",
  "manual vX.Y.Z tags are release authority",
  "rollback uses a new patch or prerelease tag",
  "semantic-release is not added in P8",
];

export function validateReleaseDryRunConfig(root: string): ReleaseDryRunReport {
  const failures: string[] = [];
  validateGoReleaser(root, failures);
  validateWorkflow(root, failures);
  validateDocs(root, failures);

  return {
    status: failures.length === 0 ? "pass" : "fail",
    supportedTargets,
    archiveLayout,
    channels,
    failures,
  };
}

function validateGoReleaser(root: string, failures: string[]): void {
  const configPath = join(root, ".goreleaser.yaml");
  if (!existsSync(configPath)) {
    failures.push(".goreleaser.yaml missing");
    return;
  }

  const config = readFileSync(configPath, "utf8");
  for (const snippet of requiredConfigSnippets) {
    if (!config.includes(snippet)) failures.push(`.goreleaser.yaml missing ${snippet}`);
  }
  if (/release:\s*\n\s*disable:\s*true/m.test(config)) failures.push(".goreleaser.yaml must enable GitHub release publishing");
  if (/semantic-release/i.test(config)) failures.push("release config must not reference semantic-release");
}

function validateWorkflow(root: string, failures: string[]): void {
  const workflowPath = join(root, ".github", "workflows", "release.yml");
  if (!existsSync(workflowPath)) {
    failures.push("release workflow missing");
    return;
  }

  const workflow = readFileSync(workflowPath, "utf8");
  if (!/push:\s*\n\s*tags:\s*\n\s*-\s*["']?v\*/m.test(workflow)) failures.push("release workflow must run on pushed v* tags");
  if (!workflow.includes("workflow_dispatch:")) failures.push("release workflow must keep workflow_dispatch preflight");
  if (!/v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\(-rc\\\.\[0-9\]\+\)\?/.test(workflow)) {
    failures.push("release workflow missing release tag regex gate");
  }
  if (!workflow.includes("git merge-base --is-ancestor HEAD origin/main")) failures.push("release workflow missing origin/main ancestry gate");
  if (!workflow.includes("pnpm release:check")) failures.push("release workflow missing pnpm release:check gate");
  if (!workflow.includes("pnpm test && pnpm test:launcher")) failures.push("release workflow missing pnpm test && pnpm test:launcher gate");
  if (!workflow.includes("pnpm typecheck")) failures.push("release workflow missing pnpm typecheck gate");
  if (!workflow.includes("pnpm build")) failures.push("release workflow missing pnpm build gate");
  if (!workflow.includes("pnpm release:prepare")) failures.push("release workflow missing pnpm release:prepare gate");
  if (!workflow.includes("args: release --clean")) failures.push("release workflow missing GoReleaser publish step");
  if (!workflow.includes("args: release --snapshot --clean --skip=publish")) failures.push("release workflow missing snapshot preflight skip publish step");
  if (!/^\s*GITHUB_TOKEN:\s*\$\{\{ secrets\.RAI_RELEASE_GITHUB_TOKEN \}\}/m.test(workflow)) {
    failures.push("release workflow must map GITHUB_TOKEN to RAI_RELEASE_GITHUB_TOKEN");
  }
  for (const secret of requiredSecrets) {
    if (!workflow.includes(`secrets.${secret}`)) failures.push(`release workflow missing required secret ${secret}`);
  }
  if (/git\s+tag\b/.test(workflow)) failures.push("release workflow must not create tags");
  if (/push\s+--force/.test(workflow)) failures.push("release workflow must not force-push tags");
  if (/push\s+--delete/.test(workflow)) failures.push("release workflow must not delete tags");
  if (/semantic-release/i.test(workflow)) failures.push("release workflow must not run semantic-release");
}

function validateDocs(root: string, failures: string[]): void {
  requireSnippets(join(root, "docs", "release-maintainer-checklist.md"), "release maintainer checklist", requiredChecklistSnippets, failures);
  requireSnippets(join(root, "docs", "repository-workflow.md"), "repository workflow policy", requiredRepositoryWorkflowSnippets, failures);
  requireSnippets(join(root, "docs", "STATUS.md"), "status doc", [installAvailabilityNote], failures);
  requireSnippets(join(root, "docs", "ROADMAP.md"), "roadmap doc", [installAvailabilityNote], failures);
}

function requireSnippets(path: string, label: string, snippets: string[], failures: string[]): void {
  if (!existsSync(path)) {
    failures.push(`${label} missing`);
    return;
  }
  const content = readFileSync(path, "utf8");
  const normalized = content.toLowerCase();
  for (const snippet of snippets) {
    if (!normalized.includes(snippet.toLowerCase())) failures.push(`${label} missing ${snippet}`);
  }
}
