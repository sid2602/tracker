import type { TrainingEntryRow } from "../entries/repository.js";

export function formatTrainingList(
  title: string,
  entries: readonly TrainingEntryRow[],
): string {
  if (entries.length === 0) {
    return `🏋️ Training: ${title}\n\nno training entries`;
  }

  const lines = entries.map((entry) => formatTrainingLine(entry));
  return `🏋️ Training: ${title}\n\n${lines.join("\n")}`;
}

function formatTrainingLine(entry: TrainingEntryRow): string {
  const parts = [`#${entry.id}`, entry.exercise];
  if (entry.set_index !== null) {
    parts.push(`set ${entry.set_index}`);
  }
  if (entry.reps !== null) {
    parts.push(`${entry.reps} reps`);
  }
  if (entry.weight_grams !== null) {
    parts.push(`${(entry.weight_grams / 1000).toFixed(1)} kg`);
  }
  if (entry.duration_seconds !== null) {
    parts.push(`${entry.duration_seconds}s`);
  }
  if (entry.kind !== null) {
    parts.push(`(${entry.kind})`);
  }
  if (entry.note.length > 0) {
    parts.push(`— ${entry.note}`);
  }
  return parts.join(" ");
}
