import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../../../test/fixtures.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import {
  insertTrainingEntries,
  listTrainingEntriesByDay,
} from "./repository.js";

describe("training entries repository", () => {
  let db: Kysely<AppDatabase>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("inserts entries and lists them by day in time order", async () => {
    await insertTrainingEntries(db, [
      {
        sourceMessageKey: "t-1",
        sourceAuthor: "+1",
        sourceTimestamp: 200,
        itemIndex: 0,
        occurredOn: "2026-09-14",
        exercise: "podciąganie",
        setIndex: 2,
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        kind: "strength",
        note: "",
        rawText: "podciąganie 8",
      },
      {
        sourceMessageKey: "t-0",
        sourceAuthor: "+1",
        sourceTimestamp: 100,
        itemIndex: 0,
        occurredOn: "2026-09-14",
        exercise: "podciąganie",
        setIndex: 1,
        reps: 8,
        weightGrams: null,
        durationSeconds: null,
        kind: "strength",
        note: "",
        rawText: "podciąganie 8",
      },
    ]);

    const rows = await listTrainingEntriesByDay(
      db,
      { start: "2026-09-14", end: "2026-09-14" },
      null,
    );
    expect(rows.map((row) => row.source_timestamp)).toEqual([100, 200]);
  });
});
