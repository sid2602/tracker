import { describe, expect, it } from "vitest";
import { reportParamsSchema } from "./schema.js";

describe("reports schema", () => {
  it("rejects invalid group_by", () => {
    expect(() =>
      reportParamsSchema.parse({
        start_date: "2026-09-01",
        end_date: "2026-09-30",
        title: "Test report",
        group_by: "invalid_group",
      }),
    ).toThrow();
  });

  it("accepts valid schema with total", () => {
    const result = reportParamsSchema.parse({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "Test report",
      group_by: "total",
    });

    expect(result.group_by).toBe("total");
    expect(result.categories).toBeUndefined();
  });

  it("accepts valid schema with category and categories filter", () => {
    const result = reportParamsSchema.parse({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "Test report",
      group_by: "category",
      categories: ["food", "fuel"],
    });

    expect(result.group_by).toBe("category");
    expect(result.categories).toEqual(["food", "fuel"]);
  });
});
