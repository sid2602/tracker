import { describe, expect, it } from "vitest";
import { expenseResultSchema } from "./schema.js";

describe("expenses schema", () => {
  it("rejects expense category outside schema", () => {
    expect(() =>
      expenseResultSchema.parse({
        items: [
          {
            amountCents: 1500,
            currency: "PLN",
            category: "vacation",
            occurredOn: "2026-09-01",
            note: "wakacje",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects negative expense amount", () => {
    expect(() =>
      expenseResultSchema.parse({
        items: [
          {
            amountCents: -100,
            currency: "PLN",
            category: "food",
            occurredOn: "2026-09-01",
            note: "kawa",
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts valid expense result", () => {
    const result = expenseResultSchema.parse({
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "zakupy",
        },
      ],
    });

    expect(result.items[0]?.amountCents).toBe(1500);
  });

  it("accepts null currency", () => {
    const result = expenseResultSchema.parse({
      items: [
        {
          amountCents: 1500,
          currency: null,
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "zakupy",
        },
      ],
    });

    expect(result.items[0]?.currency).toBeNull();
  });
});
