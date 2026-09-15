import { describe, expect, it } from "vitest";
import { buildProductRegistry } from "./registry.js";
import { expensesProduct } from "./expenses/index.js";
import { trainingProduct } from "./training/index.js";
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

  it("registers expenses and training together", () => {
    const registry = buildProductRegistry([expensesProduct, trainingProduct]);
    expect(registry.products.map((product) => product.id)).toEqual([
      "expenses",
      "training",
    ]);
    expect(registry.routingCards.map((card) => card.intent)).toEqual([
      "expenses.category",
      "expenses.modification",
      "expenses.report",
      "expenses.create",
      "training.modification",
      "training.report",
      "training.log",
    ]);
    expect(registry.handleByIntent.has("training.log")).toBe(true);
    expect(registry.handleByIntent.has("training.report")).toBe(true);
    expect(registry.handleByIntent.has("training.modification")).toBe(true);
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
