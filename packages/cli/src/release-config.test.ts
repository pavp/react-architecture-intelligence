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
  expect(report.failures).toEqual([]);
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

function installScript(): string {
  return "#!/usr/bin/env bash\nset -euo pipefail\necho 'dry-run only'\n";
}
