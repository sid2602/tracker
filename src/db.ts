import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

const CREATE_EXPENSES_TABLE = `
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  source_author TEXT NOT NULL,
  source_timestamp INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  category TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_author, source_timestamp, item_index)
);
`;

const INSERT_EXPENSE = `
INSERT OR IGNORE INTO expenses (
  source_author,
  source_timestamp,
  item_index,
  amount_cents,
  currency,
  category,
  occurred_on,
  note,
  raw_text,
  created_at
) VALUES (
  @sourceAuthor,
  @sourceTimestamp,
  @itemIndex,
  @amountCents,
  @currency,
  @category,
  @occurredOn,
  @note,
  @rawText,
  @createdAt
);
`;

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  return new Database(path);
}

export function initSchema(db: Database.Database): void {
  db.exec(CREATE_EXPENSES_TABLE);
}

export function insertExpenses(
  db: Database.Database,
  expenses: ExpenseInput[],
): { inserted: number } {
  const insert = db.prepare(INSERT_EXPENSE);
  const createdAt = new Date().toISOString();
  let inserted = 0;

  const insertMany = db.transaction((items: ExpenseInput[]) => {
    for (const expense of items) {
      const result = insert.run({
        ...expense,
        createdAt,
      });

      inserted += result.changes;
    }
  });

  insertMany(expenses);

  return { inserted };
}

function isCountRow(row: unknown): row is { count: number } {
  return (
    typeof row === "object" &&
    row !== null &&
    "count" in row &&
    typeof row.count === "number"
  );
}

function isAmountRow(row: unknown): row is { amount_cents: number } {
  return (
    typeof row === "object" &&
    row !== null &&
    "amount_cents" in row &&
    typeof row.amount_cents === "number"
  );
}

export function countExpenses(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM expenses").get();

  if (!isCountRow(row)) {
    return 0;
  }

  return row.count;
}

export function getExpenseByKey(
  db: Database.Database,
  sourceAuthor: string,
  sourceTimestamp: number,
  itemIndex: number,
): { amount_cents: number } | undefined {
  const row = db
    .prepare(
      `SELECT amount_cents
       FROM expenses
       WHERE source_author = ? AND source_timestamp = ? AND item_index = ?`,
    )
    .get(sourceAuthor, sourceTimestamp, itemIndex);

  return isAmountRow(row) ? row : undefined;
}
