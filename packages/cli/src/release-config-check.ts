import { validateReleaseDryRunConfig } from "./release-config.js";

const report = validateReleaseDryRunConfig(process.cwd());
console.log(JSON.stringify(report, null, 2));

if (report.status !== "pass") {
  process.exitCode = 1;
}
