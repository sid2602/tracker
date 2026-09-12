import { afterEach, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { migrateSchema } from "./migrations.js";
import type { AppDatabase } from "./schema.js";
import { openTestDatabase } from "../test/fixtures.js";

describe("database migrations", () => {
  let db: Kysely<AppDatabase> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  it("adds legacy columns and rebuilds inbox receive sequencing", async () => {
    db = openTestDatabase();
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

    await migrateSchema(db);
    await migrateSchema(db);

    const tableMetadata = await db.introspection.getTables();
    const expenses = tableMetadata.find((table) => table.name === "expenses");
    const inbox = tableMetadata.find((table) => table.name === "inbox");
    const categories = tableMetadata.find((table) => table.name === "categories");
    expect(expenses?.columns.map((column) => column.name)).toContain(
      "source_message_key",
    );
    expect(inbox?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "receive_sequence",
        "last_error",
        "failed_at",
      ]),
    );
    expect(categories?.columns.map((column) => column.name)).toContain(
      "description",
    );

    await expect(
      db
        .selectFrom("inbox")
        .select(["message_key", "receive_sequence"])
        .orderBy("receive_sequence", "asc")
        .execute(),
    ).resolves.toEqual([
      { message_key: "earlier", receive_sequence: 1 },
      { message_key: "later", receive_sequence: 2 },
    ]);
  });
});
