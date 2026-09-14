import { z } from "zod";
import { isValidCalendarDate } from "../../../../lib/dates.js";

export const MAX_TRAINING_ENTRIES = 20;
export const MAX_TRAINING_EXERCISE_LENGTH = 100;
export const MAX_TRAINING_NOTE_LENGTH = 500;
export const MAX_TRAINING_SETS_COUNT = 20;

export const trainingKindSchema = z.enum([
  "strength",
  "emom",
  "cardio",
  "other",
]);

export type TrainingKind = z.infer<typeof trainingKindSchema>;

const occurredOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

export const trainingLogEntrySchema = z
  .object({
    exercise: z.string().trim().min(1).max(MAX_TRAINING_EXERCISE_LENGTH),
    occurredOn: occurredOnSchema,
    kind: trainingKindSchema.nullable(),
    reps: z.number().int().positive().safe().nullable(),
    weightGrams: z.number().int().nonnegative().safe().nullable(),
    durationSeconds: z.number().int().positive().safe().nullable(),
    setIndex: z.number().int().positive().safe().nullable(),
    setsCount: z
      .number()
      .int()
      .positive()
      .max(MAX_TRAINING_SETS_COUNT)
      .nullable(),
    note: z.string().max(MAX_TRAINING_NOTE_LENGTH),
  })
  .superRefine((value, ctx) => {
    if (
      value.reps === null &&
      value.weightGrams === null &&
      value.durationSeconds === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Training entry must include reps, weightGrams, or durationSeconds",
      });
    }
  });

export const trainingLogResultSchema = z.object({
  entries: z
    .array(trainingLogEntrySchema)
    .min(1)
    .max(MAX_TRAINING_ENTRIES),
});

export type TrainingLogEntry = z.infer<typeof trainingLogEntrySchema>;
export type TrainingLogResult = z.infer<typeof trainingLogResultSchema>;
