import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { validateReleaseDryRunConfig } from "./release-config.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("release config defines dry-run archive and channel shape without publish", () => {
  const report = validateReleaseDryRunConfig(resolve("."));

  expect(report.failures).toEqual([]);
  expect(report.status).toBe("pass");
  expect(report.supportedTargets).toEqual([
    "darwin/amd64",
    "darwin/arm64",
    "linux/amd64",
    "linux/arm64",
    "windows/amd64",
    "windows/arm64",
  ]);
  expect(report.archiveLayout).toEqual([
    "rai(.exe)",
    "lib/rai/metadata.json",
    "lib/rai/engine/packages/cli/dist/index.js",
    "lib/rai/runtime/",
    "lib/rai/native/<os>-<arch>/",
  ]);
  expect(report.channels).toEqual([
    "github-release-disabled",
    "homebrew:pavp/homebrew-tap",
    "scoop:pavp/scoop-bucket",
    "install-script-dry-run",
  ]);
});

test("release validation requires real channel repositories while keeping GitHub releases disabled", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), completeChecklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), completeRepositoryWorkflowDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain(".goreleaser.yaml missing Homebrew channel pavp/homebrew-tap");
  expect(report.failures).toContain(".goreleaser.yaml missing Scoop channel pavp/scoop-bucket");
  expect(report.failures).not.toContain(".goreleaser.yaml missing release:\n  disable: true");
});

test("release validation requires documented publish gates and exact secret names", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), realChannelConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), checklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), repositoryWorkflowDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release maintainer checklist missing RAI_RELEASE_GITHUB_TOKEN");
  expect(report.failures).toContain("release maintainer checklist missing RAI_HOMEBREW_TAP_TOKEN");
  expect(report.failures).toContain("release maintainer checklist missing RAI_SCOOP_BUCKET_TOKEN");
  expect(report.failures).toContain("release maintainer checklist missing Homebrew tap has default branch `main`");
  expect(report.failures).toContain("release maintainer checklist missing Scoop bucket has default branch `main`");
  expect(report.failures).toContain("release maintainer checklist missing support matrix darwin/linux/windows amd64/arm64");
  expect(report.failures).toContain("repository workflow policy missing refs/tags/v* blocks deletion and non-fast-forward");
  expect(report.failures).toContain("repository workflow policy missing publish workflow must fail closed without release secrets");
});

test("release validation allows only manually gated fail-closed release workflow", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), realChannelConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), completeChecklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), completeRepositoryWorkflowDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());
  writeFileSync(join(root, ".github", "workflows", "release.yml"), unsafeReleaseWorkflow());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release workflow must use workflow_dispatch only");
  expect(report.failures).toContain("release workflow missing RELEASE_PUBLISH_CONFIRM gate");
  expect(report.failures).toContain("release workflow missing required secret RAI_RELEASE_GITHUB_TOKEN");
  expect(report.failures).toContain("release workflow missing required secret RAI_HOMEBREW_TAP_TOKEN");
  expect(report.failures).toContain("release workflow missing required secret RAI_SCOOP_BUCKET_TOKEN");
});

test("release validation rejects real publish workflow shape", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), checklistDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());
  writeFileSync(join(root, ".github", "workflows", "release.yml"), "steps:\n  - run: goreleaser release --clean\n");

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release workflow must not run real goreleaser publish");
});

test("release validation requires maintainer setup docs", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), "Dry-run only\nGitHub token\n");
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release maintainer checklist missing Homebrew tap");
  expect(report.failures).toContain("release maintainer checklist missing Scoop bucket");
  expect(report.failures).toContain("release maintainer checklist missing Release tag");
});

test("release validation requires repository workflow policy doc", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), checklistDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("repository workflow policy missing");
});

test("release validation requires main trunk and tag policy snippets", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), checklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), "main\nRelease tags\n");
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("repository workflow policy missing main is the principal trunk/default branch target");
  expect(report.failures).toContain("repository workflow policy missing feat/rai-mvp-p0-p3 is legacy integration to retire after P8");
  expect(report.failures).toContain("repository workflow policy missing vX.Y.Z");
  expect(report.failures).toContain("repository workflow policy missing vX.Y.Z-rc.N");
  expect(report.failures).toContain("repository workflow policy missing published tags must not move");
  expect(report.failures).toContain("repository workflow policy missing rollback uses a new patch or prerelease tag");
});

test("release validation requires checklist branch tag and publish gates", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), checklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), repositoryWorkflowDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release maintainer checklist missing P8-S3a repository workflow policy gates");
  expect(report.failures).toContain("release maintainer checklist missing P8-S3b real publish activation gates");
  expect(report.failures).toContain("release maintainer checklist missing main branch protection");
  expect(report.failures).toContain("release maintainer checklist missing tag protection");
});

