import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../../../test/fixtures.js";
import {
  addCategory,
  categoryExists,
  getAllCategories,
  removeCategory,
} from "./repository.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";

describe("categories repository", () => {
  let db: Kysely<AppDatabase>;

  beforeEach(async () => {
    db = await createTestDatabase();
    
    // clear default categories for clean tests
    await db.deleteFrom("categories").execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("adds category and retrieves it", async () => {
    const inserted = await addCategory(db, "subscriptions", "netflix");
    expect(inserted).toBe(true);
    
    const categories = await getAllCategories(db);
    expect(categories.length).toBe(1);
    expect(categories[0]?.name).toBe("subscriptions");
    expect(categories[0]?.description).toBe("netflix");
  });
  
  it("does not insert duplicate category", async () => {
    await addCategory(db, "subscriptions", "netflix");
    const insertedAgain = await addCategory(db, "subscriptions", "spotify");
    
    expect(insertedAgain).toBe(false);
    
    const categories = await getAllCategories(db);
    expect(categories.length).toBe(1);
    expect(categories[0]?.description).toBe("netflix");
  });

  it("normalizes category names when checking existence", async () => {
    await addCategory(db, " Food ");

    await expect(categoryExists(db, "food")).resolves.toBe(true);
    await expect(categoryExists(db, " FOOD ")).resolves.toBe(true);
    await expect(categoryExists(db, "travel")).resolves.toBe(false);
  });

  it("removes existing category", async () => {
    await addCategory(db, "pets");
    const removed = await removeCategory(db, "pets");
    
    expect(removed).toBe(true);
    const categories = await getAllCategories(db);
    expect(categories.map(c => c.name)).not.toContain("pets");
  });

  it("returns false when removing non-existing category", async () => {
    const removed = await removeCategory(db, "pets");
    expect(removed).toBe(false);
  });

  it("rejects oversized category descriptions", async () => {
    await expect(
      addCategory(db, "pets", "x".repeat(501)),
    ).rejects.toThrow("description is too long");
  });
});
