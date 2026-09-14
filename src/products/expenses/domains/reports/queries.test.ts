import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createTestDatabase } from "../../../../test/fixtures.js";
import type { AppDatabase } from "../../../../db/schema.js";
import {
  insertExpenses,
  type ExpenseInput,
} from "../expenses/repository.js";
import { queryExpenseList } from "./queries.js";

const TEST_SOURCE_AUTHOR = "+15005550100";

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
    occurredOn: "2026-09-10",
    note: "groceries",
    rawText: "groceries 15 pln",
    ...overrides,
  };
}

describe("queryExpenseList", () => {
  let db: Kysely<AppDatabase>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("returns expenses in date range ordered by occurred_on then id", async () => {
    await insertExpenses(db, [
      createExpense({
        itemIndex: 0,
        amountCents: 2000,
        occurredOn: "2026-09-12",
        note: "later",
      }),
      createExpense({
        itemIndex: 1,
        amountCents: 1000,
        category: "food",
        occurredOn: "2026-09-10",
        note: "kawa",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_001,
        itemIndex: 0,
        amountCents: 500,
        occurredOn: "2026-08-15",
        note: "out of range",
      }),
    ]);

    const { items, totalCount } = await queryExpenseList(db, {
      start: "2026-09-01",
      end: "2026-09-30",
    });

    expect(totalCount).toBe(2);
    expect(items).toHaveLength(2);
    expect(items[0]?.note).toBe("kawa");
    expect(items[0]?.occurredOn).toBe("2026-09-10");
    expect(items[1]?.note).toBe("later");
    expect(items[1]?.occurredOn).toBe("2026-09-12");
  });

  it("filters by categories", async () => {
    await insertExpenses(db, [
      createExpense({
        itemIndex: 0,
        category: "groceries",
        note: "Lidl",
      }),
      createExpense({
        itemIndex: 1,
        category: "transport",
        note: "uber",
      }),
    ]);

    const { items, totalCount } = await queryExpenseList(
      db,
      { start: "2026-09-01", end: "2026-09-30" },
      ["transport"],
    );

    expect(totalCount).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]?.note).toBe("uber");
    expect(items[0]?.category).toBe("transport");
  });

  it("applies limit while preserving totalCount", async () => {
    await insertExpenses(db, [
      createExpense({ itemIndex: 0, note: "a", occurredOn: "2026-09-10" }),
      createExpense({ itemIndex: 1, note: "b", occurredOn: "2026-09-11" }),
      createExpense({ itemIndex: 2, note: "c", occurredOn: "2026-09-12" }),
    ]);

    const { items, totalCount } = await queryExpenseList(
      db,
      { start: "2026-09-01", end: "2026-09-30" },
      undefined,
      2,
    );

    expect(totalCount).toBe(3);
    expect(items).toHaveLength(2);
    expect(items.map((row) => row.note)).toEqual(["a", "b"]);
  });
});
