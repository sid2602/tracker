import { TIME_ZONE } from "../../../../constants.js";
import { logger } from "../../../../lib/logger.js";
import { getReferenceDate } from "../../../../lib/dates.js";
import { MESSAGE_ALREADY_SAVED, savedItemsMessage } from "../../../../lib/messages.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { isUserInputError, UserInputError } from "../../../../worker/errors.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../../../worker/types.js";
import { parseExpenses } from "./parser.js";
import { insertExpenses, type ExpenseInput } from "./repository.js";
import { expenseResultSchema, type ExpenseResult } from "./schema.js";
import {
  getAllCategories,
  normalizeCategoryName,
} from "../categories/repository.js";

export async function handleExpense(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const parsed = await analyzeExpense(deps, context);
    return await deps.db.transaction().execute((trx) =>
      persistExpense(trx, context, parsed),
    );
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
  const safeParsed = validateExpenseResult(parsed);
  if (containsPromptInjectionMarker(context.rawText)) {
    throw new UserInputError(
      "Please send the expense without embedded instructions.",
    );
  }

  const categories = await getAllCategories(db);
  const categoryNames = new Map(
    categories.map((category) => [
      normalizeCategoryName(category.name),
      category.name,
    ]),
  );
  const expenses = mapParsedExpenses(safeParsed, context, categoryNames);
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
  categoryNames: ReadonlyMap<string, string>,
): ExpenseInput[] {
  return parsed.items.map((item, itemIndex) => {
    const category = categoryNames.get(normalizeCategoryName(item.category));
    if (category === undefined) {
      throw new UserInputError(
        `Category '${item.category}' does not exist. Please choose an existing category.`,
      );
    }

    return {
      sourceMessageKey: context.messageKey,
      sourceAuthor: context.sourceAuthor,
      sourceTimestamp: context.sourceTimestamp,
      itemIndex,
      amountCents: item.amountCents,
      currency: (item.currency ?? "PLN").toUpperCase(),
      category,
      occurredOn: item.occurredOn,
      note: item.note,
      rawText: context.rawText,
    };
  });
}

function validateExpenseResult(parsed: ExpenseResult): ExpenseResult {
  const result = expenseResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new UserInputError(
      "The expense details were incomplete or invalid. Please try again.",
      result.error,
    );
  }

  return result.data;
}
