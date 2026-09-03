import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppDatabase } from "./schema.js";

const CREATE_EXPENSES_TABLE = `
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  source_author TEXT NOT NULL,
  source_timestamp INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  category TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_author, source_timestamp, item_index)
);
`;

export function openDatabase(path: string): Kysely<AppDatabase> {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  return new Kysely<AppDatabase>({
    dialect: new SqliteDialect({
      database: db,
    }),
  });
}

export async function initSchema(db: Kysely<AppDatabase>): Promise<void> {
  await sql.raw(CREATE_EXPENSES_TABLE).execute(db);
}
