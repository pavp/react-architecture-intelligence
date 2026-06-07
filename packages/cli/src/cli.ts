import { buildMcpServer, createSession, serveStdio, readSources, resolveConfig, runBackfill, findingMatchesFile, aggregateFeedback, computeSuggestionsWithEvidence, lookupRejectedEvidence, CALIBRATABLE_RULES, openDb, mergeSuggestionsIntoConfig, ConfigSchema, type AnalysisDiagnostic, type PresentedFinding, type ExplanationEnvelope, type CalibrationSuggestion, type RuleFeedbackStats, type RaiConfigInput } from "@rai/core";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { loadInstalledAdapters } from "./adapters.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { buildInstallPlan } from "./install/plan.js";
import { applyInstallPlan, atomicWrite } from "./install/writers.js";
import { loadProjectConfig, ProjectConfigError } from "./project-config.js";

export type Command = "analyze" | "explain" | "mcp" | "backfill" | "install" | "doctor" | "calibrate" | "help";
export interface ParsedArgs {
  cmd: Command;
  dir: string;
  file?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  dbPath?: string | undefined;
  platforms?: string[] | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  apply?: boolean | undefined;
  includeInstructions?: boolean | undefined;
  json?: boolean | undefined;
}

/** Parse argv (already sliced past node + script). Pure. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, dir] = argv;
  if (cmd === "analyze") return { cmd: "analyze", dir: dir ?? "." };
  if (cmd === "explain") {
    const positional = argv.slice(1).filter((arg) => !arg.startsWith("--"));
    const [first, second] = positional;
    return { cmd: "explain", dir: second ? first ?? "." : ".", file: second ?? first, json: argv.includes("--json") };
  }
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
  if (cmd === "calibrate") {
    const calibrateDir = dir && !dir.startsWith("--") ? dir : ".";
    return {
      cmd: "calibrate",
      dir: calibrateDir,
      json: argv.includes("--json"),
      dbPath: flag(argv, "--db") ?? ".git/rai.sqlite",
      apply: argv.includes("--apply"),
      yes: argv.includes("--yes"),
    };
  }
  return { cmd: "help", dir: dir ?? "." };
}

/** Walk a repo, run one analysis pass, return the §5.2 counts envelope. */
export async function runAnalyze(dir: string) {
  const config = resolveConfig(loadProjectConfig(dir));
  const adapters = await loadInstalledAdapters({ rootDir: dir });
  const session = createSession({ config, registryFactory: adapters.registryFactory });
  const files = readSources(dir);
  return withCompositionDiagnostics(session.analyzeRepo({ files, asOf: 0 }), adapters.diagnostics);
}

