import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";

export async function getAllCategories(db: Kysely<AppDatabase>): Promise<string[]> {
  const rows = await db.selectFrom("categories").select("name").orderBy("name").execute();
  return rows.map((r) => r.name);
}

export async function addCategory(db: Kysely<AppDatabase>, name: string): Promise<boolean> {
  const now = new Date().toISOString();
  
  const result = await db
    .insertInto("categories")
    .values({ name, created_at: now })
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();
    
  return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
}

export async function removeCategory(db: Kysely<AppDatabase>, name: string): Promise<boolean> {
  const result = await db
    .deleteFrom("categories")
    .where("name", "=", name)
    .executeTakeFirst();
    
  return result.numDeletedRows > 0n;
}
