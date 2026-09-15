import { z } from "zod";

export const trainingModificationUpdatePayloadSchema = z.object({
  reps: z.number().int().positive().safe().nullable(),
  weightGrams: z.number().int().nonnegative().safe().nullable(),
  durationSeconds: z.number().int().positive().safe().nullable(),
});

export const trainingModificationResultSchema = z
  .object({
    action: z.enum(["correct_set", "update", "delete"]),
    target: z.enum(["last", "id", "set"]),
    setIndex: z.number().int().positive().safe().nullable(),
    id: z.number().int().positive().safe().nullable(),
    updatePayload: trainingModificationUpdatePayloadSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "correct_set") {
      if (value.target !== "set") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target"],
          message: "correct_set requires target set",
        });
      }
      if (value.id !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["id"],
          message: "correct_set cannot include an id",
        });
      }
      if (!hasMeasurableUpdate(value.updatePayload)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["updatePayload"],
          message: "correct_set requires reps, weightGrams, or durationSeconds",
        });
      }
      return;
    }

    if (value.setIndex !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["setIndex"],
        message: "setIndex is only valid for correct_set",
      });
    }

    if (value.target === "set") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: "update/delete cannot use target set",
      });
    }

    if (value.target === "id" && value.id === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "id target requires a positive id",
      });
    }

    if (value.target === "last" && value.id !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "last target cannot include an id",
      });
    }

    if (value.action === "update" && !hasMeasurableUpdate(value.updatePayload)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["updatePayload"],
        message: "update requires at least one field to change",
      });
    }

    if (value.action === "delete" && value.updatePayload !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["updatePayload"],
        message: "delete cannot include an update payload",
      });
    }
  });

export type TrainingModificationResult = z.infer<
  typeof trainingModificationResultSchema
>;
export type TrainingModificationUpdatePayload = z.infer<
  typeof trainingModificationUpdatePayloadSchema
>;

function hasMeasurableUpdate(
  payload: TrainingModificationUpdatePayload | null,
): boolean {
  if (payload === null) {
    return false;
  }
  return (
    payload.reps !== null ||
    payload.weightGrams !== null ||
    payload.durationSeconds !== null
  );
}
