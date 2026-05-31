import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative } from "node:path";

const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+["']next(?:\/|["'])/, label: "forbidden framework import pattern" },
  { pattern: /import\(["']next(?:\/|["'])/, label: "forbidden framework import pattern" },
  { pattern: /next\.config/, label: "forbidden framework convention" },
  { pattern: /app-router/, label: "forbidden framework variant" },
  { pattern: /pages-router/, label: "forbidden framework variant" },
];

const FRAMEWORK_ID_DECLARATION = /\b(?:type|interface)\s+FrameworkId\b/;

export function findCoreFrameworkFreeViolations(coreSrc, root) {
  const offenders = [];
  for (const file of walk(coreSrc)) {
    const text = readFileSync(file, "utf8");
    const relativeFile = relative(root, file);
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) offenders.push(`${relativeFile} matches ${label} ${pattern}`);
    }
    if (FRAMEWORK_ID_DECLARATION.test(text)) offenders.push(`${relativeFile} declares forbidden FrameworkId symbol`);
  }
  return offenders;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "dist" || entry === "node_modules") continue;
    const full = `${dir}/${entry}`;
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}
