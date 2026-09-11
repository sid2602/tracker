import { TIME_ZONE } from "../../constants.js";
import { getReferenceDate } from "../../lib/dates.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import {
  EXPENSE_LIST_LIMIT,
  formatCategoryReport,
  formatExpenseList,
  formatTotalReport,
} from "./format.js";
import { queryByCategory, queryExpenseList, queryTotals } from "./queries.js";
import { parseReport } from "./parser.js";

export async function handleReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const currentDateStr = getReferenceDate(TIME_ZONE, deps.now?.() ?? new Date());
    const params = await parseReport(deps.config, context.rawText, currentDateStr);
    const range = { start: params.start_date, end: params.end_date };

    if (params.group_by === "list") {
      const { items, totalCount } = await queryExpenseList(
        deps.db,
        range,
        params.categories,
        EXPENSE_LIST_LIMIT,
      );
      return {
        kind: "success",
        message: formatExpenseList(params.title, items, totalCount),
      };
    }

    if (params.group_by === "category") {
      const rows = await queryByCategory(deps.db, range, params.categories);
      return {
        kind: "success",
        message: formatCategoryReport(params.title, rows),
      };
    }

    const rows = await queryTotals(deps.db, range, params.categories);
    return {
      kind: "success",
      message: formatTotalReport(params.title, rows),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse report request";
    return { kind: "failure", message };
  }
}
