import { describe, expect, it } from "vitest";
import { getPeriodRange } from "./periods.js";

describe("getPeriodRange", () => {
  it("returns this month bounds in Europe/Warsaw", () => {
    const range = getPeriodRange(
      "this_month",
      new Date("2026-09-15T12:00:00.000Z"),
    );

    expect(range).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("returns last month bounds in Europe/Warsaw", () => {
    const range = getPeriodRange(
      "last_month",
      new Date("2026-09-15T12:00:00.000Z"),
    );

    expect(range).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("rolls last month back across the year boundary", () => {
    const range = getPeriodRange(
      "last_month",
      new Date("2026-01-10T12:00:00.000Z"),
    );

    expect(range).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("uses Warsaw date near UTC month boundary", () => {
    const range = getPeriodRange(
      "this_month",
      new Date("2026-08-31T22:30:00.000Z"),
    );

    expect(range).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });
});
