import { TIME_ZONE } from "../../constants.js";
import { getReferenceDate } from "../../lib/dates.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { parseExpenses } from "./parser.js";
import { insertExpenses, type ExpenseInput } from "./repository.js";
import type { ExpenseResult } from "./schema.js";

type HandleExpenseDeps = {
  parse?: typeof parseExpenses;
  getDate?: typeof getReferenceDate;
};

export async function handleExpense(
  deps: AppDeps,
  context: MessageContext,
  handlerDeps: HandleExpenseDeps = {},
): Promise<HandlerResult> {
  const parse = handlerDeps.parse ?? parseExpenses;
  const getDate = handlerDeps.getDate ?? getReferenceDate;

  try {
    const referenceDate = getDate(TIME_ZONE, deps.now?.() ?? new Date());
    const parsed = await parse(deps.config, context.rawText, referenceDate);
    const expenses = mapParsedExpenses(parsed, context);
    const { inserted } = insertExpenses(deps.db, expenses);

    if (inserted === 0) {
      return {
        kind: "success",
        message: "✅ Wiadomosc juz byla zapisana",
      };
    }

    const suffix = inserted === 1 ? "pozycje" : "pozycji";

    return {
      kind: "success",
      message: `✅ Zapisano ${inserted} ${suffix}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse expense";

    return { kind: "failure", message };
  }
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
    currency: item.currency,
    category: item.category,
    occurredOn: item.occurredOn,
    note: item.note,
    rawText: context.rawText,
  }));
}
