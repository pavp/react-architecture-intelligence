import { buildMcpServer, createSession, serveStdio, readSources, resolveConfig, runBackfill, type AnalysisDiagnostic } from "@rai/core";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { loadInstalledAdapters } from "./adapters.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { buildInstallPlan } from "./install/plan.js";
import { applyInstallPlan } from "./install/writers.js";

export type Command = "analyze" | "mcp" | "backfill" | "install" | "doctor" | "help";
export interface ParsedArgs {
  cmd: Command;
  dir: string;
  from?: string | undefined;
  to?: string | undefined;
  dbPath?: string | undefined;
  platforms?: string[] | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  includeInstructions?: boolean | undefined;
  json?: boolean | undefined;
}

/** Parse argv (already sliced past node + script). Pure. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, dir] = argv;
  if (cmd === "analyze") return { cmd: "analyze", dir: dir ?? "." };
  if (cmd === "mcp") return { cmd: "mcp", dir: dir ?? "." };
  if (cmd === "install") {
    const installDir = dir && !dir.startsWith("--") ? dir : ".";
    return {
      cmd: "install",
      dir: installDir,
      platforms: flags(argv, "--platform"),
      dryRun: argv.includes("--dry-run"),
      yes: argv.includes("--yes"),
      includeInstructions: !argv.includes("--no-instructions"),
    };
  }
  if (cmd === "doctor") {
    const doctorDir = dir && !dir.startsWith("--") ? dir : ".";
    return { cmd: "doctor", dir: doctorDir, json: argv.includes("--json") };
  }
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
export async function runAnalyze(dir: string) {
  const config = resolveConfig({});
  const adapters = await loadInstalledAdapters({ rootDir: dir });
  const session = createSession({ config, registryFactory: adapters.registryFactory });
  const files = readSources(dir);
  return withCompositionDiagnostics(session.analyzeRepo({ files, asOf: 0 }), adapters.diagnostics);
}

export async function runBackfillCommand(input: { dir: string; from: string; to: string; dbPath: string }) {
  const config = resolveConfig({});
  const adapters = await loadInstalledAdapters({ rootDir: input.dir });
  let session: ReturnType<typeof createSession> | null = null;
  const getSession = () => {
    session ??= createSession({ config, dbPath: resolveDbPath(input.dir, input.dbPath), registryFactory: adapters.registryFactory });
    return session;
  };
  return runBackfill({
    rootDir: input.dir,
    from: input.from,
    to: input.to,
    hasSnapshot: (commitSha) => getSession().hasSnapshot(commitSha),
    analyzeCommit: (commitSha) => {
      try {
        const r = withCompositionDiagnostics(getSession().analyzeRepo({
          files: readSources(input.dir),
          asOf: 0,
          commitSha,
          runId: `backfill-${commitSha}`,
        }), adapters.diagnostics);
        return { ok: true, findings: r.topFingerprints.length };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}

export async function runInstallCommand(input: { dir: string; platforms?: string[]; dryRun?: boolean; yes?: boolean; includeInstructions?: boolean }) {
  const projectRoot = isAbsolute(input.dir) ? input.dir : join(process.cwd(), input.dir);
  const homeDir = homedir();
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homeDir, ".config");
  const plan = buildInstallPlan({
    projectRoot,
    homeDir,
    configDir,
    dryRun: input.dryRun ?? false,
    includeInstructions: input.includeInstructions ?? true,
    ...(input.platforms ? { platformOverrides: input.platforms } : {}),
  });

  if (plan.status !== "ok") return { code: 1, payload: plan };
  if (input.dryRun) return { code: 0, payload: plan };
  if (!input.yes) return { code: 1, payload: { status: "confirmation-required", plan } };

  const result = await applyInstallPlan(plan);
  return { code: result.status === "ok" ? 0 : 1, payload: result };
}

export async function buildCliMcpServer(dir: string) {
  const config = resolveConfig({});
  const adapters = await loadInstalledAdapters({ rootDir: dir });
  return buildMcpServer({ config, rootDir: dir, registryFactory: ({ files }) => adapters.registryFactory({ files: files.length > 0 ? files : readSources(dir) }) });
}

const USAGE = `rai — React Architecture Intelligence

Usage:
  rai analyze [dir]   Analyze a repo; prints finding counts (default dir: .)
  rai backfill [dir] --from <sha> --to <sha> --db <path>
  rai install [dir] [--platform <id[,id]>] [--dry-run] [--yes] [--no-instructions]
  rai doctor [dir] [--json]
  rai mcp [dir]       Serve the MCP stdio server over the repo (default dir: .)
`;

/** Run the CLI. Returns the process exit code; serves indefinitely for mcp. */
export async function run(argv: string[]): Promise<number> {
  const { cmd, dir, from, to, dbPath, platforms, dryRun, yes, includeInstructions, json } = parseArgs(argv);
  switch (cmd) {
    case "analyze": {
      const r = await runAnalyze(dir);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return 0;
    }
    case "mcp": {
      const adapters = await loadInstalledAdapters({ rootDir: dir });
      await serveStdio({ config: resolveConfig({}), rootDir: dir, registryFactory: adapters.registryFactory });
      return 0; // serveStdio resolves only when the transport closes
    }
    case "backfill": {
      const r = await runBackfillCommand({ dir, from: from ?? "HEAD~1", to: to ?? "HEAD", dbPath: dbPath ?? ".git/rai.sqlite" });
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return r.status === "ok" ? 0 : 1;
    }
    case "install": {
      const r = await runInstallCommand({ dir, ...(platforms ? { platforms } : {}), ...(dryRun !== undefined ? { dryRun } : {}), ...(yes !== undefined ? { yes } : {}), ...(includeInstructions !== undefined ? { includeInstructions } : {}) });
      process.stdout.write(JSON.stringify(r.payload, null, 2) + "\n");
      return r.code;
    }
    case "doctor": {
      const projectRoot = isAbsolute(dir) ? dir : join(process.cwd(), dir);
      const report = await runDoctor({ projectRoot, homeDir: homedir(), configDir: process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config") });
      process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorReport(report));
      return report.status === "fail" ? 1 : 0;
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

function flags(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1];
    if (argv[i] === name && value) values.push(value);
  }
  return values;
}

function resolveDbPath(dir: string, dbPath: string): string {
  return isAbsolute(dbPath) ? dbPath : join(dir, dbPath);
}

function withCompositionDiagnostics<T extends { counts: { diagnostics: number }; diagnostics: AnalysisDiagnostic[] }>(result: T, diagnostics: AnalysisDiagnostic[]): T {
  if (diagnostics.length === 0) return result;
  const merged = [...result.diagnostics, ...diagnostics];
  return { ...result, diagnostics: merged, counts: { ...result.counts, diagnostics: merged.length } };
}
