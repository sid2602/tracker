import { logger } from "../../lib/logger.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { parseModification } from "./parser.js";
import { findMatchingExpenses, deleteExpense, updateExpense } from "./repository.js";
import type { ModificationResult } from "./schema.js";

function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

export async function handleModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  const modification = await analyzeModification(deps, context);
  return persistModification(deps.db, context, modification);
}

export async function analyzeModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<ModificationResult> {
  return parseModification(deps.config, context.rawText);
}

export async function persistModification(
  db: QueryCreator<AppDatabase>,
  context: MessageContext,
  modification: ModificationResult,
): Promise<HandlerResult> {
  logger.info({ modification }, "parsed modification intent");

  const matches = await findMatchingExpenses(db, context.sourceAuthor, modification);

  if (matches.length === 0) {
    return {
      kind: "success",
      message: "Could not find any expense matching this description.",
    };
  }

  if (matches.length === 1) {
    const expense = matches[0];
    if (modification.action === "delete") {
      await deleteExpense(db, expense.id);
      return {
        kind: "success",
        message: `Deleted expense: ${expense.category} ${formatAmount(expense.amount_cents, expense.currency)} on ${expense.occurred_on}`,
      };
    } else {
      if (modification.updatePayload) {
        await updateExpense(db, expense.id, modification.updatePayload);
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
