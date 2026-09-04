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
    .addColumn("description", "text")
    .addColumn("created_at", "text", (col) => col.notNull())
    .execute();

  // Simple migration: check if description column exists, add if not
  const tableMetadata = await db.introspection.getTables();
  const categoriesTable = tableMetadata.find((t) => t.name === "categories");
  if (categoriesTable && !categoriesTable.columns.find((c) => c.name === "description")) {
    await db.schema.alterTable("categories").addColumn("description", "text").execute();
  }

  const existingCategories = await db
    .selectFrom("categories")
    .select("name")
    .execute();

  if (existingCategories.length === 0) {
    const legacyCategories = [
      { name: "groceries", description: "supermarkets, daily food shopping" },
      { name: "food", description: "restaurants, eating out, ordering in, coffee" },
      { name: "fuel", description: "gas station, car fuel" },
      { name: "transport", description: "uber, public transport, taxis" },
      { name: "home", description: "furniture, home accessories, repairs" },
      { name: "bills", description: "electricity, rent, subscriptions" },
      { name: "health", description: "medicines, doctors, pharmacy" },
      { name: "entertainment", description: "cinema, games, events, fun" },
      { name: "other", description: "anything else that does not fit" },
    ];
    const now = new Date().toISOString();
    
    if (legacyCategories.length > 0) {
      await db
        .insertInto("categories")
        .values(
          legacyCategories.map((cat) => ({
            name: cat.name,
            description: cat.description,
            created_at: now,
          }))
        )
        .execute();
    }
  }
}
