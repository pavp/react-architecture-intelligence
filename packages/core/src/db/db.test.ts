import { expect, test } from "vitest";
import { openDb } from "./db.js";

test("opens an in-memory db with all tables", () => {
  const db = openDb(":memory:");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const names = tables.map((t) => t.name);
  for (const t of ["finding", "feedback_event", "weight", "boundary_rule", "snapshot", "component", "embedding"]) {
    expect(names).toContain(t);
  }
  db.close();
});

test("sqlite-vec extension is loaded (vec_version available)", () => {
  const db = openDb(":memory:");
  const row = db.prepare("SELECT vec_version() AS v").get() as { v: string };
  expect(typeof row.v).toBe("string");
  db.close();
});

test("finding table is append-friendly (insert + read back)", () => {
  const db = openDb(":memory:");
  db.prepare(
    `INSERT INTO finding (id, fingerprint, rule_id, type, analysis_version, fp_algo_version,
       producing_run_id, commit_sha, severity_raw, evidence_json, created_at)
     VALUES (@id,@fp,@rule,@type,@av,@fav,@run,@sha,@sev,@ev,@ts)`,
  ).run({ id: "1", fp: "s", rule: "r", type: "opportunity", av: 1, fav: 1, run: "run", sha: "x", sev: "warn", ev: "{}", ts: 0 });
  const got = db.prepare("SELECT id FROM finding").get() as { id: string };
  expect(got.id).toBe("1");
  db.close();
});
