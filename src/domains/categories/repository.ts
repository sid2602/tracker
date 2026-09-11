import type { QueryCreator } from "kysely";
import type { AppDatabase, CategoryTable } from "../../db/schema.js";

export async function getAllCategories(
  db: QueryCreator<AppDatabase>,
): Promise<CategoryTable[]> {
  const rows = await db.selectFrom("categories").selectAll().orderBy("name").execute();
  return rows;
}

export async function addCategory(
  db: QueryCreator<AppDatabase>,
  name: string,
  description?: string | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  
  const result = await db
    .insertInto("categories")
    .values({ name, description: description ?? null, created_at: now })
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();
    
  return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
}

export async function removeCategory(
  db: QueryCreator<AppDatabase>,
  name: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("categories")
    .where("name", "=", name)
    .executeTakeFirst();
    
  return result.numDeletedRows > 0n;
}
