import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initSchema, openDatabase } from "../../db/connection.js";
import { addCategory, getAllCategories, removeCategory } from "./repository.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";

describe("categories repository", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Kysely<AppDatabase>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-db-test-"));
    dbPath = join(tempDir, "expenses.db");
    db = openDatabase(dbPath);
    await initSchema(db);
    
    // clear default categories for clean tests
    await db.deleteFrom("categories").execute();
  });

  afterEach(async () => {
    await db.destroy();
    rmSync(tempDir, { recursive: true, force: true });
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
});
