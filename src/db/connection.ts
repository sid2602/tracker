import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  return new Database(path);
}

export function initSchema(db: Database.Database): void {
  db.exec(CREATE_EXPENSES_TABLE);
}
