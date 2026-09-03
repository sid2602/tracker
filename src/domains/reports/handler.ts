import { getPeriodRange } from "../../lib/periods.js";
import type { RouterResult } from "../../routing/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { formatCategoryReport, formatTotalReport } from "./format.js";
import { queryByCategory, queryTotals } from "./queries.js";
import { parseReport } from "./parser.js";

export async function handleReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const params = await parseReport(deps.config, context.rawText);
    const range = getPeriodRange(params.period, deps.now?.() ?? new Date());

    if (params.group_by === "category") {
      const rows = await queryByCategory(deps.db, range);
      return {
        kind: "success",
        message: formatCategoryReport(params.period, rows),
      };
    }

    const rows = await queryTotals(deps.db, range);
    return {
      kind: "success",
      message: formatTotalReport(params.period, rows),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse report request";
    return { kind: "failure", message };
  }
}
