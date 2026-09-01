import { z } from "zod";

const reportPeriodSchema = z.enum(["this_month", "last_month"]);
const reportGroupBySchema = z.enum(["total", "category"]);

export const routerResultSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("expense") }),
  z.object({
    intent: z.literal("report"),
    period: reportPeriodSchema,
    group_by: reportGroupBySchema,
  }),
  z.object({ intent: z.literal("ignore") }),
]);

export type RouterResult = z.infer<typeof routerResultSchema>;
