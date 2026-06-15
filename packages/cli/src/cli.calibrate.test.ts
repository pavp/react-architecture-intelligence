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

/**
 * Seed T3 finding rows. Mirrors FindingsStore.insert column list (all 11 NOT NULL cols).
 * evidence is a plain JS object that will be JSON-serialised.
 */
function seedFinding(
  dbPath: string,
  ruleId: string,
  fingerprint: string,
  evidence: Record<string, unknown>,
): void {
  const db = openDb(dbPath);
  try {
    db.prepare(
      `INSERT INTO finding (id, fingerprint, rule_id, type, analysis_version, fp_algo_version,
        producing_run_id, commit_sha, severity_raw, evidence_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      `finding-${ruleId}-${fingerprint}`,
      fingerprint,
      ruleId,
      "structural",
      1,
      1,
      "run-seed",
      "abc123",
      "warn",
      JSON.stringify(evidence),
      Date.now(),
    );
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

// ── P13-S3: parseArgs --apply / --yes flags ───────────────────────────────────

test("parseArgs calibrate: --apply --yes → apply:true, yes:true", () => {
  expect(parseArgs(["calibrate", ".", "--apply", "--yes"])).toMatchObject({
    cmd: "calibrate",
    apply: true,
    yes: true,
  });
});

test("parseArgs calibrate: --apply alone → apply:true, yes:false", () => {
  const result = parseArgs(["calibrate", ".", "--apply"]);
  expect(result).toMatchObject({ cmd: "calibrate", apply: true });
  expect(result.yes).toBeFalsy();
});

test("parseArgs calibrate: no --apply → apply:false", () => {
  const result = parseArgs(["calibrate", "."]);
  expect(result.apply).toBeFalsy();
  expect(result.yes).toBeFalsy();
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

// ── P13-S3: apply path tests (RED before GREEN) ──────────────────────────────

test("apply(D1a): --apply without --yes → no file written, exit 0, applied='preview'", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: false });
  expect(code).toBe(0);
  expect(result.applied).toBe("preview");
  expect(existsSync(join(dir, "rai.config.json"))).toBe(false);
});

test("apply(D1b): --apply --yes → file written, exit 0, applied='written', on-disk == merged", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code).toBe(0);
  expect(result.applied).toBe("written");
  const onDisk = JSON.parse(readFileSync(join(dir, "rai.config.json"), "utf8"));
  expect(onDisk).toEqual(result.merged);
});

test("apply(D1c): unrelated keys survive write", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  const configPath = join(dir, "rai.config.json");
  writeFileSync(configPath, JSON.stringify({
    excludeGlobs: ["**/*.test.*", "**/vendor/**"],
    boundaries: [{ from: "a", to: "b", reason: "test" }],
  }));
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code).toBe(0);
  expect(result.applied).toBe("written");
  const onDisk = JSON.parse(readFileSync(configPath, "utf8"));
  expect(onDisk.excludeGlobs).toEqual(["**/*.test.*", "**/vendor/**"]);
  expect(onDisk.boundaries).toEqual([{ from: "a", to: "b", reason: "test" }]);
  expect(onDisk.renderCoupling?.maxFanIn).toBe(12);
});

test("apply(D1d): empty config → writes ONLY suggested groups, no default tree (CRITICAL #1)", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code).toBe(0);
  expect(result.applied).toBe("written");

  const onDisk = JSON.parse(readFileSync(join(dir, "rai.config.json"), "utf8"));
  // MUST have only the suggested group
  expect(onDisk).toEqual({ renderCoupling: { maxFanIn: 12 } });
  // MUST NOT have default tree (no shared, hookTopology, etc.)
  expect(onDisk.shared).toBeUndefined();
  expect(onDisk.overAbstraction).toBeUndefined();
  expect(onDisk.hookTopology).toBeUndefined();
});

test("apply(D1e): zero suggestions → applied='noop', no write, exit 0", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  // Seed only 1 event (below MIN_EVENTS=3 → no suggestions)
  seedFeedback(dbPath, "react/render-coupling", "reject", 1);

  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code).toBe(0);
  expect(result.applied).toBe("noop");
  expect(existsSync(join(dir, "rai.config.json"))).toBe(false);
});

test("apply(D1f): idempotent — pre-seed canonical config → applied='idempotent', no rewrite, exit 0", async () => {
  // Use a non-calibratable rule so the suggestion (severity downgrade patch) is stable
  // and does not depend on current config value — ensuring true idempotence.
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  // "adapter/custom-rule" is not in CALIBRATABLE_RULES → always produces severity downgrade patch
  seedFeedback(dbPath, "adapter/custom-rule", "reject", 5);

  // First write: get the canonical merged output
  const { result: firstResult } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(firstResult.applied).toBe("written");
  const canonicalContent = readFileSync(join(dir, "rai.config.json"), "utf8");
  const statAfterFirst = statSync(join(dir, "rai.config.json"));

  // Second run with identical feedback → merged output is identical → idempotent
  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code).toBe(0);
  expect(result.applied).toBe("idempotent");

  // File content must not change
  const afterContent = readFileSync(join(dir, "rai.config.json"), "utf8");
  expect(afterContent).toBe(canonicalContent);
  // mtime must not change (no rewrite)
  const statAfterSecond = statSync(join(dir, "rai.config.json"));
  expect(statAfterSecond.mtimeMs).toBe(statAfterFirst.mtimeMs);
});

test("apply(D1g): malformed config → exit 2, file bytes byte-identical", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  const configPath = join(dir, "rai.config.json");
  const malformedContent = '{"shared": {"minInstances": "not-a-number"}}';
  writeFileSync(configPath, malformedContent);

  const code = await run(["calibrate", dir, "--db", dbPath, "--apply", "--yes"]);
  expect(code).toBe(2);
  const afterBytes = readFileSync(configPath, "utf8");
  expect(afterBytes).toBe(malformedContent);
});

// ── P13-S3: --json + apply ─────────────────────────────────────────────────────

test("--json --apply (dry-run): stdout valid JSON with merged+applied='preview', no write", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  let stdout = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  let code: number;
  try {
    code = await run(["calibrate", dir, "--db", dbPath, "--apply", "--json"]);
  } finally {
    process.stdout.write = originalWrite;
  }
  expect(code!).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.applied).toBe("preview");
  expect(parsed.merged).toBeDefined();
  expect(existsSync(join(dir, "rai.config.json"))).toBe(false);
});

test("--json --apply --yes: JSON has applied='written', on-disk matches merged", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  let stdout = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  let code: number;
  try {
    code = await run(["calibrate", dir, "--db", dbPath, "--apply", "--yes", "--json"]);
  } finally {
    process.stdout.write = originalWrite;
  }
  expect(code!).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.applied).toBe("written");
  expect(parsed.merged).toBeDefined();
  const onDisk = JSON.parse(readFileSync(join(dir, "rai.config.json"), "utf8"));
  expect(onDisk).toEqual(parsed.merged);
});

// ── P13-S3: apply banner in human output ──────────────────────────────────────

test("human banner becomes 'apply mode' and suggest-only NOTE suppressed when applied is set", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  seedFinding(dbPath, "react/render-coupling", "FP0", { kind: "render-coupling", fanIn: 12 });

  let stdout = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    await run(["calibrate", dir, "--db", dbPath, "--apply", "--yes"]);
  } finally {
    process.stdout.write = originalWrite;
  }
  expect(stdout).toMatch(/apply mode/i);
  expect(stdout).not.toMatch(/NOTE: rai calibrate is suggest-only/);
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

// ── C1: Evidence-correlated suggestion in CLI output ─────────────────────────
// seedFeedback seeds FP0..FP4 fingerprints; seedFinding seeds matching T3 rows
// so the T4→T3 join resolves and lookupRejectedEvidence returns observed metrics.

test("evidence-correlated: runCalibrateCommand --json result shows observed max not current+1", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  // Seed 5 reject events for render-coupling (FP0..FP4 fingerprints)
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  // Seed matching T3 finding rows with fanIn evidence values 6,7,9,12,8
  const fanIns = [6, 7, 9, 12, 8];
  for (let i = 0; i < 5; i++) {
    seedFinding(dbPath, "react/render-coupling", `FP${i}`, { kind: "render-coupling", fanIn: fanIns[i] });
  }

  const { code, result } = await runCalibrateCommand({ dir, dbPath });
  expect(code).toBe(0);

  const rcSug = result.suggestions.find((s) => s.ruleId === "react/render-coupling");
  expect(rcSug).toBeDefined();
  // Correlated: max(6,7,9,12,8)=12; NOT current+1 (default maxFanIn=5 → current+1 would be 6)
  expect(rcSug!.patch.renderCoupling?.maxFanIn).toBe(12);
});

test("evidence-correlated: human stdout also shows correlated suggestion", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  const fanIns = [6, 7, 9, 12, 8];
  for (let i = 0; i < 5; i++) {
    seedFinding(dbPath, "react/render-coupling", `FP${i}`, { kind: "render-coupling", fanIn: fanIns[i] });
  }

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
    // Human output should mention render-coupling with observed max (12), not just current+1
    expect(stdout).toMatch(/react\/render-coupling/);
    expect(stdout).toMatch(/12/);
  } finally {
    process.chdir(originalCwd);
    process.stdout.write = originalWrite;
  }
});

// ── IDEMPOTENCE: calibratable rule — apply --yes twice must converge ─────────
// This is the KEY missing test that was masked by D1f using a non-calibratable rule.
// Calibratable rules triggered the current+1 fallback on 2nd run: 12→13→14…
// After the fix (computeApplicableSuggestions), the 2nd run must report "already calibrated".

test("idempotent(calibratable): --apply --yes twice with render-coupling evidence → 2nd run reports idempotent, no rewrite", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  const configPath = join(dir, "rai.config.json");

  // Seed 5 reject feedback events for render-coupling (fingerprints FP0..FP4)
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  // Seed matching T3 finding rows with fanIn values producing max=12
  const fanIns = [6, 7, 9, 12, 8];
  for (let i = 0; i < 5; i++) {
    seedFinding(dbPath, "react/render-coupling", `FP${i}`, { kind: "render-coupling", fanIn: fanIns[i] });
  }

  // First run: should write {renderCoupling:{maxFanIn:12}}
  const { code: code1, result: result1 } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code1).toBe(0);
  expect(result1.applied).toBe("written");
  const onDisk1 = JSON.parse(readFileSync(configPath, "utf8"));
  expect(onDisk1).toEqual({ renderCoupling: { maxFanIn: 12 } });
  const stat1 = statSync(configPath);

  // Second run: config already has maxFanIn=12; evidence max=12 → no genuine headroom
  // → computeApplicableSuggestions emits NO suggestion → merged == current config → idempotent
  const { code: code2, result: result2 } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code2).toBe(0);
  expect(result2.applied).toBe("idempotent");

  // File content must not change (no 12→13 divergence)
  const onDisk2 = JSON.parse(readFileSync(configPath, "utf8"));
  expect(onDisk2).toEqual({ renderCoupling: { maxFanIn: 12 } });
  // mtime must not change
  const stat2 = statSync(configPath);
  expect(stat2.mtimeMs).toBe(stat1.mtimeMs);
});

// ── E1: GUARDRAIL extended for evidence path (T3+T4 → zero writes) ───────────

test("GUARDRAIL: evidence path — calibrate does NOT create rai.config.json when T3+T4 seeded", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  for (let i = 0; i < 5; i++) {
    seedFinding(dbPath, "react/render-coupling", `FP${i}`, { kind: "render-coupling", fanIn: i + 6 });
  }
  await runCalibrateCommand({ dir, dbPath });
  expect(existsSync(join(dir, "rai.config.json"))).toBe(false);
});

test("GUARDRAIL: evidence path — feedback_event row count UNCHANGED after calibrate with T3+T4", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  for (let i = 0; i < 5; i++) {
    seedFinding(dbPath, "react/render-coupling", `FP${i}`, { kind: "render-coupling", fanIn: i + 6 });
  }

  const dbBefore = openDb(dbPath);
  const fbBefore = (dbBefore.prepare("SELECT COUNT(*) as cnt FROM feedback_event").get() as { cnt: number }).cnt;
  dbBefore.close();

  await runCalibrateCommand({ dir, dbPath });

  const dbAfter = openDb(dbPath);
  const fbAfter = (dbAfter.prepare("SELECT COUNT(*) as cnt FROM feedback_event").get() as { cnt: number }).cnt;
  dbAfter.close();

  expect(fbAfter).toBe(fbBefore);
});

// ── P13-S2.x: Dual-suggestion (maxFanIn + maxFanOut) ──────────────────────────

test("dual-suggestion: suggest path returns both maxFanIn and maxFanOut suggestions for render-coupling", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");

  // Seed 5 reject events for react/render-coupling
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);

  // Seed T3 findings with BOTH fanIn evidence (for primary) AND fanOut evidence (for secondary).
  // fanIn values: [6,7,9,12,8] → max=12 > default maxFanIn(5) → primary suggestion maxFanIn=12
  // fanOut values: [8,9,10,11,12] → fanOut breach count (vs default maxFanOut=7): all 5 > 7
  // fanIn breach count (vs default maxFanIn=5): all 5 > 5
  // Tie: 5 vs 5 → fanOut NOT dominant → secondary suggestion suppressed
  // To make fanOut dominant: use fewer fanIn breaches
  // fanIn: [4,4,4,6,6] → 2 breach (6>5); fanOut: [8,9,10,4,4] → 3 breach (>7)
  // → fanOut dominant (3>2) → secondary suggestion emitted
  const findings = [
    { fingerprint: "FP0", evidence: { kind: "render-coupling", fanIn: 4, fanOut: 8, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP1", evidence: { kind: "render-coupling", fanIn: 4, fanOut: 9, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP2", evidence: { kind: "render-coupling", fanIn: 4, fanOut: 10, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP3", evidence: { kind: "render-coupling", fanIn: 6, fanOut: 4, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP4", evidence: { kind: "render-coupling", fanIn: 6, fanOut: 4, directChildren: 1, reachableDepth: 1 } },
  ];
  for (const f of findings) {
    seedFinding(dbPath, "react/render-coupling", f.fingerprint, f.evidence);
  }

  const { code, result } = await runCalibrateCommand({ dir, dbPath });
  expect(code).toBe(0);

  // Primary suggestion (maxFanIn) must be present
  const primarySug = result.suggestions.find(
    (s) => s.ruleId === "react/render-coupling" && s.patch.renderCoupling?.maxFanIn !== undefined,
  );
  expect(primarySug).toBeDefined();

  // Secondary suggestion (maxFanOut) must also be present
  const secondarySug = result.suggestions.find(
    (s) => s.ruleId === "react/render-coupling" && s.patch.renderCoupling?.maxFanOut !== undefined,
  );
  expect(secondarySug).toBeDefined();

  // They are distinct objects
  expect(primarySug).not.toBe(secondarySug);
});

test("dual-suggestion: --apply --yes writes both maxFanIn and maxFanOut into renderCoupling group", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");

  seedFeedback(dbPath, "react/render-coupling", "reject", 5);

  const findings = [
    { fingerprint: "FP0", evidence: { kind: "render-coupling", fanIn: 4, fanOut: 8, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP1", evidence: { kind: "render-coupling", fanIn: 4, fanOut: 9, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP2", evidence: { kind: "render-coupling", fanIn: 4, fanOut: 10, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP3", evidence: { kind: "render-coupling", fanIn: 6, fanOut: 4, directChildren: 1, reachableDepth: 1 } },
    { fingerprint: "FP4", evidence: { kind: "render-coupling", fanIn: 6, fanOut: 4, directChildren: 1, reachableDepth: 1 } },
  ];
  for (const f of findings) {
    seedFinding(dbPath, "react/render-coupling", f.fingerprint, f.evidence);
  }

  const { code, result } = await runCalibrateCommand({ dir, dbPath, apply: true, yes: true });
  expect(code).toBe(0);
  expect(result.applied).toBe("written");

  const onDisk = JSON.parse(readFileSync(join(dir, "rai.config.json"), "utf8"));
  // Both maxFanIn and maxFanOut must be in the written config
  expect(onDisk.renderCoupling?.maxFanIn).toBeDefined();
  expect(onDisk.renderCoupling?.maxFanOut).toBeDefined();
});

test("GUARDRAIL: evidence path — finding row count UNCHANGED after calibrate with T3+T4", async () => {
  const dir = makeTmp();
  const dbPath = join(dir, "rai.sqlite");
  seedFeedback(dbPath, "react/render-coupling", "reject", 5);
  for (let i = 0; i < 5; i++) {
    seedFinding(dbPath, "react/render-coupling", `FP${i}`, { kind: "render-coupling", fanIn: i + 6 });
  }

  const dbBefore = openDb(dbPath);
  const findBefore = (dbBefore.prepare("SELECT COUNT(*) as cnt FROM finding").get() as { cnt: number }).cnt;
  dbBefore.close();

  await runCalibrateCommand({ dir, dbPath });

  const dbAfter = openDb(dbPath);
  const findAfter = (dbAfter.prepare("SELECT COUNT(*) as cnt FROM finding").get() as { cnt: number }).cnt;
  dbAfter.close();

  expect(findAfter).toBe(findBefore);
});
