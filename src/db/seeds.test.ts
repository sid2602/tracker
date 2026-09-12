import { afterEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createTables } from "./bootstrap.js";
import { seedDefaultCategories } from "./seeds.js";
import type { AppDatabase } from "./schema.js";
import { openTestDatabase } from "../test/fixtures.js";

describe("database seeds", () => {
  let db: Kysely<AppDatabase> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  it("seeds the default categories only for a newly created table", async () => {
    db = openTestDatabase();
    const { categoriesCreated } = await createTables(db);

    await seedDefaultCategories(db, categoriesCreated);

    const categories = await db
      .selectFrom("categories")
      .select(["name", "description"])
      .orderBy("name", "asc")
      .execute();
    expect(categories).toHaveLength(9);
    expect(categories).toContainEqual({
      name: "food",
      description: "restaurants, eating out, ordering in, coffee",
    });
  });

  it("does not seed an existing empty categories table", async () => {
    db = openTestDatabase();
    await createTables(db);
    const { categoriesCreated } = await createTables(db);

    await seedDefaultCategories(db, categoriesCreated);

    await expect(
      db.selectFrom("categories").selectAll().execute(),
    ).resolves.toEqual([]);
  });

  it("does not add defaults to a user-owned category catalog", async () => {
    db = openTestDatabase();
    await createTables(db);
    await db
      .insertInto("categories")
      .values({
        name: "personal",
        description: "user-defined",
        created_at: "2026-09-12T00:00:00.000Z",
      })
      .execute();

    await seedDefaultCategories(db, false);

    await expect(
      db.selectFrom("categories").select("name").execute(),
    ).resolves.toEqual([{ name: "personal" }]);
  });
});
