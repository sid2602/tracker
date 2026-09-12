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

  it("accepts valid schema with list", () => {
    const result = reportParamsSchema.parse({
      start_date: "2026-09-10",
      end_date: "2026-09-10",
      title: "Yesterday",
      group_by: "list",
    });

    expect(result.group_by).toBe("list");
  });

  it("rejects invalid dates, reversed ranges, and oversized titles", () => {
    expect(() =>
      reportParamsSchema.parse({
        start_date: "2026-02-30",
        end_date: "2026-03-01",
        title: "Invalid date",
        group_by: "total",
      }),
    ).toThrow();

    expect(() =>
      reportParamsSchema.parse({
        start_date: "2026-09-30",
        end_date: "2026-09-01",
        title: "Reversed",
        group_by: "total",
      }),
    ).toThrow();

    expect(() =>
      reportParamsSchema.parse({
        start_date: "2026-09-01",
        end_date: "2026-09-30",
        title: "x".repeat(201),
        group_by: "total",
      }),
    ).toThrow();
  });
});
