import { describe, expect, it } from "vitest";
import { resolveCorrectableSetEntry } from "./repository.js";
import type { TrainingEntryRow } from "../entries/repository.js";

function entry(
  overrides: Partial<TrainingEntryRow> &
    Pick<TrainingEntryRow, "id" | "set_index">,
): TrainingEntryRow {
  return {
    occurred_on: "2026-09-15",
    exercise: "podciąganie",
    reps: 8,
    weight_grams: null,
    duration_seconds: null,
    kind: "strength",
    note: "",
    source_timestamp: 100,
    item_index: 0,
    source_message_key: "msg",
    source_author: "+1",
    ...overrides,
  };
}

describe("resolveCorrectableSetEntry", () => {
  const cluster = [
    entry({ id: 1, set_index: 1, item_index: 0 }),
    entry({ id: 2, set_index: 2, item_index: 1 }),
    entry({ id: 3, set_index: 3, item_index: 2 }),
  ];

  it("resolves a numbered set inside the latest cluster", () => {
    expect(resolveCorrectableSetEntry(cluster, 3)?.id).toBe(3);
  });

  it("resolves the last set when setIndex is null", () => {
    expect(resolveCorrectableSetEntry(cluster, null)?.id).toBe(3);
  });

  it("does not fall back to an older workout outside the latest cluster", () => {
    const entries = [
      entry({
        id: 1,
        set_index: 3,
        item_index: 0,
        source_message_key: "older",
        source_timestamp: 50,
      }),
      entry({
        id: 2,
        set_index: 1,
        item_index: 0,
        source_message_key: "newer",
        source_timestamp: 100,
      }),
      entry({
        id: 3,
        set_index: 2,
        item_index: 1,
        source_message_key: "newer",
        source_timestamp: 100,
      }),
    ];
    expect(resolveCorrectableSetEntry(entries, 3)).toBeUndefined();
  });

  it("fail-closes when the latest message has ambiguous same set indexes", () => {
    const entries = [
      entry({
        id: 1,
        set_index: 1,
        item_index: 0,
        exercise: "przysiad",
        source_message_key: "mixed",
      }),
      entry({
        id: 2,
        set_index: 1,
        item_index: 1,
        exercise: "podciąganie",
        source_message_key: "mixed",
      }),
    ];
    expect(resolveCorrectableSetEntry(entries, 1)).toBeUndefined();
  });
});
