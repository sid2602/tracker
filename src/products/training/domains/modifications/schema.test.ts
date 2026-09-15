import { describe, expect, it } from "vitest";
import { tryParseDeterministicSetCorrection } from "./deterministic.js";
import { trainingModificationResultSchema } from "./schema.js";

describe("tryParseDeterministicSetCorrection", () => {
  it("parses a numbered set correction", () => {
    expect(tryParseDeterministicSetCorrection("3 seria 7")).toEqual({
      action: "correct_set",
      target: "set",
      setIndex: 3,
      id: null,
      updatePayload: {
        reps: 7,
        weightGrams: null,
        durationSeconds: null,
      },
    });
  });

  it("parses a last-set correction", () => {
    expect(tryParseDeterministicSetCorrection("ostatnia 7")).toMatchObject({
      action: "correct_set",
      setIndex: null,
      updatePayload: { reps: 7 },
    });
  });

  it("returns null for ordinary logs", () => {
    expect(tryParseDeterministicSetCorrection("podciąganie 8")).toBeNull();
    expect(tryParseDeterministicSetCorrection("przysiad 3x8")).toBeNull();
  });
});

describe("trainingModificationResultSchema", () => {
  it("accepts a delete last action", () => {
    expect(
      trainingModificationResultSchema.parse({
        action: "delete",
        target: "last",
        setIndex: null,
        id: null,
        updatePayload: null,
      }),
    ).toMatchObject({ action: "delete", target: "last" });
  });

  it("rejects update without payload", () => {
    expect(() =>
      trainingModificationResultSchema.parse({
        action: "update",
        target: "last",
        setIndex: null,
        id: null,
        updatePayload: null,
      }),
    ).toThrow();
  });
});
