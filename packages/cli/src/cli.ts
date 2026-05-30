import { createSession, serveStdio, readSources, resolveConfig, runBackfill } from "@rai/core";
import { isAbsolute, join } from "node:path";

export type Command = "analyze" | "mcp" | "backfill" | "help";
export interface ParsedArgs {
  cmd: Command;
  dir: string;
  from?: string | undefined;
  to?: string | undefined;
  dbPath?: string | undefined;
}

/** Parse argv (already sliced past node + script). Pure. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, dir] = argv;
  if (cmd === "analyze") return { cmd: "analyze", dir: dir ?? "." };
  if (cmd === "mcp") return { cmd: "mcp", dir: dir ?? "." };
  if (cmd === "backfill") {
    const backfillDir = dir && !dir.startsWith("--") ? dir : ".";
    return {
      cmd: "backfill",
      dir: backfillDir,
      from: flag(argv, "--from") ?? "HEAD~1",
      to: flag(argv, "--to") ?? "HEAD",
      dbPath: flag(argv, "--db") ?? ".git/rai.sqlite",
    };
  }
  return { cmd: "help", dir: dir ?? "." };
}

/** Walk a repo, run one analysis pass, return the §5.2 counts envelope. */
export function runAnalyze(dir: string) {
  const config = resolveConfig({});
  const session = createSession({ config });
  const files = readSources(dir);
  return session.analyzeRepo({ files, asOf: 0 });
}

export function runBackfillCommand(input: { dir: string; from: string; to: string; dbPath: string }) {
  const config = resolveConfig({});
  let session: ReturnType<typeof createSession> | null = null;
  const getSession = () => {
    session ??= createSession({ config, dbPath: resolveDbPath(input.dir, input.dbPath) });
    return session;
  };
  return runBackfill({
    rootDir: input.dir,
    from: input.from,
    to: input.to,
    hasSnapshot: (commitSha) => getSession().hasSnapshot(commitSha),
    analyzeCommit: (commitSha) => {
      try {
        const r = getSession().analyzeRepo({
          files: readSources(input.dir),
          asOf: 0,
          commitSha,
          runId: `backfill-${commitSha}`,
        });
        return { ok: true, findings: r.topFingerprints.length };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}

const USAGE = `rai — React Architecture Intelligence

Usage:
  rai analyze [dir]   Analyze a repo; prints finding counts (default dir: .)
  rai backfill [dir] --from <sha> --to <sha> --db <path>
  rai mcp [dir]       Serve the MCP stdio server over the repo (default dir: .)
`;

/** Run the CLI. Returns the process exit code; serves indefinitely for mcp. */
export async function run(argv: string[]): Promise<number> {
  const { cmd, dir, from, to, dbPath } = parseArgs(argv);
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
    case "backfill": {
      const r = runBackfillCommand({ dir, from: from ?? "HEAD~1", to: to ?? "HEAD", dbPath: dbPath ?? ".git/rai.sqlite" });
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return r.status === "ok" ? 0 : 1;
    }
    default:
      process.stderr.write(USAGE);
      return 1;
  }
}

function flag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function resolveDbPath(dir: string, dbPath: string): string {
  return isAbsolute(dbPath) ? dbPath : join(dir, dbPath);
}
