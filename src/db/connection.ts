import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createIndexes, createTables } from "./bootstrap.js";
import { migrateSchema } from "./migrations.js";
import { seedDefaultCategories } from "./seeds.js";
import type { AppDatabase } from "./schema.js";

const SQLITE_BUSY_TIMEOUT_MS = 5_000;

export function openDatabase(path: string): Kysely<AppDatabase> {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  return new Kysely<AppDatabase>({
    dialect: new SqliteDialect({
      database: db,
    }),
  });
}

export async function initSchema(db: Kysely<AppDatabase>): Promise<void> {
  const { categoriesCreated } = await createTables(db);
  await migrateSchema(db);
  await createIndexes(db);
  await seedDefaultCategories(db, categoriesCreated);
}
