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
    .addColumn("source_message_key", "text")
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
    .addColumn("last_error", "text")
    .addColumn("failed_at", "integer")
    .addColumn("received_at", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("categories")
    .ifNotExists()
    .addColumn("name", "text", (col) => col.primaryKey())
    .addColumn("description", "text")
    .addColumn("created_at", "text", (col) => col.notNull())
    .execute();

  const tableMetadata = await db.introspection.getTables();
  const expensesTable = tableMetadata.find((t) => t.name === "expenses");
  if (expensesTable && !expensesTable.columns.find((c) => c.name === "source_message_key")) {
    await db.schema.alterTable("expenses").addColumn("source_message_key", "text").execute();
  }

  const inboxTable = tableMetadata.find((t) => t.name === "inbox");
  if (inboxTable && !inboxTable.columns.find((c) => c.name === "last_error")) {
    await db.schema.alterTable("inbox").addColumn("last_error", "text").execute();
  }
  if (inboxTable && !inboxTable.columns.find((c) => c.name === "failed_at")) {
    await db.schema.alterTable("inbox").addColumn("failed_at", "integer").execute();
  }

  await db.schema
    .createIndex("expenses_message_item_unique_v2")
    .ifNotExists()
    .unique()
    .on("expenses")
    .columns(["source_message_key", "item_index"])
    .execute();

  await db.schema
    .createIndex("inbox_processing_idx")
    .ifNotExists()
    .on("inbox")
    .columns(["status", "next_attempt_at", "lease_until"])
    .execute();

  await db.schema
    .createIndex("expenses_reporting_idx")
    .ifNotExists()
    .on("expenses")
    .columns(["occurred_on", "category", "currency"])
    .execute();

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
