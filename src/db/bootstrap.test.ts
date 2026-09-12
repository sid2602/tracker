import { afterEach, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { createIndexes, createTables } from "./bootstrap.js";
import type { AppDatabase } from "./schema.js";
import { openTestDatabase } from "../test/fixtures.js";

type IndexRow = {
  name: string;
};

describe("database bootstrap", () => {
  let db: Kysely<AppDatabase> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  it("creates the base tables and reports a new categories table", async () => {
    db = openTestDatabase();

    await expect(createTables(db)).resolves.toEqual({
      categoriesCreated: true,
    });

    const tables = await db.introspection.getTables();
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["expenses", "inbox", "categories"]),
    );
  });

  it("does not treat an existing categories table as newly created", async () => {
    db = openTestDatabase();
    await createTables(db);
    await db
      .insertInto("categories")
      .values({
        name: "custom",
        description: "user category",
        created_at: "2026-09-12T00:00:00.000Z",
      })
      .execute();

    await expect(createTables(db)).resolves.toEqual({
      categoriesCreated: false,
    });
    await expect(
      db.selectFrom("categories").select("name").execute(),
    ).resolves.toEqual([{ name: "custom" }]);
  });

  it("creates the expected indexes after base tables exist", async () => {
    db = openTestDatabase();
    await createTables(db);

    await createIndexes(db);

    const indexes = await sql<IndexRow>`
      PRAGMA index_list("inbox")
    `.execute(db);
    expect(indexes.rows.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "inbox_processing_idx",
        "inbox_receive_sequence_unique",
      ]),
    );
  });
});
