import { getPeriodRange } from "../../lib/periods.js";
import type { RouterResult } from "../../routing/schema.js";
import type { AppDeps, HandlerResult } from "../../worker/types.js";
import { formatCategoryReport, formatTotalReport } from "./format.js";
import { queryByCategory, queryTotals } from "./queries.js";
import { reportParamsSchema } from "./schema.js";

export async function handleReport(
  deps: AppDeps,
  route: Extract<RouterResult, { intent: "report" }>,
): Promise<HandlerResult> {
  const params = reportParamsSchema.parse({
    period: route.period,
    group_by: route.group_by,
  });
  const range = getPeriodRange(params.period, deps.now?.() ?? new Date());

  if (params.group_by === "category") {
    const rows = queryByCategory(deps.db, range);
    return {
      kind: "success",
      message: formatCategoryReport(params.period, rows),
    };
  }

  const rows = queryTotals(deps.db, range);
  return {
    kind: "success",
    message: formatTotalReport(params.period, rows),
  };
}
