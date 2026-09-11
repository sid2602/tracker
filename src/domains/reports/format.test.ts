import { describe, expect, it } from "vitest";
import { formatExpenseList } from "./format.js";
import type { ExpenseListItem } from "./queries.js";

function item(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    id: 1,
    amountCents: 1250,
    currency: "PLN",
    category: "food",
    occurredOn: "2026-09-10",
    note: "kawa",
    ...overrides,
  };
}

describe("formatExpenseList", () => {
  it("formats empty list", () => {
    expect(formatExpenseList("Yesterday", [], 0)).toBe(
      "📋 Expenses: Yesterday\n\nno expenses",
    );
  });

  it("formats line items with original note", () => {
    const rows = [
      item({ id: 12, amountCents: 1250, note: "kawa" }),
      item({
        id: 13,
        amountCents: 4500,
        category: "groceries",
        note: "Lidl",
      }),
    ];

    expect(formatExpenseList("Yesterday", rows, 2)).toBe(
      [
        "📋 Expenses: Yesterday",
        "",
        "- #12 12.50 PLN food — kawa (2026-09-10)",
        "- #13 45.00 PLN groceries — Lidl (2026-09-10)",
        "",
        "2 expenses",
      ].join("\n"),
    );
  });

  it("shows truncation message when total exceeds shown rows", () => {
    const rows = [item({ id: 1 })];
    expect(formatExpenseList("This month", rows, 87)).toBe(
      [
        "📋 Expenses: This month",
        "",
        "- #1 12.50 PLN food — kawa (2026-09-10)",
        "",
        "Showing 1 of 87 expenses. Narrow the date range for the rest.",
      ].join("\n"),
    );
  });
});
