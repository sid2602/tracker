import { afterEach, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { initSchema, openDatabase } from "./connection.js";
import type { AppDatabase } from "./schema.js";
import { insertExpenses } from "../domains/expenses/repository.js";

type IndexRow = {
  name: string;
  unique: number;
};

type IndexColumn = {
  name: string;
};

describe("database migrations", () => {
  let db: Kysely<AppDatabase> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  async function assertIndex(
    table: "expenses" | "inbox",
    name: string,
    unique: number,
    columns: string[],
  ): Promise<void> {
    if (!db) {
      throw new Error("Database was not initialized");
    }

    const indexes = await sql<IndexRow>`
      PRAGMA index_list(${sql.raw(`"${table}"`)})
    `.execute(db);
    const index = indexes.rows.find((candidate) => candidate.name === name);
    expect(index?.unique).toBe(unique);

    const escapedName = name.replaceAll('"', '""');
    const indexColumns = await sql<IndexColumn>`
      PRAGMA index_info(${sql.raw(`"${escapedName}"`)})
    `.execute(db);
    expect(indexColumns.rows.map((column) => column.name)).toEqual(columns);
  }

  async function assertRequiredIndexes(): Promise<void> {
    await assertIndex(
      "inbox",
      "inbox_processing_idx",
      0,
      ["status", "next_attempt_at", "lease_until"],
    );
    await assertIndex(
      "inbox",
      "inbox_receive_sequence_unique",
      1,
      ["receive_sequence"],
    );
    await assertIndex(
      "expenses",
      "expenses_reporting_idx",
      0,
      ["occurred_on", "category", "currency"],
    );
    await assertIndex(
      "expenses",
      "expenses_message_item_unique_v2",
      1,
      ["source_message_key", "item_index"],
    );
  }

  it("creates the queue and reporting indexes on a fresh database", async () => {
    db = openDatabase(":memory:");

    await initSchema(db);

    await assertRequiredIndexes();
  });

  it("backfills receive sequences deterministically and reruns idempotently", async () => {
    db = openDatabase(":memory:");

    await db.schema
      .createTable("inbox")
      .addColumn("message_key", "text", (column) => column.primaryKey())
      .addColumn("raw_envelope", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("parsed_json", "text")
      .addColumn("response_text", "text")
      .addColumn("attempts", "integer", (column) => column.notNull())
      .addColumn("next_attempt_at", "integer")
      .addColumn("lease_until", "integer")
      .addColumn("lease_token", "text")
      .addColumn("received_at", "integer", (column) => column.notNull())
      .execute();
    await sql`
      INSERT INTO "inbox" (
        "message_key",
        "raw_envelope",
        "status",
        "attempts",
        "received_at"
      )
      VALUES
        ('later', '{}', 'pending', 0, 20),
        ('earlier', '{}', 'pending', 0, 10)
    `.execute(db);

    await initSchema(db);
    await initSchema(db);

    const rows = await db
      .selectFrom("inbox")
      .select(["message_key", "receive_sequence"])
      .orderBy("receive_sequence", "asc")
      .execute();
    expect(rows).toEqual([
      { message_key: "earlier", receive_sequence: 1 },
      { message_key: "later", receive_sequence: 2 },
    ]);
    await assertRequiredIndexes();
  });

  it("enforces non-null and unique receive sequences", async () => {
    db = openDatabase(":memory:");
    await initSchema(db);

    await expect(
      db
        .insertInto("inbox")
        .values({
          message_key: "first",
          receive_sequence: 1,
          raw_envelope: "{}",
          status: "pending",
          attempts: 0,
          received_at: 1,
        })
        .execute(),
    ).resolves.toBeDefined();

    await expect(
      db
        .insertInto("inbox")
        .values({
          message_key: "duplicate-sequence",
          receive_sequence: 1,
          raw_envelope: "{}",
          status: "pending",
          attempts: 0,
          received_at: 2,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("rejects a partially migrated receive-sequence index", async () => {
    db = openDatabase(":memory:");
    await initSchema(db);
    await sql`DROP INDEX "inbox_receive_sequence_unique"`.execute(db);
    await sql`
      CREATE INDEX "inbox_receive_sequence_unique"
      ON "inbox" ("received_at")
    `.execute(db);

    await expect(initSchema(db)).rejects.toThrow(
      'Inbox index "inbox_receive_sequence_unique" has an invalid definition',
    );
  });

  it("removes the legacy expense uniqueness constraint", async () => {
    db = openDatabase(":memory:");

    await db.schema
      .createTable("expenses")
      .addColumn("id", "integer", (column) => column.primaryKey())
      .addColumn("source_message_key", "text")
      .addColumn("source_author", "text", (column) => column.notNull())
      .addColumn("source_timestamp", "integer", (column) => column.notNull())
      .addColumn("item_index", "integer", (column) => column.notNull())
      .addColumn("amount_cents", "integer", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("category", "text", (column) => column.notNull())
      .addColumn("occurred_on", "text", (column) => column.notNull())
      .addColumn("note", "text", (column) => column.notNull())
      .addColumn("raw_text", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addUniqueConstraint("legacy_expense_unique", [
        "source_author",
        "source_timestamp",
        "item_index",
      ])
      .execute();

    await db.schema
      .createIndex("expenses_message_item_unique_v2")
      .unique()
      .on("expenses")
      .columns(["source_message_key", "item_index"])
      .execute();

    await db.schema
      .createTable("inbox")
      .addColumn("message_key", "text", (column) => column.primaryKey())
      .addColumn("raw_envelope", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("parsed_json", "text")
      .addColumn("response_text", "text")
      .addColumn("attempts", "integer", (column) => column.notNull())
      .addColumn("next_attempt_at", "integer")
      .addColumn("lease_until", "integer")
      .addColumn("lease_token", "text")
      .addColumn("received_at", "integer", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("categories")
      .addColumn("name", "text", (column) => column.primaryKey())
      .addColumn("created_at", "text", (column) => column.notNull())
      .execute();

    await db
      .insertInto("expenses")
      .values({
        source_message_key: "legacy-message",
        source_author: "+48000000000",
        source_timestamp: 100,
        item_index: 0,
        amount_cents: 1000,
        currency: "PLN",
        category: "food",
        occurred_on: "2026-09-11",
        note: "legacy",
        raw_text: "legacy",
        created_at: new Date().toISOString(),
      })
      .execute();

    await initSchema(db);
    await initSchema(db);
    await assertRequiredIndexes();

    const result = await insertExpenses(db, [
      {
        sourceMessageKey: "new-message",
        sourceAuthor: "+48000000000",
        sourceTimestamp: 100,
        itemIndex: 0,
        amountCents: 2000,
        currency: "PLN",
        category: "food",
        occurredOn: "2026-09-11",
        note: "new",
        rawText: "new",
      },
    ]);

    expect(result.inserted).toBe(1);
    const duplicate = await insertExpenses(db, [
      {
        sourceMessageKey: "new-message",
        sourceAuthor: "+48999999999",
        sourceTimestamp: 200,
        itemIndex: 0,
        amountCents: 3000,
        currency: "PLN",
        category: "food",
        occurredOn: "2026-09-11",
        note: "duplicate",
        rawText: "duplicate",
      },
    ]);

    expect(duplicate.inserted).toBe(0);
    const expenses = await db.selectFrom("expenses").selectAll().execute();
    expect(expenses).toHaveLength(2);
    expect(expenses[0]?.source_message_key).toBe("legacy-message");
    expect(expenses[1]?.source_message_key).toBe("new-message");
  });

  it("adds the message key while upgrading the oldest expense schema", async () => {
    db = openDatabase(":memory:");

    await db.schema
      .createTable("expenses")
      .addColumn("id", "integer", (column) => column.primaryKey())
      .addColumn("source_author", "text", (column) => column.notNull())
      .addColumn("source_timestamp", "integer", (column) => column.notNull())
      .addColumn("item_index", "integer", (column) => column.notNull())
      .addColumn("amount_cents", "integer", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("category", "text", (column) => column.notNull())
      .addColumn("occurred_on", "text", (column) => column.notNull())
      .addColumn("note", "text", (column) => column.notNull())
      .addColumn("raw_text", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addUniqueConstraint("legacy_expense_unique", [
        "source_author",
        "source_timestamp",
        "item_index",
      ])
      .execute();

    await db.schema
      .createTable("inbox")
      .addColumn("message_key", "text", (column) => column.primaryKey())
      .addColumn("raw_envelope", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("parsed_json", "text")
      .addColumn("response_text", "text")
      .addColumn("attempts", "integer", (column) => column.notNull())
      .addColumn("next_attempt_at", "integer")
      .addColumn("lease_until", "integer")
      .addColumn("lease_token", "text")
      .addColumn("received_at", "integer", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("categories")
      .addColumn("name", "text", (column) => column.primaryKey())
      .addColumn("created_at", "text", (column) => column.notNull())
      .execute();

    await db
      .insertInto("expenses")
      .values({
        source_author: "+48000000000",
        source_timestamp: 100,
        item_index: 0,
        amount_cents: 1000,
        currency: "PLN",
        category: "food",
        occurred_on: "2026-09-11",
        note: "old schema",
        raw_text: "old schema",
        created_at: new Date().toISOString(),
      })
      .execute();

    await initSchema(db);
    await assertRequiredIndexes();

    const legacyExpense = await db
      .selectFrom("expenses")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(legacyExpense.source_message_key).toBeNull();

    const result = await insertExpenses(db, [
      {
        sourceMessageKey: "new-message",
        sourceAuthor: "+48000000000",
        sourceTimestamp: 100,
        itemIndex: 0,
        amountCents: 2000,
        currency: "PLN",
        category: "food",
        occurredOn: "2026-09-11",
        note: "new",
        rawText: "new",
      },
    ]);
    expect(result.inserted).toBe(1);
  });

  it("aborts migration instead of dropping duplicate message identity", async () => {
    db = openDatabase(":memory:");

    await db.schema
      .createTable("expenses")
      .addColumn("id", "integer", (column) => column.primaryKey())
      .addColumn("source_message_key", "text")
      .addColumn("source_author", "text", (column) => column.notNull())
      .addColumn("source_timestamp", "integer", (column) => column.notNull())
      .addColumn("item_index", "integer", (column) => column.notNull())
      .addColumn("amount_cents", "integer", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("category", "text", (column) => column.notNull())
      .addColumn("occurred_on", "text", (column) => column.notNull())
      .addColumn("note", "text", (column) => column.notNull())
      .addColumn("raw_text", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addUniqueConstraint("legacy_expense_unique", [
        "source_author",
        "source_timestamp",
        "item_index",
      ])
      .execute();

    await db.schema
      .createTable("inbox")
      .addColumn("message_key", "text", (column) => column.primaryKey())
      .addColumn("raw_envelope", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("parsed_json", "text")
      .addColumn("response_text", "text")
      .addColumn("attempts", "integer", (column) => column.notNull())
      .addColumn("next_attempt_at", "integer")
      .addColumn("lease_until", "integer")
      .addColumn("lease_token", "text")
      .addColumn("received_at", "integer", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("categories")
      .addColumn("name", "text", (column) => column.primaryKey())
      .addColumn("created_at", "text", (column) => column.notNull())
      .execute();

    await db
      .insertInto("expenses")
      .values([
        {
          source_message_key: "duplicate-message",
          source_author: "+48000000000",
          source_timestamp: 100,
          item_index: 0,
          amount_cents: 1000,
          currency: "PLN",
          category: "food",
          occurred_on: "2026-09-11",
          note: "first",
          raw_text: "first",
          created_at: new Date().toISOString(),
        },
        {
          source_message_key: "duplicate-message",
          source_author: "+48000000001",
          source_timestamp: 101,
          item_index: 0,
          amount_cents: 2000,
          currency: "PLN",
          category: "food",
          occurred_on: "2026-09-11",
          note: "second",
          raw_text: "second",
          created_at: new Date().toISOString(),
        },
      ])
      .execute();

    await expect(initSchema(db)).rejects.toThrow(
      'duplicate source_message_key "duplicate-message"',
    );
    const expenses = await db.selectFrom("expenses").selectAll().execute();
    expect(expenses).toHaveLength(2);
    expect(expenses.every((expense) => expense.source_message_key === "duplicate-message")).toBe(
      true,
    );
  });
});
