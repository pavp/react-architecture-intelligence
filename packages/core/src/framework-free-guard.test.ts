import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { findCoreFrameworkFreeViolations } from "../../../scripts/core-framework-free-guard.mjs";

test("framework-free guard rejects framework imports and FrameworkId leaks", () => {
  const root = mkdtempSync(join(tmpdir(), "rai-core-guard-"));
  const coreSrc = join(root, "packages/core/src");
  const forbiddenPackage = ["ne", "xt"].join("");
  mkdirSync(coreSrc, { recursive: true });
  writeFileSync(join(coreSrc, "bad.ts"), `import x from '${forbiddenPackage}/navigation';\nexport type FrameworkId = string;\n`);

  expect(findCoreFrameworkFreeViolations(coreSrc, root)).toEqual([
    expect.stringContaining("packages/core/src/bad.ts matches forbidden framework import pattern"),
    "packages/core/src/bad.ts declares forbidden FrameworkId symbol",
  ]);
});

test("framework-free guard permits generic analyzer framework strings", () => {
  const root = mkdtempSync(join(tmpdir(), "rai-core-guard-"));
  const coreSrc = join(root, "packages/core/src");
  mkdirSync(coreSrc, { recursive: true });
  writeFileSync(join(coreSrc, "analyzer.ts"), "export interface Analyzer { framework: string; }\n");

  expect(findCoreFrameworkFreeViolations(coreSrc, root)).toEqual([]);
});
