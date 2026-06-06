/**
 * Tests for the `rai calibrate` command.
 * Covers: dispatch, --json shape, empty-feedback message (exit 0),
 * absent-db message (exit 0), and the CENTRAL GUARDRAIL (SUGGEST-ONLY, INV-1 + INV-2).
 */
import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "@rai/core";
import { parseArgs, run, runCalibrateCommand } from "./cli.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-cal-test-"));
  dirs.push(dir);
  return dir;
}

function seedFeedback(
  dbPath: string,
  ruleId: string,
  verdict: string,
  count: number,
): void {
  const db = openDb(dbPath);
  try {
    for (let i = 0; i < count; i++) {
      db.prepare(
        `INSERT INTO feedback_event (id, fingerprint, rule_id, verdict, source, origin_run_id,
          weight_hint, reason, commit_sha, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(`${ruleId}-${verdict}-${i}`, `FP${i}`, ruleId, verdict, "human", null, null, null, null, Date.now());
    }
  } finally {
    db.close();
  }
}

// ── parseArgs ────────────────────────────────────────────────────────────────

test("parseArgs routes calibrate with a directory", () => {
  expect(parseArgs(["calibrate", "/repo"])).toMatchObject({ cmd: "calibrate", dir: "/repo" });
});

test("parseArgs calibrate defaults dir to '.'", () => {
  expect(parseArgs(["calibrate"])).toMatchObject({ cmd: "calibrate", dir: "." });
});

test("parseArgs calibrate handles --json flag", () => {
  expect(parseArgs(["calibrate", ".", "--json"])).toMatchObject({ cmd: "calibrate", json: true });
});

test("parseArgs calibrate handles --db flag", () => {
  expect(parseArgs(["calibrate", ".", "--db", "custom.db"])).toMatchObject({
    cmd: "calibrate",
    dbPath: "custom.db",
  });
});

// ── absent db → graceful exit 0 ──────────────────────────────────────────────

test("runCalibrateCommand returns code 0 and message when no db exists", async () => {
  const dir = makeTmp();
  const { code, message } = await runCalibrateCommand({ dir, dbPath: ".git/rai.sqlite" });
  expect(code).toBe(0);
  expect(message).toMatch(/no feedback database/i);
});

test("run calibrate exits 0 with human output when no db exists", async () => {
  const dir = makeTmp();
  const originalCwd = process.cwd();
  let stdout = "";
  const originalWrite = process.stdout.write;
  process.chdir(dir);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await run(["calibrate", dir]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/no feedback database/i);
  } finally {
    process.chdir(originalCwd);
    process.stdout.write = originalWrite;
  }
});

// ── empty feedback (db present, no rows) → exit 0 ────────────────────────────

test("runCalibrateCommand returns code 0 with empty rules when db has no feedback rows", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  // Create empty db by opening and closing
  const db = openDb(dbPath);
  db.close();
  const { code, result } = await runCalibrateCommand({ dir, dbPath });
  expect(code).toBe(0);
  expect(result.rules).toHaveLength(0);
  expect(result.suggestions).toHaveLength(0);
});

// ── seeded feedback → --json shape ───────────────────────────────────────────

test("runCalibrateCommand --json shape has rules, suggestions, currentConfig, configFile", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  // Seed 5 reject events for react/shared-extraction (negativeRate=1 > 0.5, total=5 >= 3)
  seedFeedback(dbPath, "react/shared-extraction", "reject", 5);
  const { code, result } = await runCalibrateCommand({ dir, dbPath });
  expect(code).toBe(0);
  expect(result).toMatchObject({
    rules: expect.arrayContaining([
      expect.objectContaining({ ruleId: "react/shared-extraction" }),
    ]),
    suggestions: expect.arrayContaining([
      expect.objectContaining({ ruleId: "react/shared-extraction" }),
    ]),
    currentConfig: expect.objectContaining({ shared: expect.any(Object) }),
    configFile: null,
  });
});

test("--json configFile reflects existing rai.config.json", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  writeFileSync(join(dir, "rai.config.json"), JSON.stringify({}));
  const db = openDb(dbPath);
  db.close();
  const { result } = await runCalibrateCommand({ dir, dbPath });
  expect(result.configFile).toBe(join(dir, "rai.config.json"));
});

test("suggestion patch in --json is schema-valid", async () => {
  const { ConfigSchema } = await import("@rai/core");
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  const { result } = await runCalibrateCommand({ dir, dbPath });
  for (const sug of result.suggestions) {
    const parsed = ConfigSchema.partial().safeParse(sug.patch);
    expect(parsed.success).toBe(true);
  }
});

// ── human output format ───────────────────────────────────────────────────────

test("human output includes stats table and suggestion block", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/shared-extraction", "reject", 5);
  const originalCwd = process.cwd();
  let stdout = "";
  const originalWrite = process.stdout.write;
  process.chdir(dir);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await run(["calibrate", dir, "--db", dbPath]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/react\/shared-extraction/);
    expect(stdout).toMatch(/suggest-only/i);
  } finally {
    process.chdir(originalCwd);
    process.stdout.write = originalWrite;
  }
});

// ── CENTRAL GUARDRAIL: SUGGEST-ONLY (INV-1 + INV-2) ─────────────────────────

test("GUARDRAIL: calibrate does NOT create rai.config.json in temp dir", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/shared-extraction", "reject", 5);
  await runCalibrateCommand({ dir, dbPath });
  expect(existsSync(join(dir, "rai.config.json"))).toBe(false);
});

test("GUARDRAIL: calibrate does NOT modify pre-existing rai.config.json (mtime + bytes unchanged)", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  const configPath = join(dir, "rai.config.json");
  const original = JSON.stringify({ shared: { minInstances: 3 } });
  writeFileSync(configPath, original);
  const beforeStat = statSync(configPath);
  const beforeBytes = readFileSync(configPath, "utf8");

  seedFeedback(dbPath, "react/shared-extraction", "reject", 5);
  await runCalibrateCommand({ dir, dbPath });

  const afterStat = statSync(configPath);
  const afterBytes = readFileSync(configPath, "utf8");

  expect(afterBytes).toBe(beforeBytes);
  expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
});

test("GUARDRAIL: feedback_event row count is unchanged after calibrate", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/shared-extraction", "reject", 5);

  const dbBefore = openDb(dbPath);
  const countBefore = (dbBefore.prepare("SELECT COUNT(*) as cnt FROM feedback_event").get() as { cnt: number }).cnt;
  dbBefore.close();

  await runCalibrateCommand({ dir, dbPath });

  const dbAfter = openDb(dbPath);
  const countAfter = (dbAfter.prepare("SELECT COUNT(*) as cnt FROM feedback_event").get() as { cnt: number }).cnt;
  dbAfter.close();

  expect(countAfter).toBe(countBefore);
});
