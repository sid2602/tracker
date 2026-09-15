import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import {
  TRAINING_ENTRY_SELECT,
  toTrainingEntryView,
  type TrainingEntryView,
} from "../entries/repository.js";

export async function listTrainingEntriesByDay(
  db: QueryCreator<AppDatabase>,
  range: { start: string; end: string },
  exercise: string | null,
): Promise<TrainingEntryView[]> {
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

  const rows = await query.execute();
  return rows.map(toTrainingEntryView);
}
