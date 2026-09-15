import { describe, expect, it } from "vitest";
import { expandTrainingEntries } from "./handler.js";
import type { MessageContext } from "../../../../worker/types.js";
import type { TrainingLogResult } from "./schema.js";

const context: MessageContext = {
  messageKey: "msg-1",
  sourceAuthor: "+48000000000",
  sourceTimestamp: 100,
  rawText: "przysiad 3x8",
};

describe("expandTrainingEntries", () => {
  it("expands NxR prescriptions into N set rows", () => {
    const parsed: TrainingLogResult = {
      entries: [
        {
          exercise: "przysiad",
          occurredOn: "2026-09-14",
          kind: "strength",
          reps: 8,
          weightGrams: 80000,
          durationSeconds: null,
          setIndex: null,
          setsCount: 3,
          note: "",
        },
      ],
    };

    const rows = expandTrainingEntries(parsed, context);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.setIndex)).toEqual([1, 2, 3]);
    expect(rows.every((row) => row.reps === 8)).toBe(true);
    expect(rows.map((row) => row.itemIndex)).toEqual([0, 1, 2]);
  });

  it("keeps a single completed set as one row", () => {
    const parsed: TrainingLogResult = {
      entries: [
        {
          exercise: "podciąganie",
          occurredOn: "2026-09-14",
          kind: "strength",
          reps: 8,
          weightGrams: null,
          durationSeconds: null,
          setIndex: 1,
          setsCount: null,
          note: "",
        },
      ],
    };

    const rows = expandTrainingEntries(parsed, {
      ...context,
      rawText: "podciąganie 8",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.setIndex).toBe(1);
    expect(rows[0]?.reps).toBe(8);
  });
});
