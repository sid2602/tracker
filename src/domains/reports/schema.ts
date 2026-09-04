import { z } from "zod";

export const reportGroupBySchema = z.enum(["total", "category"]);

export const reportParamsSchema = z.object({
  start_date: z.string().describe("Start date of the report in YYYY-MM-DD format (inclusive)."),
  end_date: z.string().describe("End date of the report in YYYY-MM-DD format (inclusive)."),
  categories: z.array(z.string()).optional().describe("List of categories to filter the report by. If empty or missing, include all categories."),
  title: z.string().describe("A short, human-readable description of the report period and filters, e.g. 'Yesterday', 'This week', 'Food & Drink in 2024'."),
  group_by: reportGroupBySchema,
});

export type ReportParams = z.infer<typeof reportParamsSchema>;
