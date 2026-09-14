import type { Kysely } from "kysely";
import type { AppDatabase } from "./schema.js";

export async function createTables(
  db: Kysely<AppDatabase>,
): Promise<{ categoriesCreated: boolean }> {
  const existingTables = await db.introspection.getTables();
  const categoriesExisted = existingTables.some(
    (table) => table.name === "categories",
  );

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
    .execute();

  await db.schema
    .createTable("inbox")
    .ifNotExists()
    .addColumn("message_key", "text", (col) => col.primaryKey())
    .addColumn("receive_sequence", "integer", (col) => col.notNull())
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

  await db.schema
    .createTable("training_entries")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey())
    .addColumn("source_message_key", "text")
    .addColumn("source_author", "text", (col) => col.notNull())
    .addColumn("source_timestamp", "integer", (col) => col.notNull())
    .addColumn("item_index", "integer", (col) => col.notNull())
    .addColumn("occurred_on", "text", (col) => col.notNull())
    .addColumn("exercise", "text", (col) => col.notNull())
    .addColumn("set_index", "integer")
    .addColumn("reps", "integer")
    .addColumn("weight_grams", "integer")
    .addColumn("duration_seconds", "integer")
    .addColumn("kind", "text")
    .addColumn("note", "text", (col) => col.notNull())
    .addColumn("raw_text", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .execute();

  return { categoriesCreated: !categoriesExisted };
}

export async function createIndexes(db: Kysely<AppDatabase>): Promise<void> {
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
    .createIndex("inbox_receive_sequence_unique")
    .ifNotExists()
    .unique()
    .on("inbox")
    .column("receive_sequence")
    .execute();

  await db.schema
    .createIndex("expenses_reporting_idx")
    .ifNotExists()
    .on("expenses")
    .columns(["occurred_on", "category", "currency"])
    .execute();

  await db.schema
    .createIndex("training_entries_message_item_unique")
    .ifNotExists()
    .unique()
    .on("training_entries")
    .columns(["source_message_key", "item_index"])
    .execute();

  await db.schema
    .createIndex("training_entries_day_time_idx")
    .ifNotExists()
    .on("training_entries")
    .columns(["occurred_on", "source_timestamp", "item_index"])
    .execute();

  await db.schema
    .createIndex("training_entries_exercise_day_idx")
    .ifNotExists()
    .on("training_entries")
    .columns(["exercise", "occurred_on"])
    .execute();
}
