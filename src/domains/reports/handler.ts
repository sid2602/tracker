import { TIME_ZONE } from "../../constants.js";
import { getReferenceDate } from "../../lib/dates.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import {
  EXPENSE_LIST_LIMIT,
  formatCategoryReport,
  formatExpenseList,
  formatTotalReport,
} from "./format.js";
import { queryByCategory, queryExpenseList, queryTotals } from "./queries.js";
import { parseReport } from "./parser.js";
import type { ReportParams } from "./schema.js";

export async function handleReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  const params = await analyzeReport(deps, context);
  return persistReport(deps.db, params);
}

export async function analyzeReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<ReportParams> {
  const currentDateStr = getReferenceDate(TIME_ZONE, deps.now?.() ?? new Date());
  return parseReport(deps.config, context.rawText, currentDateStr);
}

export async function persistReport(
  db: QueryCreator<AppDatabase>,
  params: ReportParams,
): Promise<HandlerResult> {
  const range = { start: params.start_date, end: params.end_date };

  if (params.group_by === "list") {
    const { items, totalCount } = await queryExpenseList(
      db,
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
    const rows = await queryByCategory(db, range, params.categories);
    return {
      kind: "success",
      message: formatCategoryReport(params.title, rows),
    };
  }

  const rows = await queryTotals(db, range, params.categories);
  return {
    kind: "success",
    message: formatTotalReport(params.title, rows),
  };
}
