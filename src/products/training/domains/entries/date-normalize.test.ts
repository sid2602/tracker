import { describe, expect, it } from "vitest";
import {
  messageHasExplicitDateCue,
  normalizeTrainingLogDates,
} from "./date-normalize.js";
import type { TrainingLogResult } from "./schema.js";

const base: TrainingLogResult = {
  entries: [
    {
      exercise: "podciąganie",
      occurredOn: "2026-09-14",
      kind: "strength",
      reps: 9,
      weightGrams: null,
      durationSeconds: null,
      setIndex: null,
      setsCount: null,
      note: "",
    },
  ],
};

describe("normalizeTrainingLogDates", () => {
  it("forces reference date when message has no date cue", () => {
    const normalized = normalizeTrainingLogDates(
      base,
      "Podciaganie 9",
      "2026-09-15",
    );
    expect(normalized.entries[0]?.occurredOn).toBe("2026-09-15");
  });

  it("keeps LLM date when message mentions yesterday", () => {
    const normalized = normalizeTrainingLogDates(
      base,
      "wczoraj podciąganie 9",
      "2026-09-15",
    );
    expect(normalized.entries[0]?.occurredOn).toBe("2026-09-14");
  });

  it.each(["Podciaganie 9", "podciąganie 9 razy", "3x8 przysiad"])(
    "detects no date cue in %s",
    (text) => {
      expect(messageHasExplicitDateCue(text)).toBe(false);
    },
  );

  it.each(["wczoraj 9", "dziś podciąganie 8", "2026-09-10 squat 5"])(
    "detects date cue in %s",
    (text) => {
      expect(messageHasExplicitDateCue(text)).toBe(true);
    },
  );
});
