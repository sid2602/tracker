import { describe, expect, it } from "vitest";
import { buildProductRegistry } from "./registry.js";
import { expensesProduct } from "./expenses/index.js";
import type { ProductModule } from "./types.js";

describe("buildProductRegistry", () => {
  it("registers the expenses product without duplicates", () => {
    const registry = buildProductRegistry([expensesProduct]);
    expect(registry.products.map((product) => product.id)).toEqual([
      "expenses",
    ]);
    expect(registry.routingCards.map((card) => card.intent)).toEqual([
      "expenses.category",
      "expenses.modification",
      "expenses.report",
      "expenses.create",
    ]);
  });

  it("rejects duplicate product ids", () => {
    expect(() =>
      buildProductRegistry([expensesProduct, expensesProduct]),
    ).toThrow(/Duplicate product id/);
  });

  it("rejects duplicate canonical intents across products", () => {
    const clone: ProductModule = {
      ...expensesProduct,
      id: "expenses-clone",
    };
    expect(() => buildProductRegistry([expensesProduct, clone])).toThrow(
      /Duplicate canonical intent/,
    );
  });

  it("rejects duplicate handler-map keys even without a duplicate routing card", () => {
    const clone: ProductModule = {
      id: "shadow",
      routingCards: [],
      analyzeByIntent: {
        "expenses.create": async () => ({ items: [] }),
      },
      persistByIntent: {},
      handleByIntent: {},
    };
    expect(() => buildProductRegistry([expensesProduct, clone])).toThrow(
      /Duplicate analyze handler/,
    );
  });
});
