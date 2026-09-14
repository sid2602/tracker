import { z } from "zod";
import { isValidCalendarDate } from "../../../../lib/dates.js";

export const MAX_TRAINING_REPORT_TITLE_LENGTH = 200;
export const MAX_TRAINING_REPORT_EXERCISE_LENGTH = 100;

const reportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

export const trainingReportParamsSchema = z
  .object({
    start_date: reportDateSchema,
    end_date: reportDateSchema,
    title: z.string().min(1).max(MAX_TRAINING_REPORT_TITLE_LENGTH),
    exercise: z
      .string()
      .trim()
      .min(1)
      .max(MAX_TRAINING_REPORT_EXERCISE_LENGTH)
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.start_date > value.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_date"],
        message: "Report end date must not be before its start date",
      });
    }
  });

export type TrainingReportParams = z.infer<typeof trainingReportParamsSchema>;
