import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CORE_SRC = join(ROOT, "packages/core/src");
const FORBIDDEN = [
  /from\s+["']next(?:\/|["'])/,
  /import\(["']next(?:\/|["'])/,
  /next\.config/,
  /app-router/,
  /pages-router/,
];

const offenders = [];

for (const file of walk(CORE_SRC)) {
  const text = readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) offenders.push(`${relative(ROOT, file)} matches ${pattern}`);
  }
}

if (offenders.length > 0) {
  console.error(offenders.join("\n"));
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "dist" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(entry)) out.push(full);
  }
  return out;
}
