import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("README quick path covers install, first commands, finding limits, and glossary terms", () => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  const quickPath = section(readme, "## Quick path");
  const limitations = section(readme, "## Current limitations");
  const glossary = section(readme, "## Glossary");

  expectInOrder(quickPath, [
    "brew install pavp/tap/rai",
    "rai doctor .",
    "rai analyze .",
    "rai explain src/components/Button.tsx",
  ]);
  expect(readme).toContain("## How to read findings");
  expect(readme).toContain("rai explain src/components/Button.tsx --json");
  expect(limitations).toContain("does not infer owner intent, root cause, or safe remediation");
  expect(limitations).toContain("human text is presentation-only");
  for (const term of ["cosine", "propOverlap", "hookOverlap", "groundingFields", "span", "diagnostic"]) {
    expect(glossary).toContain(`\`${term}\``);
  }
});

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  expect(start, `${heading} heading`).toBeGreaterThanOrEqual(0);
  const next = markdown.indexOf("\n## ", start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

function expectInOrder(text: string, expected: string[]): void {
  let cursor = 0;
  for (const item of expected) {
    const foundAt = text.indexOf(item, cursor);
    expect(foundAt, `${item} order`).toBeGreaterThanOrEqual(cursor);
    cursor = foundAt + item.length;
  }
}