export async function runBackfillCommand(input: { dir: string; from: string; to: string; dbPath: string }) {
  const config = resolveConfig(loadProjectConfig(input.dir));
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

export async function runExplainCommand(input: { dir: string; file: string }) {
  const config = resolveConfig(loadProjectConfig(input.dir));
  const adapters = await loadInstalledAdapters({ rootDir: input.dir });
  const session = createSession({ config, registryFactory: adapters.registryFactory });
  const files = readSources(input.dir);
  session.analyzeRepo({ files, asOf: 0 });
  const current = session.findSharedOpportunities({ includeSuppressed: false });
  const findings = [...current.opportunities, ...current.conflicts].filter((finding) => findingMatchesFile(finding, input.file));
  return {
    file: input.file,
    findings: findings.map((finding) => session.explainFinding({ fingerprint: finding.fingerprint.structural }) as ExplainedFinding),
  };
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
  const config = resolveConfig(loadProjectConfig(dir));
  const adapters = await loadInstalledAdapters({ rootDir: dir });
  return buildMcpServer({ config, rootDir: dir, registryFactory: ({ files }) => adapters.registryFactory({ files: files.length > 0 ? files : readSources(dir) }) });
}

export interface CalibrateResult {
  rules: RuleFeedbackStats[];
  suggestions: CalibrationSuggestion[];
  currentConfig: ReturnType<typeof resolveConfig>;
  configFile: string | null;
  merged?: RaiConfigInput;
  applied?: "preview" | "written" | "noop" | "idempotent";
}

export async function runCalibrateCommand(input: { dir: string; dbPath: string; apply?: boolean; yes?: boolean }): Promise<{ code: number; result: CalibrateResult; message?: string }> {
  const absDir = isAbsolute(input.dir) ? input.dir : join(process.cwd(), input.dir);
  const absDbPath = resolveDbPath(absDir, input.dbPath);
  const apply = input.apply ?? false;
  const yes = input.yes ?? false;

  // D5: check db presence BEFORE openDb (openDb CREATEs the file)
  if (!existsSync(absDbPath)) {
    const currentConfig = resolveConfig(loadProjectConfig(absDir));
    return {
      code: 0,
      result: { rules: [], suggestions: [], currentConfig, configFile: null },
      message: "No feedback database found. Run rai analyze first to populate feedback.",
    };
  }

  const db = openDb(absDbPath);
  try {
    const rules = aggregateFeedback(db);
    // D6: single load — capture rawInput (merge base) AND fail-fast on malformed
    const rawInput = loadProjectConfig(absDir);
    const currentConfig = resolveConfig(rawInput);

    // Build evidence map: for each calibratable rule past trigger, look up rejected finding metrics
    const evidenceByRule = new Map<string, number[]>();
    for (const rule of rules) {
      const isCalibratable = CALIBRATABLE_RULES.some((r) => r.ruleId === rule.ruleId);
      if (isCalibratable) {
        const values = lookupRejectedEvidence(db, rule.ruleId);
        if (values.length > 0) evidenceByRule.set(rule.ruleId, values);
      }
    }

    const suggestions = computeSuggestionsWithEvidence(rules, currentConfig, evidenceByRule);
    const configPath = join(absDir, "rai.config.json");
    const configFile = existsSync(configPath) ? configPath : null;

    // D3: suggest-only guard — apply defaults to false
    if (!apply) {
      return { code: 0, result: { rules, suggestions, currentConfig, configFile } };
    }

    // Apply sub-flow (ADR D3/D6 data flow)

    // Zero suggestions → noop
    if (suggestions.length === 0) {
      return { code: 0, result: { rules, suggestions, currentConfig, configFile, applied: "noop" } };
    }

    // Merge suggestions onto raw input (CRITICAL #1: rawInput is the merge base, NOT resolved config)
    const merged = mergeSuggestionsIntoConfig(rawInput, suggestions);

    // Validate merged via ConfigSchema.partial()
    const validation = ConfigSchema.partial().safeParse(merged);
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Merged config failed validation: ${issues}`);
    }

    const canonical = JSON.stringify(merged, null, 2);

    // Idempotence check (CRITICAL #3: canonical-serialized equality)
    if (existsSync(configPath)) {
      const onDiskRaw = readFileSync(configPath, "utf8");
      const onDiskCanonical = JSON.stringify(JSON.parse(onDiskRaw), null, 2);
      if (canonical === onDiskCanonical) {
        return { code: 0, result: { rules, suggestions, currentConfig, configFile, merged, applied: "idempotent" } };
      }
    }

    // Preview (dry-run: --apply without --yes)
    if (!yes) {
      return { code: 0, result: { rules, suggestions, currentConfig, configFile, merged, applied: "preview" } };
    }

    // Write atomically
    await atomicWrite(configPath, canonical + "\n");
    return { code: 0, result: { rules, suggestions, currentConfig, configFile: configPath, merged, applied: "written" } };
  } finally {
    db.close();
  }
}

export function formatCalibrateReport(result: CalibrateResult, message?: string): string {
  // D5: single conditional on result.applied swaps banner and suppresses suggest-only NOTE
  const isApplyMode = result.applied !== undefined;
  const lines: string[] = [
    isApplyMode
      ? "RAI calibrate — apply mode"
      : "RAI calibrate — suggest-only (read-only over feedback history)",
    "",
  ];

  if (message) {
    lines.push(message);
    return `${lines.join("\n")}\n`;
  }

  if (result.rules.length === 0) {
    lines.push("No feedback recorded yet. Run analysis and record some feedback first.");
    return `${lines.join("\n")}\n`;
  }

  // Stats table
  lines.push("Per-rule feedback summary:");
  lines.push(
    `${"Rule".padEnd(50)} ${"Total".padStart(6)} ${"Neg%".padStart(6)} ${"Suggest".padStart(8)}`,
  );
  lines.push("-".repeat(74));
  for (const stat of result.rules) {
    const hasSuggestion = result.suggestions.some((s) => s.ruleId === stat.ruleId);
    lines.push(
      `${stat.ruleId.padEnd(50)} ${String(stat.totalEvents).padStart(6)} ${(stat.negativeRate * 100).toFixed(0).padStart(5)}% ${hasSuggestion ? "YES".padStart(8) : "".padStart(8)}`,
    );
  }
  lines.push("");

  if (result.suggestions.length === 0) {
    lines.push("No calibration suggestions — feedback thresholds not met.");
    return `${lines.join("\n")}\n`;
  }

  if (isApplyMode) {
    // Apply mode output lines (D4)
    if (result.applied === "noop") {
      lines.push("Nothing to apply — no calibration suggestions.");
    } else if (result.applied === "idempotent") {
      lines.push("already calibrated — rai.config.json unchanged");
    } else if (result.applied === "preview") {
      lines.push("DRY-RUN — would write rai.config.json:");
      lines.push("");
      lines.push(JSON.stringify(result.merged, null, 2));
      lines.push("");
      lines.push("Re-run with --apply --yes to write.");
    } else if (result.applied === "written") {
      lines.push(`Wrote rai.config.json`);
      lines.push(`Config file: ${result.configFile ?? "(none)"}`);
    }
  } else {
    lines.push("Suggestions (copy-paste the JSON patch into rai.config.json):");
    lines.push("");
    for (const sug of result.suggestions) {
      lines.push(`  ${sug.ruleId}: ${sug.reason}`);
      lines.push(`  Patch: ${JSON.stringify(sug.patch)}`);
      lines.push("");
    }

    lines.push("NOTE: rai calibrate is suggest-only. Apply patches manually.");
    lines.push(`Config file: ${result.configFile ?? "(none — create rai.config.json at project root)"}`);
  }

  return `${lines.join("\n")}\n`;
}

const USAGE = `rai — React Architecture Intelligence

Usage:
  rai analyze [dir]   Analyze a repo; prints finding counts (default dir: .)
  rai explain <file> [--json]   Explain findings for one file (default dir: .)
  rai explain [dir] <file> [--json]
  rai backfill [dir] --from <sha> --to <sha> --db <path>
  rai calibrate [dir] [--json] [--db <path>]   Suggest config calibration from feedback history
  rai install [dir] [--platform <id[,id]>] [--dry-run] [--yes] [--no-instructions]
  rai doctor [dir] [--json]
  rai mcp [dir]       Serve the MCP stdio server over the repo (default dir: .)
`;

/** Run the CLI. Returns the process exit code; serves indefinitely for mcp. */
export async function run(argv: string[]): Promise<number> {
  try {
    return await runInner(argv);
  } catch (err) {
    if (err instanceof ProjectConfigError) {
      process.stderr.write(`rai: config error: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

async function runInner(argv: string[]): Promise<number> {
  const { cmd, dir, file, from, to, dbPath, platforms, dryRun, yes, apply, includeInstructions, json } = parseArgs(argv);
  switch (cmd) {
    case "analyze": {
      const r = await runAnalyze(dir);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return 0;
    }
    case "explain": {
      if (!file) {
        process.stderr.write(USAGE);
        return 1;
      }
      const r = await runExplainCommand({ dir, file });
      process.stdout.write(json ? `${JSON.stringify(r, null, 2)}\n` : renderExplainReport(r));
      return 0;
    }
    case "mcp": {
      const adapters = await loadInstalledAdapters({ rootDir: dir });
      await serveStdio({ config: resolveConfig(loadProjectConfig(dir)), rootDir: dir, registryFactory: adapters.registryFactory });
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
    case "calibrate": {
      const { code, result, message } = await runCalibrateCommand({ dir, dbPath: dbPath ?? ".git/rai.sqlite", apply: apply ?? false, yes: yes ?? false });
      if (json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(formatCalibrateReport(result, message));
      }
      return code;
    }
    default:
      process.stderr.write(USAGE);
      return 1;
  }
}

interface ExplainedFinding {
  finding: PresentedFinding;
  evidence: PresentedFinding["evidence"];
  groundingFields: string[];
  explanation: ExplanationEnvelope;
  memory: unknown;
}

function renderExplainReport(result: { file: string; findings: ExplainedFinding[] }): string {
  if (result.findings.length === 0) return `No relevant findings for ${result.file}.\n`;
  const lines = [`RAI explain: ${result.file}`, ""];
  result.findings.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.finding.ruleId} (${item.finding.severity}, ${item.finding.status})`);
    lines.push(`   ${item.explanation.summary}`);
    lines.push(`   Why it matters: ${item.explanation.whyItMatters}`);
    lines.push(`   Fingerprint: ${item.finding.fingerprint.structural}`);
    if (item.explanation.inspectFirst.length > 0) lines.push(`   What to inspect first: ${item.explanation.inspectFirst.join(", ")}`);
    lines.push(`   Evidence terms: ${item.explanation.groundingFields.join(", ")}`);
    lines.push(`   Limits: ${item.explanation.limits.join(" ")}`);
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
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
