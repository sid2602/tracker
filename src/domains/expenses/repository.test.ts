import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../test/fixtures.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import {
  countExpenses,
  getExpenseByKey,
  insertExpenses,
  type ExpenseInput,
} from "./repository.js";

const TEST_SOURCE_AUTHOR = "+48000000000";

function createExpense(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  const sourceTimestamp = overrides.sourceTimestamp ?? 1_700_000_000_000;

  return {
    sourceMessageKey: `message-${sourceTimestamp}`,
    sourceAuthor: TEST_SOURCE_AUTHOR,
    sourceTimestamp,
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
  let db: Kysely<AppDatabase>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("inserts expense", async () => {
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
  });

  it("ignores duplicate message", async () => {
    const expense = createExpense();
    const first = await insertExpenses(db, [expense]);
    const second = await insertExpenses(db, [expense]);

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(await countExpenses(db)).toBe(1);
  });

  it("inserts multiple items in one transaction", async () => {
    const expenses = [
      createExpense({ itemIndex: 0, amountCents: 1000, note: "chleb" }),
      createExpense({ itemIndex: 1, amountCents: 500, note: "mleko" }),
    ];

    const result = await insertExpenses(db, expenses);

    expect(result.inserted).toBe(2);
    expect(await countExpenses(db)).toBe(2);
  });

  it("enforces idempotency by source message key and item index", async () => {
    const first = createExpense({
      sourceMessageKey: "same-message",
      sourceTimestamp: 100,
      itemIndex: 0,
    });
    const second = createExpense({
      sourceMessageKey: "same-message",
      sourceAuthor: "+48111111111",
      sourceTimestamp: 200,
      itemIndex: 0,
    });

    expect((await insertExpenses(db, [first])).inserted).toBe(1);
    expect((await insertExpenses(db, [second])).inserted).toBe(0);
    expect(await countExpenses(db)).toBe(1);
  });
});
