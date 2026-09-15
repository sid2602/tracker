export type TrainingEntryFormatFields = {
  id?: number;
  exercise: string;
  setIndex: number | null;
  reps: number | null;
  weightGrams: number | null;
  durationSeconds: number | null;
  kind?: string | null;
  note?: string;
};

export function formatTrainingEntryFields(
  fields: TrainingEntryFormatFields,
  options: { includeId?: boolean; includeKind?: boolean; includeNote?: boolean } = {},
): string {
  const parts: string[] = [];
  if (options.includeId === true && fields.id !== undefined) {
    parts.push(`#${fields.id}`);
  }
  parts.push(fields.exercise);
  if (fields.setIndex !== null) {
    parts.push(`set ${fields.setIndex}`);
  }
  if (fields.reps !== null) {
    parts.push(`${fields.reps} reps`);
  }
  if (fields.weightGrams !== null) {
    parts.push(`${(fields.weightGrams / 1000).toFixed(1)} kg`);
  }
  if (fields.durationSeconds !== null) {
    parts.push(`${fields.durationSeconds}s`);
  }
  if (options.includeKind === true && fields.kind !== null && fields.kind !== undefined) {
    parts.push(`(${fields.kind})`);
  }
  if (
    options.includeNote === true &&
    fields.note !== undefined &&
    fields.note.length > 0
  ) {
    parts.push(`— ${fields.note}`);
  }
  return parts.join(" ");
}
