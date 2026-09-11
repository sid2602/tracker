import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
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

  await migrateLegacyExpenseUniqueConstraint(db);

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

type SqliteIndexRow = {
  name: string;
  unique: number;
  origin: string;
};

type SqliteIndexColumn = {
  name: string;
};

type DuplicateExpenseMessage = {
  source_message_key: string;
  item_index: number;
};

async function migrateLegacyExpenseUniqueConstraint(
  db: Kysely<AppDatabase>,
): Promise<void> {
  const indexes = await sql<SqliteIndexRow>`PRAGMA index_list('expenses')`.execute(db);

  for (const index of indexes.rows) {
    if (index.unique !== 1 || index.origin !== "u") {
      continue;
    }

    const escapedName = index.name.replaceAll('"', '""');
    const columns = await sql<SqliteIndexColumn>`
      PRAGMA index_info(${sql.raw(`"${escapedName}"`)})
    `.execute(db);
    const columnNames = columns.rows.map((column) => column.name);

    if (
      columnNames.length === 3 &&
      columnNames[0] === "source_author" &&
      columnNames[1] === "source_timestamp" &&
      columnNames[2] === "item_index"
    ) {
      await rebuildExpensesWithoutLegacyUniqueConstraint(db);
      return;
    }
  }
}

async function rebuildExpensesWithoutLegacyUniqueConstraint(
  db: Kysely<AppDatabase>,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const duplicateMessage = await sql<DuplicateExpenseMessage>`
      SELECT "source_message_key", "item_index"
      FROM "expenses"
      WHERE "source_message_key" IS NOT NULL
      GROUP BY "source_message_key", "item_index"
      HAVING COUNT(*) > 1
      LIMIT 1
    `.execute(trx);

    const duplicate = duplicateMessage.rows[0];
    if (duplicate) {
      throw new Error(
        `Cannot migrate expenses: duplicate source_message_key "${duplicate.source_message_key}" ` +
        `for item_index ${duplicate.item_index}`,
      );
    }

    await sql`ALTER TABLE "expenses" RENAME TO "expenses_legacy"`.execute(trx);
    await sql`
      CREATE TABLE "expenses" (
        "id" INTEGER PRIMARY KEY,
        "source_message_key" TEXT,
        "source_author" TEXT NOT NULL,
        "source_timestamp" INTEGER NOT NULL,
        "item_index" INTEGER NOT NULL,
        "amount_cents" INTEGER NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'PLN',
        "category" TEXT NOT NULL,
        "occurred_on" TEXT NOT NULL,
        "note" TEXT NOT NULL,
        "raw_text" TEXT NOT NULL,
        "created_at" TEXT NOT NULL
      )
    `.execute(trx);
    await sql`
      INSERT INTO "expenses" (
        "id",
        "source_message_key",
        "source_author",
        "source_timestamp",
        "item_index",
        "amount_cents",
        "currency",
        "category",
        "occurred_on",
        "note",
        "raw_text",
        "created_at"
      )
      SELECT
        "id",
        "source_message_key",
        "source_author",
        "source_timestamp",
        "item_index",
        "amount_cents",
        "currency",
        "category",
        "occurred_on",
        "note",
        "raw_text",
        "created_at"
      FROM "expenses_legacy"
    `.execute(trx);
    await sql`DROP TABLE "expenses_legacy"`.execute(trx);
  });
}
