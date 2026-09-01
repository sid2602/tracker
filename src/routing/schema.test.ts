import { describe, expect, it } from "vitest";
import { routerResultSchema } from "./schema.js";

describe("routing schema", () => {
  it("accepts valid router intents", () => {
    expect(routerResultSchema.parse({ intent: "expense" })).toEqual({
      intent: "expense",
    });
    expect(
      routerResultSchema.parse({
        intent: "report",
        period: "this_month",
        group_by: "category",
      }),
    ).toEqual({
      intent: "report",
      period: "this_month",
      group_by: "category",
    });
    expect(routerResultSchema.parse({ intent: "ignore" })).toEqual({
      intent: "ignore",
    });
  });

  it("rejects unknown router intent", () => {
    expect(() => routerResultSchema.parse({ intent: "unknown" })).toThrow();
  });
});
