import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { parseExpenses } from "./parser.js";
import type { ExpenseItem } from "./schema.js";

const MOCK_CATEGORIES = [
  { name: "food", description: "groceries, food, dining" },
  { name: "transport", description: "gas, tickets, mechanics" },
  { name: "bills", description: "electricity, rent, internet" },
  { name: "entertainment", description: "cinema, netflix, games" },
  { name: "other", description: "fallback for anything else" },
];

const REFERENCE_DATE = "2026-09-04";

// Helper to partially match items
function expectItemsToMatch(
  actual: ExpenseItem[],
  expected: Partial<ExpenseItem>[],
) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toMatchObject(expected[i]);
  }
}

describe.runIf(process.env.RUN_EVALS === "true")("LLM Expense Parser Evals", () => {
  let config: ReturnType<typeof loadConfig>;

  try {
    config = loadConfig();
  } catch (error) {
    if (process.env.RUN_EVALS === "true") {
      console.error(
        "Could not load config for evals. Ensure .env has valid API keys (e.g., AI_GATEWAY_API_KEY).",
      );
      throw error;
    }
  }

  it("parses standard expense in English (coffee and cake)", async () => {
    const result = await parseExpenses(
      config,
      "coffee and cake 25",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    expectItemsToMatch(result.items, [
      {
        amountCents: 2500,
        category: "food",
        occurredOn: "2026-09-04",
      },
    ]);
  }, 15000);

  it("parses decimals and relative dates in English (gas yesterday)", async () => {
    const result = await parseExpenses(
      config,
      "gas yesterday 150.50 pln",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    expectItemsToMatch(result.items, [
      {
        amountCents: 15050,
        category: "transport",
        occurredOn: "2026-09-03", // yesterday
        currency: "PLN",
      },
    ]);
  }, 15000);

  it("parses multi-items in English (movie 30 and popcorn 15)", async () => {
    const result = await parseExpenses(
      config,
      "movie 30 and popcorn 15",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    
    // Sort items by amount to ensure stable checking
    const sorted = [...result.items].sort((a, b) => b.amountCents - a.amountCents);
    
    expectItemsToMatch(sorted, [
      {
        amountCents: 3000,
        category: "entertainment",
        occurredOn: "2026-09-04",
      },
      {
        amountCents: 1500,
        category: "entertainment",
        occurredOn: "2026-09-04",
      },
    ]);
  }, 15000);

  it("parses multi-item with distinct categories (fuel 30zl, groceries 50zl)", async () => {
    const result = await parseExpenses(
      config,
      "fuel 30zl, groceries 50zl",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    
    const sorted = [...result.items].sort((a, b) => b.amountCents - a.amountCents);

    expectItemsToMatch(sorted, [
      {
        amountCents: 5000,
        category: "food",
        occurredOn: "2026-09-04",
      },
      {
        amountCents: 3000,
        category: "transport",
        occurredOn: "2026-09-04",
      },
    ]);
  }, 15000);

  it("parses complex splits with subtraction in English (groceries 200 including 50 for alcohol)", async () => {
    const result = await parseExpenses(
      config,
      "groceries 200, including 50 for alcohol",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    
    const sorted = [...result.items].sort((a, b) => b.amountCents - a.amountCents);

    expectItemsToMatch(sorted, [
      {
        amountCents: 15000, // 200 - 50 = 150
        category: "food",
        occurredOn: "2026-09-04",
      },
      {
        amountCents: 5000, // 50
        occurredOn: "2026-09-04",
      },
    ]);
  }, 15000);

  it("resolves absolute dates in English (January 10 electricity bill)", async () => {
    const result = await parseExpenses(
      config,
      "January 10 electricity bill 300",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    expectItemsToMatch(result.items, [
      {
        amountCents: 30000,
        category: "bills",
        occurredOn: "2026-01-10",
      },
    ]);
  }, 15000);

  it("parses foreign currency in English (dinner 15 EUR)", async () => {
    const result = await parseExpenses(
      config,
      "dinner 15 EUR",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    expectItemsToMatch(result.items, [
      {
        amountCents: 1500,
        category: "food",
        currency: "EUR",
      },
    ]);
  }, 15000);

  // --- POLISH TEST CASES ---

  it("parses standard expense in Polish (kawa i ciastko)", async () => {
    const result = await parseExpenses(
      config,
      "kawa i ciastko 25 zł",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    expectItemsToMatch(result.items, [
      {
        amountCents: 2500,
        category: "food",
        occurredOn: "2026-09-04",
      },
    ]);
  }, 15000);

  it("parses decimals and relative dates in Polish (wczoraj paliwo)", async () => {
    const result = await parseExpenses(
      config,
      "wczoraj paliwo za 150.50 pln",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    expectItemsToMatch(result.items, [
      {
        amountCents: 15050,
        category: "transport",
        occurredOn: "2026-09-03",
      },
    ]);
  }, 15000);

  it("parses complex splits with subtraction in Polish (Biedronka 200 w tym 50 alkohol)", async () => {
    const result = await parseExpenses(
      config,
      "Biedronka 200, w tym 50 na alkohol",
      REFERENCE_DATE,
      MOCK_CATEGORIES,
    );
    
    const sorted = [...result.items].sort((a, b) => b.amountCents - a.amountCents);

    expectItemsToMatch(sorted, [
      {
        amountCents: 15000,
        category: "food",
        occurredOn: "2026-09-04",
      },
      {
        amountCents: 5000,
        occurredOn: "2026-09-04",
      },
    ]);
  }, 15000);
});
