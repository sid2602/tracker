import { describe, expect, it } from "vitest";
import { routerLlmSchema } from "./schema.js";

describe("routing schema", () => {
  it("accepts a flat LLM object schema", () => {
    expect(
      routerLlmSchema.parse({
        intent: "expenses.create",
      }),
    ).toEqual({
      intent: "expenses.create",
    });

    expect(
      routerLlmSchema.parse({
        intent: "expenses.report",
      }),
    ).toEqual({
      intent: "expenses.report",
    });

    expect(
      routerLlmSchema.parse({
        intent: "expenses.category",
      }),
    ).toEqual({
      intent: "expenses.category",
    });
  });

  it("rejects unknown router intent", () => {
    expect(() =>
      routerLlmSchema.parse({
        intent: "unknown",
      }),
    ).toThrow();
  });

});
