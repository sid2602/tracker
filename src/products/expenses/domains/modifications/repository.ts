import { sql, type QueryCreator, type Selectable } from "kysely";
import type { AppDatabase, ExpenseTable } from "../../../../db/schema.js";
import { normalizeCategoryName } from "../categories/repository.js";
import type {
  ModificationResult,
  ModificationSearch,
  ModificationUpdatePayload,
} from "./schema.js";

export async function findMatchingExpenses(
  db: QueryCreator<AppDatabase>,
  author: string,
  modification: ModificationResult,
): Promise<Selectable<ExpenseTable>[]> {
  let query = db.selectFrom("expenses").selectAll().where("source_author", "=", author);

  if (modification.target === "last") {
    if (
      modification.id !== null &&
      modification.id !== undefined ||
      modification.searchCriteria !== null &&
      modification.searchCriteria !== undefined ||
      modification.selection !== null &&
      modification.selection !== undefined
    ) {
      return [];
    }

    query = query.orderBy("id", "desc").limit(1);
  } else if (modification.target === "id") {
    if (
      modification.id === null ||
      modification.id === undefined ||
      !Number.isSafeInteger(modification.id) ||
      modification.id <= 0 ||
      modification.searchCriteria !== null &&
      modification.searchCriteria !== undefined ||
      modification.selection !== null &&
      modification.selection !== undefined
    ) {
      return [];
    }

    query = query.where("id", "=", modification.id);
  } else if (modification.target === "specific") {
    const searchCriteria = modification.searchCriteria;
    if (!searchCriteria || !hasRealSearchCriterion(searchCriteria)) {
      return [];
    }

    if (searchCriteria.category !== null && searchCriteria.category !== undefined) {
      const category = normalizeCategoryName(searchCriteria.category);
      if (category.length === 0) {
        return [];
      }
      query = query.where(
        sql<boolean>`lower(trim("category")) = ${category}`,
      );
    }
    if (
      searchCriteria.amountCents !== null &&
      searchCriteria.amountCents !== undefined
    ) {
      if (
        !Number.isSafeInteger(searchCriteria.amountCents) ||
        searchCriteria.amountCents <= 0
      ) {
        return [];
      }
      query = query.where("amount_cents", "=", searchCriteria.amountCents);
    }
    if (searchCriteria.occurredOn !== null && searchCriteria.occurredOn !== undefined) {
      query = query.where("occurred_on", "=", searchCriteria.occurredOn);
    }
    if (searchCriteria.keyword !== null && searchCriteria.keyword !== undefined) {
      const pattern = `%${escapeLikePattern(searchCriteria.keyword)}%`;
      const escapeCharacter = "\\";
      query = query.where(sql<boolean>`
        (
          "note" LIKE ${pattern} ESCAPE ${escapeCharacter}
          OR "raw_text" LIKE ${pattern} ESCAPE ${escapeCharacter}
        )
      `);
    }

    if (modification.selection === "first") {
      query = query.orderBy("id", "asc").limit(1);
    } else if (modification.selection === "last") {
      query = query.orderBy("id", "desc").limit(1);
    } else {
      query = query.orderBy("id", "desc").limit(5);
    }
  } else {
    return [];
  }

  return query.execute();
}

export async function deleteExpense(
  db: QueryCreator<AppDatabase>,
  author: string,
  id: number,
): Promise<boolean> {
  const result = await db
    .deleteFrom("expenses")
    .where("id", "=", id)
    .where("source_author", "=", author)
    .executeTakeFirst();

  return result.numDeletedRows > 0n;
}

export async function updateExpense(
  db: QueryCreator<AppDatabase>,
  author: string,
  id: number,
  payload: ModificationUpdatePayload,
): Promise<boolean> {
  const updates: Partial<Pick<ExpenseTable, "category" | "amount_cents">> = {};
  if (payload.category !== null && payload.category !== undefined) {
    const category = normalizeCategoryName(payload.category);
    if (category.length === 0) {
      return false;
    }
    updates.category = category;
  }
  if (payload.amountCents !== null && payload.amountCents !== undefined) {
    if (
      !Number.isSafeInteger(payload.amountCents) ||
      payload.amountCents <= 0
    ) {
      return false;
    }
    updates.amount_cents = payload.amountCents;
  }

  if (Object.keys(updates).length === 0) {
    return false;
  }

  const result = await db
    .updateTable("expenses")
    .set(updates)
    .where("id", "=", id)
    .where("source_author", "=", author)
    .executeTakeFirst();

  return result.numUpdatedRows > 0n;
}

function hasRealSearchCriterion(searchCriteria: ModificationSearch): boolean {
  return (
    (searchCriteria.category !== null &&
      searchCriteria.category !== undefined) ||
    (searchCriteria.amountCents !== null &&
      searchCriteria.amountCents !== undefined) ||
    (searchCriteria.keyword !== null &&
      searchCriteria.keyword !== undefined) ||
    (searchCriteria.occurredOn !== null &&
      searchCriteria.occurredOn !== undefined)
  );
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}
