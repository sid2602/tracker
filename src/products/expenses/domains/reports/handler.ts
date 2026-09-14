import { TIME_ZONE } from "../../../../constants.js";
import { getReferenceDate } from "../../../../lib/dates.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../../../worker/types.js";
import {
  EXPENSE_LIST_LIMIT,
  formatCategoryReport,
  formatExpenseList,
  formatTotalReport,
} from "./format.js";
import { queryByCategory, queryExpenseList, queryTotals } from "./queries.js";
import { parseReport } from "./parser.js";
import { reportParamsSchema, type ReportParams } from "./schema.js";
import { isUserInputError, UserInputError } from "../../../../worker/errors.js";

export async function handleReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const params = await analyzeReport(deps, context);
    return await persistReport(deps.db, context.rawText, params);
  } catch (error: unknown) {
    if (isUserInputError(error)) {
      return {
        kind: "success",
        message: error.userMessage,
      };
    }
    throw error;
  }
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
  rawText: string,
  params: ReportParams,
): Promise<HandlerResult> {
  if (containsPromptInjectionMarker(rawText)) {
    throw new UserInputError(
      "Please send the report request without embedded instructions.",
    );
  }

  const safeParams = validateReportParams(params);
  const range = { start: safeParams.start_date, end: safeParams.end_date };

  if (safeParams.group_by === "list") {
    const { items, totalCount } = await queryExpenseList(
      db,
      range,
      safeParams.categories,
      EXPENSE_LIST_LIMIT,
    );
    return {
      kind: "success",
      message: formatExpenseList(safeParams.title, items, totalCount),
    };
  }

  if (safeParams.group_by === "category") {
    const rows = await queryByCategory(db, range, safeParams.categories);
    return {
      kind: "success",
      message: formatCategoryReport(safeParams.title, rows),
    };
  }

  const rows = await queryTotals(db, range, safeParams.categories);
  return {
    kind: "success",
    message: formatTotalReport(safeParams.title, rows),
  };
}

function validateReportParams(params: ReportParams): ReportParams {
  const result = reportParamsSchema.safeParse(params);
  if (!result.success) {
    throw new UserInputError(
      "The report parameters were invalid. Please try again.",
      result.error,
    );
  }

  return result.data;
}
