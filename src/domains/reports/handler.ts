import { TIME_ZONE } from "../../constants.js";
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
    const now = deps.now?.() ?? new Date();
    const currentDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const params = await parseReport(deps.config, context.rawText, currentDateStr);
    const range = { start: params.start_date, end: params.end_date };

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
