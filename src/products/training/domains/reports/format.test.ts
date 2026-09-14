import { describe, expect, it } from "vitest";
import { formatTrainingList } from "./format.js";

describe("formatTrainingList", () => {
  it("formats an empty day", () => {
    expect(formatTrainingList("Today", [])).toContain("no training entries");
  });

  it("formats entries with set details", () => {
    const message = formatTrainingList("Today", [
      {
        id: 1,
        occurred_on: "2026-09-14",
        exercise: "podciąganie",
        set_index: 1,
        reps: 8,
        weight_grams: null,
        duration_seconds: null,
        kind: "strength",
        note: "",
        source_timestamp: 1,
        item_index: 0,
      },
    ]);
    expect(message).toContain("podciąganie");
    expect(message).toContain("8 reps");
  });
});
