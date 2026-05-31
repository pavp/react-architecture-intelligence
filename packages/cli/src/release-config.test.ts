import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { validateReleaseDryRunConfig } from "./release-config.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("release config enables gated publishing while retaining snapshot preflight", () => {
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
    "github-release-enabled",
    "homebrew:pavp/homebrew-tap",
    "scoop:pavp/scoop-bucket",
    "snapshot-preflight-retained",
  ]);
});

test("release validation requires enabled release config and exact channel token envs", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), disabledReleaseConfig());
  writeRequiredDocs(root);
  writeFileSync(join(root, ".github", "workflows", "release.yml"), safeWorkflow());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain(".goreleaser.yaml must enable GitHub release publishing");
  expect(report.failures).toContain(".goreleaser.yaml missing {{ .Env.RAI_HOMEBREW_TAP_TOKEN }}");
  expect(report.failures).toContain(".goreleaser.yaml missing {{ .Env.RAI_SCOOP_BUCKET_TOKEN }}");
});

test("release validation rejects unsafe workflow gates before publish", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), activeReleaseConfig());
  writeRequiredDocs(root);
  writeFileSync(join(root, ".github", "workflows", "release.yml"), unsafeWorkflow());

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release workflow must run on pushed v* tags");
  expect(report.failures).toContain("release workflow missing release tag regex gate");
  expect(report.failures).toContain("release workflow missing origin/main ancestry gate");
  expect(report.failures).toContain("release workflow missing pnpm release:check gate");
  expect(report.failures).toContain("release workflow missing pnpm test && pnpm test:launcher gate");
  expect(report.failures).toContain("release workflow missing pnpm typecheck gate");
  expect(report.failures).toContain("release workflow missing pnpm build gate");
  expect(report.failures).toContain("release workflow missing pnpm release:prepare gate");
  expect(report.failures).toContain("release workflow missing GoReleaser publish step");
  expect(report.failures).toContain("release workflow missing snapshot preflight skip publish step");
});

test("release validation rejects missing secrets and token mapping", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), activeReleaseConfig());
  writeRequiredDocs(root);
  writeFileSync(
    join(root, ".github", "workflows", "release.yml"),
    safeWorkflow()
      .replace(/RAI_SCOOP_BUCKET_TOKEN/g, "SCOOP_TOKEN")
      .replace(/^\s*GITHUB_TOKEN: .*$/m, ""),
  );

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release workflow missing required secret RAI_SCOOP_BUCKET_TOKEN");
  expect(report.failures).toContain("release workflow must map GITHUB_TOKEN to RAI_RELEASE_GITHUB_TOKEN");
});

test("release validation rejects auto-tagging, semantic-release, and tag mutation language", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), `${activeReleaseConfig()}\n# semantic-release\n`);
  writeRequiredDocs(root);
  writeFileSync(join(root, ".github", "workflows", "release.yml"), `${safeWorkflow()}\n# git tag v1.2.3 && git push --force && git push --delete\n`);

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release config must not reference semantic-release");
  expect(report.failures).toContain("release workflow must not create tags");
  expect(report.failures).toContain("release workflow must not force-push tags");
  expect(report.failures).toContain("release workflow must not delete tags");
});

test("release validation requires docs to state post-release install availability", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".goreleaser.yaml"), activeReleaseConfig());
  writeFileSync(join(root, ".github", "workflows", "release.yml"), safeWorkflow());
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), "RAI_RELEASE_GITHUB_TOKEN\nRAI_HOMEBREW_TAP_TOKEN\nRAI_SCOOP_BUCKET_TOKEN\n");
  writeFileSync(join(root, "docs", "repository-workflow.md"), requiredRepositoryWorkflowDoc());
  writeFileSync(join(root, "docs", "STATUS.md"), "Release activation pending\n");
  writeFileSync(join(root, "docs", "ROADMAP.md"), "Release activation pending\n");

  const report = validateReleaseDryRunConfig(root);

  expect(report.status).toBe("fail");
  expect(report.failures).toContain("release maintainer checklist missing first successful vX.Y.Z release makes Homebrew/Scoop install available");
  expect(report.failures).toContain("status doc missing first successful vX.Y.Z release makes Homebrew/Scoop install available");
  expect(report.failures).toContain("roadmap doc missing first successful vX.Y.Z release makes Homebrew/Scoop install available");
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "rai-release-config-"));
  dirs.push(root);
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  return root;
}

