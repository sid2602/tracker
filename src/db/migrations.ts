import { sql, type Kysely } from "kysely";
import type { AppDatabase } from "./schema.js";

export async function migrateSchema(db: Kysely<AppDatabase>): Promise<void> {
  const tableMetadata = await db.introspection.getTables();
  const expensesTable = tableMetadata.find((table) => table.name === "expenses");
  if (
    expensesTable &&
    !expensesTable.columns.find((column) => column.name === "source_message_key")
  ) {
    await db.schema
      .alterTable("expenses")
      .addColumn("source_message_key", "text")
      .execute();
  }

  const inboxTable = tableMetadata.find((table) => table.name === "inbox");
  if (
    inboxTable &&
    !inboxTable.columns.find((column) => column.name === "last_error")
  ) {
    await db.schema
      .alterTable("inbox")
      .addColumn("last_error", "text")
      .execute();
  }
  if (
    inboxTable &&
    !inboxTable.columns.find((column) => column.name === "failed_at")
  ) {
    await db.schema
      .alterTable("inbox")
      .addColumn("failed_at", "integer")
      .execute();
  }

  const categoriesTable = tableMetadata.find(
    (table) => table.name === "categories",
  );
  if (
    categoriesTable &&
    !categoriesTable.columns.find((column) => column.name === "description")
  ) {
    await db.schema
      .alterTable("categories")
      .addColumn("description", "text")
      .execute();
  }

  await migrateInboxReceiveSequence(db);
  await migrateLegacyExpenseUniqueConstraint(db);
}

type SqliteIndexRow = {
  name: string;
  unique: number;
  origin: string;
};

type SqliteIndexColumn = {
  name: string;
};

type SqliteTableInfoRow = {
  name: string;
  notnull: number;
};

type DuplicateExpenseMessage = {
  source_message_key: string;
  item_index: number;
};

async function migrateInboxReceiveSequence(
  db: Kysely<AppDatabase>,
): Promise<void> {
  const tableInfo = await sql<SqliteTableInfoRow>`
    PRAGMA table_info("inbox")
  `.execute(db);
  const sequenceColumn = tableInfo.rows.find(
    (column) => column.name === "receive_sequence",
  );

  if (!sequenceColumn || sequenceColumn.notnull !== 1) {
    await rebuildInboxWithReceiveSequence(db);
    return;
  }

  await db.transaction().execute(async (trx) => {
    await createInboxReceiveSequenceIndex(trx);
  });
}

async function rebuildInboxWithReceiveSequence(
  db: Kysely<AppDatabase>,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`ALTER TABLE "inbox" RENAME TO "inbox_legacy_sequence"`.execute(trx);
    await sql`
      CREATE TABLE "inbox" (
        "message_key" TEXT PRIMARY KEY,
        "receive_sequence" INTEGER NOT NULL,
        "raw_envelope" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "parsed_json" TEXT,
        "response_text" TEXT,
        "attempts" INTEGER NOT NULL,
        "next_attempt_at" INTEGER,
        "lease_until" INTEGER,
        "lease_token" TEXT,
        "last_error" TEXT,
        "failed_at" INTEGER,
        "received_at" INTEGER NOT NULL
      )
    `.execute(trx);
    await sql`
      INSERT INTO "inbox" (
        "message_key",
        "receive_sequence",
        "raw_envelope",
        "status",
        "parsed_json",
        "response_text",
        "attempts",
        "next_attempt_at",
        "lease_until",
        "lease_token",
        "last_error",
        "failed_at",
        "received_at"
      )
      SELECT
        "message_key",
        ROW_NUMBER() OVER (ORDER BY "received_at" ASC, "message_key" ASC),
        "raw_envelope",
        "status",
        "parsed_json",
        "response_text",
        "attempts",
        "next_attempt_at",
        "lease_until",
        "lease_token",
        "last_error",
        "failed_at",
        "received_at"
      FROM "inbox_legacy_sequence"
    `.execute(trx);
    await sql`DROP TABLE "inbox_legacy_sequence"`.execute(trx);
    await createInboxReceiveSequenceIndex(trx);
  });
}

async function createInboxReceiveSequenceIndex(
  db: Kysely<AppDatabase>,
): Promise<void> {
  const indexes = await sql<SqliteIndexRow>`
    PRAGMA index_list("inbox")
  `.execute(db);
  const existingIndex = indexes.rows.find(
    (index) => index.name === "inbox_receive_sequence_unique",
  );
  if (existingIndex) {
    const escapedName = existingIndex.name.replaceAll('"', '""');
    const columns = await sql<SqliteIndexColumn>`
      PRAGMA index_info(${sql.raw(`"${escapedName}"`)})
    `.execute(db);
    const columnNames = columns.rows.map((column) => column.name);
    if (
      existingIndex.unique !== 1 ||
      columnNames.length !== 1 ||
      columnNames[0] !== "receive_sequence"
    ) {
      throw new Error(
        'Inbox index "inbox_receive_sequence_unique" has an invalid definition',
      );
    }
    return;
  }

  await sql`
    CREATE UNIQUE INDEX "inbox_receive_sequence_unique"
    ON "inbox" ("receive_sequence")
  `.execute(db);
}

async function migrateLegacyExpenseUniqueConstraint(
  db: Kysely<AppDatabase>,
): Promise<void> {
  const indexes = await sql<SqliteIndexRow>`
    PRAGMA index_list('expenses')
  `.execute(db);

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
