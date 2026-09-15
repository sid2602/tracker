import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import {
  TRAINING_ENTRY_SELECT,
  toTrainingEntryView,
  type TrainingEntryRow,
  type TrainingEntryView,
} from "../entries/repository.js";

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

/**
 * Resolve a set correction against the latest cluster only.
 * Fail-closed when the set is missing or ambiguous within that cluster.
 */
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

export function toModificationEntryView(
  row: TrainingEntryRow,
): TrainingEntryView {
  return toTrainingEntryView(row);
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
