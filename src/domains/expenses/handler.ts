import { TIME_ZONE } from "../../constants.js";
import { logger } from "../../lib/logger.js";
import { getReferenceDate } from "../../lib/dates.js";
import { MESSAGE_ALREADY_SAVED, savedItemsMessage } from "../../lib/messages.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { parseExpenses } from "./parser.js";
import { insertExpenses, type ExpenseInput } from "./repository.js";
import type { ExpenseResult } from "./schema.js";
import { getAllCategories } from "../categories/repository.js";

export async function handleExpense(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  const parsed = await analyzeExpense(deps, context);
  return persistExpense(deps.db, context, parsed);
}

export async function analyzeExpense(
  deps: AppDeps,
  context: MessageContext,
): Promise<ExpenseResult> {
  const referenceDate = getReferenceDate(TIME_ZONE, deps.now?.() ?? new Date());
  const categories = await getAllCategories(deps.db);
  return parseExpenses(deps.config, context.rawText, referenceDate, categories);
}

export async function persistExpense(
  db: QueryCreator<AppDatabase>,
  context: MessageContext,
  parsed: ExpenseResult,
): Promise<HandlerResult> {
  const expenses = mapParsedExpenses(parsed, context);
  const { inserted } = await insertExpenses(db, expenses);

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
    sourceMessageKey: context.messageKey,
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