test("release validation requires naming policy and automation deferral snippets", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), dryRunConfig());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), checklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), repositoryWorkflowDoc());
  writeFileSync(join(root, "scripts", "install-rai.sh"), installScript());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain(
    "repository workflow policy missing branch examples: feat/p8-release-policy, fix/release-check, docs/repository-workflow, chore/release-config, test/release-validator",
  );
  expect(report.failures).toContain("repository workflow policy missing Conventional Commit commit messages");
  expect(report.failures).toContain("repository workflow policy missing Conventional Commit PR titles");
  expect(report.failures).toContain("repository workflow policy missing repository PR template");
  expect(report.failures).toContain("repository workflow policy missing Allowed/recommended scopes");
  expect(report.failures).toContain("repository workflow policy missing GoReleaser remains release artifact publisher");
  expect(report.failures).toContain("repository workflow policy missing manual vX.Y.Z tags are release authority");
  expect(report.failures).toContain("repository workflow policy missing semantic-release is not added in P8");
  expect(report.failures).toContain(
    "repository workflow policy missing P8-S3c adds commitlint and PR-title workflow enforcement",
  );
  expect(report.failures).toContain("repository workflow policy missing CI enforcement is preferred over local hooks");
  expect(report.failures).toContain("repository workflow policy missing no mandatory Husky or Lefthook setup is added");
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "rai-release-config-"));
  dirs.push(root);
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  return root;
}

function dryRunConfig(): string {
  return `version: 2
project_name: rai
snapshot:
  version_template: "{{ .Tag }}-snapshot"
release:
  disable: true
builds:
  - id: rai
    main: ./cmd/rai
    binary: rai
    goos: [darwin, linux, windows]
    goarch: [amd64, arm64]
archives:
  - id: portable
    builds: [rai]
    name_template: "rai_{{ .Os }}_{{ .Arch }}"
    files:
      - src: dist/rai/lib/rai/metadata.json
        dst: lib/rai/metadata.json
      - src: dist/rai/lib/rai/engine/packages/cli/dist/index.js
        dst: lib/rai/engine/packages/cli/dist/index.js
      - src: dist/rai/lib/rai/runtime/README.md
        dst: lib/rai/runtime/README.md
      - src: dist/rai/lib/rai/native/README.md
        dst: lib/rai/native/{{ .Os }}-{{ .Arch }}/README.md
checksum:
  name_template: "checksums.txt"
brews:
  - name: rai
    repository:
      owner: "DRY_RUN_ONLY"
      name: "homebrew-rai"
scoops:
  - name: rai
    repository:
      owner: "DRY_RUN_ONLY"
      name: "scoop-rai"
`;
}

function realChannelConfig(): string {
  return dryRunConfig()
    .replace('owner: "DRY_RUN_ONLY"\n      name: "homebrew-rai"', 'owner: "pavp"\n      name: "homebrew-tap"')
    .replace('owner: "DRY_RUN_ONLY"\n      name: "scoop-rai"', 'owner: "pavp"\n      name: "scoop-bucket"');
}

function checklistDoc(): string {
  return "Homebrew tap\nScoop bucket\nGitHub token\nRelease tag\nDry-run only\n";
}

function repositoryWorkflowDoc(): string {
  return `main is the principal trunk/default branch target
feat/rai-mvp-p0-p3 is legacy integration to retire after P8
approved issue
exactly one type:* label
passing CI
reviewable diff
Conventional Commit squash merge
vX.Y.Z
vX.Y.Z-rc.N
published tags must not move
rollback uses a new patch or prerelease tag
explicit maintainer/user confirmation
not executed in P8-S3a
real publish remains disabled
P8-S3b maintainer setup
`;
}

function completeChecklistDoc(): string {
  return `${checklistDoc()}
Homebrew tap has default branch \`main\`
Scoop bucket has default branch \`main\`
P8-S3a repository workflow policy gates
P8-S3b real publish activation gates
main branch protection
tag protection
RAI_RELEASE_GITHUB_TOKEN
RAI_HOMEBREW_TAP_TOKEN
RAI_SCOOP_BUCKET_TOKEN
support matrix darwin/linux/windows amd64/arm64
rollback for GitHub Release assets, Homebrew formulae, and Scoop manifests
`;
}

function completeRepositoryWorkflowDoc(): string {
  return `${repositoryWorkflowDoc()}
not executed in P8-S3c
branch examples: feat/p8-release-policy, fix/release-check, docs/repository-workflow, chore/release-config, test/release-validator
Conventional Commit commit messages
Conventional Commit PR titles
repository PR template
Allowed/recommended scopes
GoReleaser remains release artifact publisher
manual vX.Y.Z tags are release authority
semantic-release is not added in P8
P8-S3c adds commitlint and PR-title workflow enforcement
CI enforcement is preferred over local hooks
no mandatory Husky or Lefthook setup is added
refs/tags/v* blocks deletion and non-fast-forward
publish workflow must fail closed without release secrets
`;
}

function unsafeReleaseWorkflow(): string {
  return `name: Release
on:
  push:
    tags: ["v*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: goreleaser release --clean
`;
}

function installScript(): string {
  return "#!/usr/bin/env bash\nset -euo pipefail\necho 'DRY_RUN_ONLY'\n";
}
