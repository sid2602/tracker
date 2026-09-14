import { z } from "zod";
import { isValidCalendarDate } from "../../../../lib/dates.js";

export const reportGroupBySchema = z.enum(["total", "category", "list"]);

export const MAX_REPORT_CATEGORY_LENGTH = 100;
export const MAX_REPORT_CATEGORIES = 50;
export const MAX_REPORT_TITLE_LENGTH = 200;

const reportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

export const reportParamsSchema = z
  .object({
    start_date: reportDateSchema.describe(
      "Start date of the report in YYYY-MM-DD format (inclusive).",
    ),
    end_date: reportDateSchema.describe(
      "End date of the report in YYYY-MM-DD format (inclusive).",
    ),
    categories: z
      .array(z.string().trim().min(1).max(MAX_REPORT_CATEGORY_LENGTH))
      .max(MAX_REPORT_CATEGORIES)
      .optional()
      .describe(
        "List of categories to filter the report by. If empty or missing, include all categories.",
      ),
    title: z
      .string()
      .min(1)
      .max(MAX_REPORT_TITLE_LENGTH)
      .describe(
        "A short, human-readable description of the report period and filters, e.g. 'Yesterday', 'This week', 'Food & Drink in 2024'.",
      ),
    group_by: reportGroupBySchema,
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

export type ReportParams = z.infer<typeof reportParamsSchema>;
