import { describe, expect, it } from "vitest";
import { routerLlmSchema, toRouterResult } from "./schema.js";

describe("routing schema", () => {
  it("accepts a flat LLM object schema", () => {
    expect(
      routerLlmSchema.parse({
        intent: "expense",
        period: null,
        group_by: null,
      }),
    ).toEqual({
      intent: "expense",
      period: null,
      group_by: null,
    });

    expect(
      routerLlmSchema.parse({
        intent: "report",
        period: "this_month",
        group_by: "category",
      }),
    ).toEqual({
      intent: "report",
      period: "this_month",
      group_by: "category",
    });
  });

  it("rejects unknown router intent", () => {
    expect(() =>
      routerLlmSchema.parse({
        intent: "unknown",
        period: null,
        group_by: null,
      }),
    ).toThrow();
  });

  it("normalizes LLM output into RouterResult", () => {
    expect(
      toRouterResult({
        intent: "expense",
        period: null,
        group_by: null,
      }),
    ).toEqual({ intent: "expense" });

    expect(
      toRouterResult({
        intent: "report",
        period: "last_month",
        group_by: "total",
      }),
    ).toEqual({
      intent: "report",
      period: "last_month",
      group_by: "total",
    });
  });

  it("rejects report without period or group_by", () => {
    expect(() =>
      toRouterResult({
        intent: "report",
        period: null,
        group_by: "total",
      }),
    ).toThrow();
  });
});
