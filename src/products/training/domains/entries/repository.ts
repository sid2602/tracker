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
  source_message_key: string | null;
  source_author: string;
};

const TRAINING_ENTRY_SELECT = [
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
    .select([...TRAINING_ENTRY_SELECT])
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

export async function listTrainingEntriesForAuthorOnDay(
  db: QueryCreator<AppDatabase>,
  sourceAuthor: string,
  occurredOn: string,
): Promise<TrainingEntryRow[]> {
  return db
    .selectFrom("training_entries")
    .select([...TRAINING_ENTRY_SELECT])
    .where("source_author", "=", sourceAuthor)
    .where("occurred_on", "=", occurredOn)
    .orderBy("source_timestamp", "asc")
    .orderBy("item_index", "asc")
    .execute();
}

export async function getTrainingEntryById(
  db: QueryCreator<AppDatabase>,
  sourceAuthor: string,
  id: number,
): Promise<TrainingEntryRow | undefined> {
  return db
    .selectFrom("training_entries")
    .select([...TRAINING_ENTRY_SELECT])
    .where("source_author", "=", sourceAuthor)
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function getLastTrainingEntry(
  db: QueryCreator<AppDatabase>,
  sourceAuthor: string,
): Promise<TrainingEntryRow | undefined> {
  return db
    .selectFrom("training_entries")
    .select([...TRAINING_ENTRY_SELECT])
    .where("source_author", "=", sourceAuthor)
    .orderBy("source_timestamp", "desc")
    .orderBy("item_index", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();
}

export async function updateTrainingEntryFields(
  db: QueryCreator<AppDatabase>,
  sourceAuthor: string,
  id: number,
  fields: {
    reps: number | null;
    weightGrams: number | null;
    durationSeconds: number | null;
  },
): Promise<boolean> {
  const patch: {
    reps?: number;
    weight_grams?: number;
    duration_seconds?: number;
  } = {};

  if (fields.reps !== null) {
    patch.reps = fields.reps;
  }
  if (fields.weightGrams !== null) {
    patch.weight_grams = fields.weightGrams;
  }
  if (fields.durationSeconds !== null) {
    patch.duration_seconds = fields.durationSeconds;
  }

  if (Object.keys(patch).length === 0) {
    return false;
  }

  const result = await db
    .updateTable("training_entries")
    .set(patch)
    .where("source_author", "=", sourceAuthor)
    .where("id", "=", id)
    .execute();

  return Number(result[0]?.numUpdatedRows ?? 0) > 0;
}

export async function deleteTrainingEntry(
  db: QueryCreator<AppDatabase>,
  sourceAuthor: string,
  id: number,
): Promise<boolean> {
  const result = await db
    .deleteFrom("training_entries")
    .where("source_author", "=", sourceAuthor)
    .where("id", "=", id)
    .execute();

  return Number(result[0]?.numDeletedRows ?? 0) > 0;
}

export function resolveCorrectableSetEntry(
  entries: readonly TrainingEntryRow[],
  setIndex: number | null,
): TrainingEntryRow | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const latest = entries[entries.length - 1];
  if (latest === undefined) {
    return undefined;
  }

  const cluster = selectLatestCorrectionCluster(entries, latest);
  if (cluster.length === 0) {
    return undefined;
  }

  if (setIndex === null) {
    return resolveLastSetInCluster(cluster, latest);
  }

  const matches = cluster.filter((entry) => entry.set_index === setIndex);
  if (matches.length !== 1) {
    return undefined;
  }
  return matches[0];
}

function selectLatestCorrectionCluster(
  entries: readonly TrainingEntryRow[],
  latest: TrainingEntryRow,
): TrainingEntryRow[] {
  const latestKey = latest.source_message_key;
  if (latestKey !== null) {
    return entries.filter((entry) => entry.source_message_key === latestKey);
  }
  return entries.filter((entry) => entry.exercise === latest.exercise);
}

function resolveLastSetInCluster(
  cluster: readonly TrainingEntryRow[],
  latest: TrainingEntryRow,
): TrainingEntryRow | undefined {
  const withSetIndex = cluster.filter((entry) => entry.set_index !== null);
  if (withSetIndex.length === 0) {
    return latest;
  }

  const maxSetIndex = Math.max(
    ...withSetIndex.map((entry) => entry.set_index ?? 0),
  );
  const matches = withSetIndex.filter(
    (entry) => entry.set_index === maxSetIndex,
  );
  if (matches.length !== 1) {
    return undefined;
  }
  return matches[0];
}
