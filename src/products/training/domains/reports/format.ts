import type { TrainingEntryView } from "../entries/repository.js";
import { formatTrainingEntryFields } from "../shared/format-entry.js";

export function formatTrainingList(
  title: string,
  entries: readonly TrainingEntryView[],
): string {
  if (entries.length === 0) {
    return `🏋️ Training: ${title}\n\nno training entries`;
  }

  const lines = entries.map((entry) =>
    formatTrainingEntryFields(
      {
        id: entry.id,
        exercise: entry.exercise,
        setIndex: entry.setIndex,
        reps: entry.reps,
        weightGrams: entry.weightGrams,
        durationSeconds: entry.durationSeconds,
        kind: entry.kind,
        note: entry.note,
      },
      { includeId: true, includeKind: true, includeNote: true },
    ),
  );
  return `🏋️ Training: ${title}\n\n${lines.join("\n")}`;
}
