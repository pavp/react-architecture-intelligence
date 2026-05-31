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
  expect(report.channels).toEqual(["github-release-disabled", "homebrew-dry-run", "scoop-dry-run", "install-script-dry-run"]);
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

function installScript(): string {
  return "#!/usr/bin/env bash\nset -euo pipefail\necho 'DRY_RUN_ONLY'\n";
}
