import { describe, expect, it } from "vitest";
import { getReferenceDate } from "./dates.js";
import { withRetry } from "./retry.js";

describe("lib", () => {
  it("returns reference date in Europe/Warsaw", () => {
    const date = getReferenceDate(
      "Europe/Warsaw",
      new Date("2026-09-01T10:00:00.000Z"),
    );

    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("withRetry succeeds on second attempt", async () => {
    let calls = 0;

    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("first attempt failed");
      }

      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
