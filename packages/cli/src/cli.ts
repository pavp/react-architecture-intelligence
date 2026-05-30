import { createSession, serveStdio, readSources, resolveConfig } from "@rai/core";

export type Command = "analyze" | "mcp" | "help";
export interface ParsedArgs {
  cmd: Command;
  dir: string;
}

/** Parse argv (already sliced past node + script). Pure. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, dir] = argv;
  if (cmd === "analyze") return { cmd: "analyze", dir: dir ?? "." };
  if (cmd === "mcp") return { cmd: "mcp", dir: dir ?? "." };
  return { cmd: "help", dir: dir ?? "." };
}

/** Walk a repo, run one analysis pass, return the §5.2 counts envelope. */
export function runAnalyze(dir: string) {
  const config = resolveConfig({});
  const session = createSession({ config });
  const files = readSources(dir);
  return session.analyzeRepo({ files, asOf: 0 });
}

const USAGE = `rai — React Architecture Intelligence

Usage:
  rai analyze [dir]   Analyze a repo; prints finding counts (default dir: .)
  rai mcp [dir]       Serve the MCP stdio server over the repo (default dir: .)
`;

/** Run the CLI. Returns the process exit code; serves indefinitely for mcp. */
export async function run(argv: string[]): Promise<number> {
  const { cmd, dir } = parseArgs(argv);
  switch (cmd) {
    case "analyze": {
      const r = runAnalyze(dir);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return 0;
    }
    case "mcp": {
      await serveStdio({ config: resolveConfig({}), rootDir: dir });
      return 0; // serveStdio resolves only when the transport closes
    }
    default:
      process.stderr.write(USAGE);
      return 1;
  }
}
