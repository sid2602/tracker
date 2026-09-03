import { TIME_ZONE } from "../../constants.js";
import { logger } from "../../lib/logger.js";
import { getReferenceDate } from "../../lib/dates.js";
import { MESSAGE_ALREADY_SAVED, savedItemsMessage } from "../../lib/messages.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { parseExpenses } from "./parser.js";
import { insertExpenses, type ExpenseInput } from "./repository.js";
import type { ExpenseResult } from "./schema.js";

export async function handleExpense(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const referenceDate = getReferenceDate(TIME_ZONE, deps.now?.() ?? new Date());
    const parsed = await parseExpenses(deps.config, context.rawText, referenceDate);
    const expenses = mapParsedExpenses(parsed, context);
    const { inserted } = await insertExpenses(deps.db, expenses);

    logger.info({ details: formatExpenseDetails(expenses) }, "expense details");

    if (inserted === 0) {
      return {
        kind: "success",
        message: MESSAGE_ALREADY_SAVED,
        insertedCount: 0,
      };
    }

    return {
      kind: "success",
      message: savedItemsMessage(inserted),
      insertedCount: inserted,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse expense";

    return { kind: "failure", message };
  }
}

function formatExpenseDetails(expenses: ExpenseInput[]): string {
  return expenses
    .map((expense) => {
      const amount = (expense.amountCents / 100).toFixed(2);
      return `${expense.category} ${amount} ${expense.currency} (${expense.note}) on ${expense.occurredOn}`;
    })
    .join("; ");
}

function mapParsedExpenses(
  parsed: ExpenseResult,
  context: MessageContext,
): ExpenseInput[] {
  return parsed.items.map((item, itemIndex) => ({
    sourceAuthor: context.sourceAuthor,
    sourceTimestamp: context.sourceTimestamp,
    itemIndex,
    amountCents: item.amountCents,
    currency: (item.currency ?? "PLN").toUpperCase(),
    category: item.category,
    occurredOn: item.occurredOn,
    note: item.note,
    rawText: context.rawText,
  }));
}