function writeRequiredDocs(root: string): void {
  writeFileSync(join(root, "docs", "release-maintainer-checklist.md"), requiredChecklistDoc());
  writeFileSync(join(root, "docs", "repository-workflow.md"), requiredRepositoryWorkflowDoc());
  writeFileSync(join(root, "docs", "STATUS.md"), requiredStatusDoc());
  writeFileSync(join(root, "docs", "ROADMAP.md"), requiredRoadmapDoc());
}

function disabledReleaseConfig(): string {
  return activeReleaseConfig()
    .replace("release:\n  mode: replace", "release:\n  disable: true")
    .replace("token: \"{{ .Env.RAI_HOMEBREW_TAP_TOKEN }}\"", "")
    .replace("token: \"{{ .Env.RAI_SCOOP_BUCKET_TOKEN }}\"", "");
}

function activeReleaseConfig(): string {
  return `version: 2
project_name: rai
snapshot:
  version_template: "{{ .Tag }}-snapshot"
release:
  mode: replace
before:
  hooks:
    - pnpm release:prepare
builds:
  - id: rai
    main: ./cmd/rai
    binary: rai
    goos: [darwin, linux, windows]
    goarch: [amd64, arm64]
archives:
  - id: portable
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
      owner: "pavp"
      name: "homebrew-tap"
      token: "{{ .Env.RAI_HOMEBREW_TAP_TOKEN }}"
scoops:
  - name: rai
    repository:
      owner: "pavp"
      name: "scoop-bucket"
      token: "{{ .Env.RAI_SCOOP_BUCKET_TOKEN }}"
`;
}

function safeWorkflow(): string {
  return `on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
env:
  RAI_RELEASE_GITHUB_TOKEN: \${{ secrets.RAI_RELEASE_GITHUB_TOKEN }}
  RAI_HOMEBREW_TAP_TOKEN: \${{ secrets.RAI_HOMEBREW_TAP_TOKEN }}
  RAI_SCOOP_BUCKET_TOKEN: \${{ secrets.RAI_SCOOP_BUCKET_TOKEN }}
  GITHUB_TOKEN: \${{ secrets.RAI_RELEASE_GITHUB_TOKEN }}
steps:
  - run: grep -Eq '^v[0-9]+\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$'
  - run: git merge-base --is-ancestor HEAD origin/main
  - run: pnpm release:check
  - run: pnpm test && pnpm test:launcher
  - run: pnpm typecheck
  - run: pnpm build
  - run: pnpm release:prepare
  - uses: goreleaser/goreleaser-action@v6
    with:
      args: release --snapshot --clean --skip=publish
  - uses: goreleaser/goreleaser-action@v6
    with:
      args: release --clean
`;
}

function unsafeWorkflow(): string {
  return `on:
  workflow_dispatch:
env:
  RAI_RELEASE_GITHUB_TOKEN: \${{ secrets.RAI_RELEASE_GITHUB_TOKEN }}
  RAI_HOMEBREW_TAP_TOKEN: \${{ secrets.RAI_HOMEBREW_TAP_TOKEN }}
  RAI_SCOOP_BUCKET_TOKEN: \${{ secrets.RAI_SCOOP_BUCKET_TOKEN }}
  GITHUB_TOKEN: \${{ secrets.RAI_RELEASE_GITHUB_TOKEN }}
steps:
  - run: goreleaser release --clean
`;
}

function requiredChecklistDoc(): string {
  return `RAI_RELEASE_GITHUB_TOKEN
RAI_HOMEBREW_TAP_TOKEN
RAI_SCOOP_BUCKET_TOKEN
first successful vX.Y.Z release makes Homebrew/Scoop install available
apply does not create tags or releases
rollback for GitHub Release assets, Homebrew formulae, and Scoop manifests
`;
}

function requiredRepositoryWorkflowDoc(): string {
  return `main is the principal trunk/default branch target
refs/tags/v* blocks deletion and non-fast-forward
publish workflow must fail closed without release secrets
manual vX.Y.Z tags are release authority
rollback uses a new patch or prerelease tag
semantic-release is not added in P8
`;
}

function requiredStatusDoc(): string {
  return "first successful vX.Y.Z release makes Homebrew/Scoop install available\n";
}

function requiredRoadmapDoc(): string {
  return "first successful vX.Y.Z release makes Homebrew/Scoop install available\n";
}
