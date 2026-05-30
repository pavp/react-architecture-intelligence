#!/usr/bin/env node
// RAI CLI entry point
import { run } from "./cli.js";

run(process.argv.slice(2))
  .then((code) => {
    if (code !== 0) process.exit(code);
  })
  .catch((err: unknown) => {
    process.stderr.write(String(err instanceof Error ? err.stack ?? err.message : err) + "\n");
    process.exit(1);
  });
