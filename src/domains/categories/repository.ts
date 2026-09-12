import type { QueryCreator } from "kysely";
import type { AppDatabase, CategoryTable } from "../../db/schema.js";
import { UserInputError } from "../../worker/errors.js";
import {
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
} from "./schema.js";

export async function getAllCategories(
  db: QueryCreator<AppDatabase>,
): Promise<CategoryTable[]> {
  const rows = await db.selectFrom("categories").selectAll().orderBy("name").execute();
  return rows;
}

export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export async function categoryExists(
  db: QueryCreator<AppDatabase>,
  name: string,
): Promise<boolean> {
  const normalizedName = normalizeCategoryName(name);
  const result = await db
    .selectFrom("categories")
    .select("name")
    .where("name", "=", normalizedName)
    .executeTakeFirst();

  return result !== undefined;
}

export async function addCategory(
  db: QueryCreator<AppDatabase>,
  name: string,
  description?: string | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  validateCategoryText(name, "category name");
  if (
    description !== null &&
    description !== undefined &&
    (description.length > MAX_CATEGORY_DESCRIPTION_LENGTH ||
      hasControlCharacters(description))
  ) {
    throw new UserInputError("Category description is too long or invalid.");
  }
  const normalizedName = normalizeCategoryName(name);
  
  const result = await db
    .insertInto("categories")
    .values({
      name: normalizedName,
      description: description ?? null,
      created_at: now,
    })
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();
    
  return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
}

export async function removeCategory(
  db: QueryCreator<AppDatabase>,
  name: string,
): Promise<boolean> {
  validateCategoryText(name, "category name");
  const normalizedName = normalizeCategoryName(name);
  const result = await db
    .deleteFrom("categories")
    .where("name", "=", normalizedName)
    .executeTakeFirst();
    
  return result.numDeletedRows > 0n;
}

function validateCategoryText(value: string, label: string): void {
  const normalized = normalizeCategoryName(value);
  if (
    normalized.length === 0 ||
    normalized.length > MAX_CATEGORY_NAME_LENGTH ||
    hasControlCharacters(value)
  ) {
    throw new UserInputError(`Invalid ${label}.`);
  }
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}
