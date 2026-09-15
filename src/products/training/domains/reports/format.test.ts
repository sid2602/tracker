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
        occurredOn: "2026-09-14",
        exercise: "podciąganie",
        setIndex: 1,
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        kind: "strength",
        note: "",
        sourceTimestamp: 1,
        itemIndex: 0,
        sourceMessageKey: "m1",
        sourceAuthor: "+1",
      },
    ]);
    expect(message).toContain("podciąganie");
    expect(message).toContain("8 reps");
  });
});
