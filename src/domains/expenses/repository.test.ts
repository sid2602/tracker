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

  it("inserts expense", async () => {
    const db = openDatabase(dbPath);
    await initSchema(db);

    const expense = createExpense();
    const result = await insertExpenses(db, [expense]);

    expect(result.inserted).toBe(1);
    expect(await countExpenses(db)).toBe(1);

    const stored = await getExpenseByKey(
      db,
      expense.sourceAuthor,
      expense.sourceTimestamp,
      expense.itemIndex,
    );

    expect(stored?.amount_cents).toBe(1500);
    await db.destroy();
  });

  it("ignores duplicate message", async () => {
    const db = openDatabase(dbPath);
    await initSchema(db);

    const expense = createExpense();
    const first = await insertExpenses(db, [expense]);
    const second = await insertExpenses(db, [expense]);

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(await countExpenses(db)).toBe(1);
    await db.destroy();
  });

  it("inserts multiple items in one transaction", async () => {
    const db = openDatabase(dbPath);
    await initSchema(db);

    const expenses = [
      createExpense({ itemIndex: 0, amountCents: 1000, note: "chleb" }),
      createExpense({ itemIndex: 1, amountCents: 500, note: "mleko" }),
    ];

    const result = await insertExpenses(db, expenses);

    expect(result.inserted).toBe(2);
    expect(await countExpenses(db)).toBe(2);
    await db.destroy();
  });
});
