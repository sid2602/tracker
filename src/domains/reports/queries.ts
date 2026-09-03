import type Database from "better-sqlite3";
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

function isTotalRow(
  row: unknown,
): row is { currency: string; amount_cents: number } {
  return (
    typeof row === "object" &&
    row !== null &&
    "currency" in row &&
    "amount_cents" in row &&
    typeof row.currency === "string" &&
    typeof row.amount_cents === "number"
  );
}

function isCategoryRow(
  row: unknown,
): row is { category: string; currency: string; amount_cents: number } {
  return (
    isTotalRow(row) &&
    "category" in row &&
    typeof row.category === "string"
  );
}

export function queryTotals(
  db: Database.Database,
  range: DateRange,
): TotalBucket[] {
  const rows = db
    .prepare(
      `SELECT currency, SUM(amount_cents) AS amount_cents
       FROM expenses
       WHERE occurred_on >= ? AND occurred_on <= ?
       GROUP BY currency
       ORDER BY currency`,
    )
    .all(range.start, range.end);

  const buckets: TotalBucket[] = [];

  for (const row of rows) {
    if (!isTotalRow(row)) {
      continue;
    }

    buckets.push({
      currency: row.currency,
      amountCents: row.amount_cents,
    });
  }

  return buckets;
}

export function queryByCategory(
  db: Database.Database,
  range: DateRange,
): CategoryBucket[] {
  const rows = db
    .prepare(
      `SELECT category, currency, SUM(amount_cents) AS amount_cents
       FROM expenses
       WHERE occurred_on >= ? AND occurred_on <= ?
       GROUP BY category, currency
       ORDER BY category, currency`,
    )
    .all(range.start, range.end);

  const buckets: CategoryBucket[] = [];

  for (const row of rows) {
    if (!isCategoryRow(row)) {
      continue;
    }

    buckets.push({
      category: row.category,
      currency: row.currency,
      amountCents: row.amount_cents,
    });
  }

  return buckets;
}
