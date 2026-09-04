import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppDatabase } from "./schema.js";


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
  await db.schema
    .createTable("expenses")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey())
    .addColumn("source_author", "text", (col) => col.notNull())
    .addColumn("source_timestamp", "integer", (col) => col.notNull())
    .addColumn("item_index", "integer", (col) => col.notNull())
    .addColumn("amount_cents", "integer", (col) => col.notNull())
    .addColumn("currency", "text", (col) => col.notNull().defaultTo("PLN"))
    .addColumn("category", "text", (col) => col.notNull())
    .addColumn("occurred_on", "text", (col) => col.notNull())
    .addColumn("note", "text", (col) => col.notNull())
    .addColumn("raw_text", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addUniqueConstraint("expenses_source_item_unique", [
      "source_author",
      "source_timestamp",
      "item_index",
    ])
    .execute();

  await db.schema
    .createTable("inbox")
    .ifNotExists()
    .addColumn("message_key", "text", (col) => col.primaryKey())
    .addColumn("raw_envelope", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("parsed_json", "text")
    .addColumn("response_text", "text")
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("next_attempt_at", "integer")
    .addColumn("lease_until", "integer")
    .addColumn("lease_token", "text")
    .addColumn("received_at", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("categories")
    .ifNotExists()
    .addColumn("name", "text", (col) => col.primaryKey())
    .addColumn("created_at", "text", (col) => col.notNull())
    .execute();

  const existingCategories = await db
    .selectFrom("categories")
    .select("name")
    .execute();

  if (existingCategories.length === 0) {
    const legacyCategories = [
      "groceries",
      "food",
      "fuel",
      "transport",
      "home",
      "bills",
      "health",
      "entertainment",
      "other",
    ];
    const now = new Date().toISOString();
    
    if (legacyCategories.length > 0) {
      await db
        .insertInto("categories")
        .values(
          legacyCategories.map((name) => ({
            name,
            created_at: now,
          }))
        )
        .execute();
    }
  }
}
