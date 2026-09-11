import { sql, type QueryCreator, type SelectQueryBuilder } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import type { DateRange } from "../../lib/periods.js";

export type TotalBucket = {
  currency: string;
  amountCents: number;
};

export type CategoryBucket = {
  category: string;
  currency: string;
  amountCents: number;
};

export type ExpenseListItem = {
  id: number;
  amountCents: number;
  currency: string;
  category: string;
  occurredOn: string;
  note: string;
};

export type ExpenseListResult = {
  items: ExpenseListItem[];
  totalCount: number;
};

function applyRangeAndCategories<O>(
  query: SelectQueryBuilder<AppDatabase, "expenses", O>,
  range: DateRange,
  categories?: string[],
): SelectQueryBuilder<AppDatabase, "expenses", O> {
  let next = query
    .where("occurred_on", ">=", range.start)
    .where("occurred_on", "<=", range.end);

  if (categories && categories.length > 0) {
    next = next.where("category", "in", categories);
  }

  return next;
}

export async function queryTotals(
  db: QueryCreator<AppDatabase>,
  range: DateRange,
  categories?: string[],
): Promise<TotalBucket[]> {
  const rows = await applyRangeAndCategories(
    db
      .selectFrom("expenses")
      .select(["currency", sql<number>`sum(amount_cents)`.as("amount_cents")]),
    range,
    categories,
  )
    .groupBy("currency")
    .orderBy("currency")
    .execute();

  return rows.map((row) => ({
    currency: row.currency,
    amountCents: Number(row.amount_cents ?? 0),
  }));
}

export async function queryByCategory(
  db: QueryCreator<AppDatabase>,
  range: DateRange,
  categories?: string[],
): Promise<CategoryBucket[]> {
  const rows = await applyRangeAndCategories(
    db
      .selectFrom("expenses")
      .select([
        "category",
        "currency",
        sql<number>`sum(amount_cents)`.as("amount_cents"),
      ]),
    range,
    categories,
  )
    .groupBy(["category", "currency"])
    .orderBy("category")
    .orderBy("currency")
    .execute();

  return rows.map((row) => ({
    category: row.category,
    currency: row.currency,
    amountCents: Number(row.amount_cents ?? 0),
  }));
}

export async function queryExpenseList(
  db: QueryCreator<AppDatabase>,
  range: DateRange,
  categories?: string[],
  limit?: number,
): Promise<ExpenseListResult> {
  const countRow = await applyRangeAndCategories(
    db.selectFrom("expenses").select(sql<number>`count(*)`.as("count")),
    range,
    categories,
  ).executeTakeFirstOrThrow();

  const totalCount = Number(countRow.count);

  let listQuery = applyRangeAndCategories(
    db
      .selectFrom("expenses")
      .select([
        "id",
        "amount_cents",
        "currency",
        "category",
        "occurred_on",
        "note",
      ]),
    range,
    categories,
  )
    .orderBy("occurred_on", "asc")
    .orderBy("id", "asc");

  if (limit !== undefined) {
    listQuery = listQuery.limit(limit);
  }

  const rows = await listQuery.execute();

  return {
    totalCount,
    items: rows.map((row) => ({
      id: row.id,
      amountCents: row.amount_cents,
      currency: row.currency,
      category: row.category,
      occurredOn: row.occurred_on,
      note: row.note,
    })),
  };
}
