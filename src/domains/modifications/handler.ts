import { logger } from "../../lib/logger.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { parseModification } from "./parser.js";
import { findMatchingExpenses, deleteExpense, updateExpense } from "./repository.js";

function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

export async function handleModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  const modification = await parseModification(deps.config, context.rawText);
  logger.info({ modification }, "parsed modification intent");

  const matches = await findMatchingExpenses(deps.db, context.sourceAuthor, modification);

  if (matches.length === 0) {
    return {
      kind: "success",
      message: "Could not find any expense matching this description.",
    };
  }

  if (matches.length === 1) {
    const expense = matches[0];
    if (modification.action === "delete") {
      await deleteExpense(deps.db, expense.id);
      return {
        kind: "success",
        message: `Deleted expense: ${expense.category} ${formatAmount(expense.amount_cents, expense.currency)} on ${expense.occurred_on}`,
      };
    } else {
      if (modification.updatePayload) {
        await updateExpense(deps.db, expense.id, modification.updatePayload);
        return {
          kind: "success",
          message: `Updated expense #${expense.id}.`,
        };
      } else {
        return {
          kind: "success",
          message: `No update payload provided for expense #${expense.id}.`,
        };
      }
    }
  }

  const lines = matches.map((m) => 
    `- #${m.id} ${m.category} ${formatAmount(m.amount_cents, m.currency)} (${m.occurred_on})`
  );
  
  return {
    kind: "success",
    message: `Found multiple matching expenses. Please specify which one by its ID (e.g. "delete #${matches[0].id}"):\n${lines.join("\n")}`,
  };
}
