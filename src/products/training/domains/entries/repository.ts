import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";

export type TrainingEntryInput = {
  sourceMessageKey: string;
  sourceAuthor: string;
  sourceTimestamp: number;
  itemIndex: number;
  occurredOn: string;
  exercise: string;
  setIndex: number | null;
  reps: number | null;
  weightGrams: number | null;
  durationSeconds: number | null;
  kind: string | null;
  note: string;
  rawText: string;
};

export type TrainingEntryRow = {
  id: number;
  occurred_on: string;
  exercise: string;
  set_index: number | null;
  reps: number | null;
  weight_grams: number | null;
  duration_seconds: number | null;
  kind: string | null;
  note: string;
  source_timestamp: number;
  item_index: number;
};

export async function insertTrainingEntries(
  db: QueryCreator<AppDatabase>,
  entries: TrainingEntryInput[],
): Promise<{ inserted: number }> {
  if (entries.length === 0) {
    return { inserted: 0 };
  }

  const createdAt = new Date().toISOString();
  const values = entries.map((entry) => ({
    source_message_key: entry.sourceMessageKey,
    source_author: entry.sourceAuthor,
    source_timestamp: entry.sourceTimestamp,
    item_index: entry.itemIndex,
    occurred_on: entry.occurredOn,
    exercise: entry.exercise,
    set_index: entry.setIndex,
    reps: entry.reps,
    weight_grams: entry.weightGrams,
    duration_seconds: entry.durationSeconds,
    kind: entry.kind,
    note: entry.note,
    raw_text: entry.rawText,
    created_at: createdAt,
  }));

  const result = await db
    .insertInto("training_entries")
    .values(values)
    .onConflict((oc) => oc.doNothing())
    .execute();

  return { inserted: Number(result[0]?.numInsertedOrUpdatedRows ?? 0) };
}

export async function listTrainingEntriesByDay(
  db: QueryCreator<AppDatabase>,
  range: { start: string; end: string },
  exercise: string | null,
): Promise<TrainingEntryRow[]> {
  let query = db
    .selectFrom("training_entries")
    .select([
      "id",
      "occurred_on",
      "exercise",
      "set_index",
      "reps",
      "weight_grams",
      "duration_seconds",
      "kind",
      "note",
      "source_timestamp",
      "item_index",
    ])
    .where("occurred_on", ">=", range.start)
    .where("occurred_on", "<=", range.end)
    .orderBy("occurred_on", "asc")
    .orderBy("source_timestamp", "asc")
    .orderBy("item_index", "asc");

  if (exercise !== null) {
    query = query.where("exercise", "=", exercise);
  }

  return query.execute();
}
