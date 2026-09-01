import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initSchema, openDatabase } from "../../db/connection.js";
import {
  countExpenses,
  getExpenseByKey,
  insertExpenses,
  type ExpenseInput,
} from "./repository.js";

const TEST_SOURCE_AUTHOR = "+48000000000";

function createExpense(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    sourceAuthor: TEST_SOURCE_AUTHOR,
    sourceTimestamp: 1_700_000_000_000,
    itemIndex: 0,
    amountCents: 1500,
    currency: "PLN",
    category: "groceries",
    occurredOn: "2026-09-01",
    note: "zakupy",
    rawText: "zakupy 15 zl",
    ...overrides,
  };
}

describe("expenses repository", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-db-test-"));
    dbPath = join(tempDir, "expenses.db");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("inserts expense", () => {
    const db = openDatabase(dbPath);
    initSchema(db);

    const expense = createExpense();
    const result = insertExpenses(db, [expense]);

    expect(result.inserted).toBe(1);
    expect(countExpenses(db)).toBe(1);

    const stored = getExpenseByKey(
      db,
      expense.sourceAuthor,
      expense.sourceTimestamp,
      expense.itemIndex,
    );

    expect(stored?.amount_cents).toBe(1500);
    db.close();
  });

  it("ignores duplicate message", () => {
    const db = openDatabase(dbPath);
    initSchema(db);

    const expense = createExpense();
    const first = insertExpenses(db, [expense]);
    const second = insertExpenses(db, [expense]);

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(countExpenses(db)).toBe(1);
    db.close();
  });

  it("inserts multiple items in one transaction", () => {
    const db = openDatabase(dbPath);
    initSchema(db);

    const expenses = [
      createExpense({ itemIndex: 0, amountCents: 1000, note: "chleb" }),
      createExpense({ itemIndex: 1, amountCents: 500, note: "mleko" }),
    ];

    const result = insertExpenses(db, expenses);

    expect(result.inserted).toBe(2);
    expect(countExpenses(db)).toBe(2);
    db.close();
  });
});
