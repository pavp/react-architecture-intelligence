import { join } from "node:path";
import { findCoreFrameworkFreeViolations } from "./core-framework-free-guard.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CORE_SRC = join(ROOT, "packages/core/src");
const offenders = findCoreFrameworkFreeViolations(CORE_SRC, ROOT);

if (offenders.length > 0) {
  console.error(offenders.join("\n"));
  process.exit(1);
}
