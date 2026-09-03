import { describe, expect, it } from "vitest";
import { routerLlmSchema, toRouterResult } from "./schema.js";

describe("routing schema", () => {
  it("accepts a flat LLM object schema", () => {
    expect(
      routerLlmSchema.parse({
        intent: "expense",
      }),
    ).toEqual({
      intent: "expense",
    });

    expect(
      routerLlmSchema.parse({
        intent: "report",
      }),
    ).toEqual({
      intent: "report",
    });
  });

  it("rejects unknown router intent", () => {
    expect(() =>
      routerLlmSchema.parse({
        intent: "unknown",
      }),
    ).toThrow();
  });

  it("normalizes LLM output into RouterResult", () => {
    expect(
      toRouterResult({
        intent: "expense",
      }),
    ).toEqual({ intent: "expense" });

    expect(
      toRouterResult({
        intent: "report",
      }),
    ).toEqual({
      intent: "report",
    });
  });
});
