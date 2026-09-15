import { describe, expect, it } from "vitest";
import { getRouterPrompt } from "./prompt.js";
import {
  MAX_ROUTING_CARD_EXAMPLES,
} from "./routing-types.js";
import { ROUTING_CARDS } from "./registry.js";

describe("routing registry", () => {
  it("contains every actionable intent exactly once in priority order", () => {
    expect(ROUTING_CARDS.map((card) => card.intent)).toEqual([
      "expenses.category",
      "expenses.modification",
      "expenses.report",
      "expenses.create",
      "training.modification",
      "training.report",
      "training.log",
    ]);

    expect(new Set(ROUTING_CARDS.map((card) => card.intent)).size).toBe(
      ROUTING_CARDS.length,
    );
  });

  it("contains complete, size-bounded routing cards", () => {
    for (const card of ROUTING_CARDS) {
      expect(card.object.length).toBeGreaterThan(0);
      expect(card.goal.length).toBeGreaterThan(0);
      expect(card.localRules.length).toBeGreaterThan(0);
      expect(card.examples.length).toBeGreaterThan(0);
      expect(card.examples.length).toBeLessThanOrEqual(
        MAX_ROUTING_CARD_EXAMPLES,
      );
      expect(() => getRouterPrompt("test", [card])).not.toThrow();
    }

    expect(() => getRouterPrompt("test", ROUTING_CARDS)).not.toThrow();
  });
});
