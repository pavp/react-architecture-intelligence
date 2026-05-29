import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type Db = Database.Database;

/** Open + migrate + load sqlite-vec (§ persistence). Synchronous (better-sqlite3). */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  sqliteVec.load(db); // registers vec_version(), vec0 virtual tables, etc.
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
