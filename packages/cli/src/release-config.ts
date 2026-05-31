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

export function validateReleaseDryRunConfig(root: string): ReleaseDryRunReport {
  const failures: string[] = [];
  const configPath = join(root, ".goreleaser.yaml");
  const checklistPath = join(root, "docs", "release-maintainer-checklist.md");
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
