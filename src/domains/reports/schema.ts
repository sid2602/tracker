import { z } from "zod";

export const reportPeriodSchema = z.enum(["this_month", "last_month"]);
export const reportGroupBySchema = z.enum(["total", "category"]);

export const reportParamsSchema = z.object({
  period: reportPeriodSchema,
  group_by: reportGroupBySchema,
});

export type ReportParams = z.infer<typeof reportParamsSchema>;
