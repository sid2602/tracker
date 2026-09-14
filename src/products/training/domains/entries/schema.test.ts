import { describe, expect, it } from "vitest";
import { trainingLogEntrySchema, trainingLogResultSchema } from "./schema.js";

describe("trainingLogEntrySchema", () => {
  it("accepts a strength set with reps", () => {
    expect(
      trainingLogEntrySchema.parse({
        exercise: "podciąganie",
        occurredOn: "2026-09-14",
        kind: "strength",
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        setIndex: 1,
        setsCount: null,
        note: "",
      }),
    ).toMatchObject({ reps: 8, setsCount: null });
  });

  it("rejects entries without measurable fields", () => {
    expect(() =>
      trainingLogEntrySchema.parse({
        exercise: "podciąganie",
        occurredOn: "2026-09-14",
        kind: "strength",
        reps: null,
        weightGrams: null,
        durationSeconds: null,
        setIndex: null,
        setsCount: null,
        note: "",
      }),
    ).toThrow();
  });

  it("accepts an NxR prescription shape", () => {
    const parsed = trainingLogResultSchema.parse({
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
    });
    expect(parsed.entries[0]?.setsCount).toBe(3);
  });
});
