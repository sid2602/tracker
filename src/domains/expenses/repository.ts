import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";

export type ExpenseInput = {
  sourceAuthor: string;
  sourceTimestamp: number;
  itemIndex: number;
  amountCents: number;
  currency: string;
  category: string;
  occurredOn: string;
  note: string;
  rawText: string;
};

export async function insertExpenses(
  db: Kysely<AppDatabase>,
  expenses: ExpenseInput[],
): Promise<{ inserted: number }> {
  if (expenses.length === 0) {
    return { inserted: 0 };
  }

  const createdAt = new Date().toISOString();
  
  const values = expenses.map((expense) => ({
    source_author: expense.sourceAuthor,
    source_timestamp: expense.sourceTimestamp,
    item_index: expense.itemIndex,
    amount_cents: expense.amountCents,
    currency: expense.currency,
    category: expense.category,
    occurred_on: expense.occurredOn,
    note: expense.note,
    raw_text: expense.rawText,
    created_at: createdAt,
  }));

  const result = await db
    .insertInto("expenses")
    .values(values)
    .onConflict((oc) => oc.doNothing()) // INSERT OR IGNORE
    .execute();

  // Better-sqlite3 with Kysely returns changes as numInsertedOrUpdatedRows
  // Actually, `onConflict().doNothing()` might return BigInt for numInsertedOrUpdatedRows. 
  // Let's sum it up or just return the count of rows that were actually inserted.
  // result[0].numInsertedOrUpdatedRows might be BigInt | undefined
  const inserted = Number(result[0]?.numInsertedOrUpdatedRows ?? 0);

  return { inserted };
}

export async function countExpenses(db: Kysely<AppDatabase>): Promise<number> {
  const { count } = db.fn;
  const result = await db
    .selectFrom("expenses")
    .select(count<number>("id").as("count"))
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

export async function getExpenseByKey(
  db: Kysely<AppDatabase>,
  sourceAuthor: string,
  sourceTimestamp: number,
  itemIndex: number,
): Promise<{ amount_cents: number } | undefined> {
  const result = await db
    .selectFrom("expenses")
    .select("amount_cents")
    .where("source_author", "=", sourceAuthor)
    .where("source_timestamp", "=", sourceTimestamp)
    .where("item_index", "=", itemIndex)
    .executeTakeFirst();

  return result;
}
