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

/** Raw Kysely row shape for `training_entries`. */
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
  source_message_key: string | null;
  source_author: string;
};

/** Domain-facing camelCase view of a training entry. */
export type TrainingEntryView = {
  id: number;
  occurredOn: string;
  exercise: string;
  setIndex: number | null;
  reps: number | null;
  weightGrams: number | null;
  durationSeconds: number | null;
  kind: string | null;
  note: string;
  sourceTimestamp: number;
  itemIndex: number;
  sourceMessageKey: string | null;
  sourceAuthor: string;
};

export const TRAINING_ENTRY_SELECT = [
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
  "source_message_key",
  "source_author",
] as const;

export function toTrainingEntryView(row: TrainingEntryRow): TrainingEntryView {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    exercise: row.exercise,
    setIndex: row.set_index,
    reps: row.reps,
    weightGrams: row.weight_grams,
    durationSeconds: row.duration_seconds,
    kind: row.kind,
    note: row.note,
    sourceTimestamp: row.source_timestamp,
    itemIndex: row.item_index,
    sourceMessageKey: row.source_message_key,
    sourceAuthor: row.source_author,
  };
}

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
