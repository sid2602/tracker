import { z } from "zod";

const reportPeriodSchema = z.enum(["this_month", "last_month"]);
const reportGroupBySchema = z.enum(["total", "category"]);

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type ReportGroupBy = z.infer<typeof reportGroupBySchema>;

/** Flat object schema for generateObject / OpenAI structured outputs. */
export const routerLlmSchema = z.object({
  intent: z.enum(["expense", "report", "ignore"]),
  period: reportPeriodSchema.nullable(),
  group_by: reportGroupBySchema.nullable(),
});

export type RouterLlmResult = z.infer<typeof routerLlmSchema>;

export type RouterResult =
  | { intent: "expense" }
  | {
      intent: "report";
      period: ReportPeriod;
      group_by: ReportGroupBy;
    }
  | { intent: "ignore" };

export function toRouterResult(value: RouterLlmResult): RouterResult {
  if (value.intent === "report") {
    const period = reportPeriodSchema.parse(value.period);
    const group_by = reportGroupBySchema.parse(value.group_by);
    return { intent: "report", period, group_by };
  }

  return { intent: value.intent };
}
