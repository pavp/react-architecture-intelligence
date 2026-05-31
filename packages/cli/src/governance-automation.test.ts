import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(".");

describe("P8 governance automation", () => {
  test("commitlint config uses conventional defaults with flexible scopes", () => {
    const config = readFileSync(resolve(root, "commitlint.config.cjs"), "utf8");

    expect(config).toContain("@commitlint/config-conventional");
    expect(config).not.toMatch(/scope-enum/);
    expect(config).not.toMatch(/\bworkflow\b.*\brelease\b.*\blauncher\b/s);
  });

  test("PR-title workflow validates pull request titles without release mutation", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/pr-title.yml"), "utf8");

    expect(workflow).toContain("pull_request:");
    for (const type of ["opened", "edited", "synchronize", "reopened"]) {
      expect(workflow).toContain(type);
    }
    expect(workflow).toContain("github.event.pull_request.title");
    expect(workflow).toContain("mktemp");
    expect(workflow).toContain("pnpm commitlint --edit");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).not.toMatch(/goreleaser release|gh release|git tag|git push|default-branch|branches:/);
  });

  test("package scripts and dependencies support governance without release activation or hooks", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const allDependencies = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const scripts = pkg.scripts ?? {};

    expect(pkg.devDependencies?.["@commitlint/cli"]).toBeDefined();
    expect(pkg.devDependencies?.["@commitlint/config-conventional"]).toBeDefined();
    expect(scripts["lint:pr-title"]).toBe("commitlint");
    expect(allDependencies["semantic-release"]).toBeUndefined();
    expect(allDependencies.husky).toBeUndefined();
    expect(allDependencies.lefthook).toBeUndefined();
    expect(scripts.prepare).toBeUndefined();
    expect(scripts.precommit).toBeUndefined();
    expect(scripts.publish).toBeUndefined();
  });
});
