import type { Kysely } from "kysely";
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

export async function queryTotals(
  db: Kysely<AppDatabase>,
  range: DateRange,
): Promise<TotalBucket[]> {
  const { sum } = db.fn;

  const rows = await db
    .selectFrom("expenses")
    .select(["currency", sum<number>("amount_cents").as("amount_cents")])
    .where("occurred_on", ">=", range.start)
    .where("occurred_on", "<=", range.end)
    .groupBy("currency")
    .orderBy("currency")
    .execute();

  return rows.map((row) => ({
    currency: row.currency,
    amountCents: Number(row.amount_cents ?? 0),
  }));
}

export async function queryByCategory(
  db: Kysely<AppDatabase>,
  range: DateRange,
): Promise<CategoryBucket[]> {
  const { sum } = db.fn;

  const rows = await db
    .selectFrom("expenses")
    .select(["category", "currency", sum<number>("amount_cents").as("amount_cents")])
    .where("occurred_on", ">=", range.start)
    .where("occurred_on", "<=", range.end)
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
