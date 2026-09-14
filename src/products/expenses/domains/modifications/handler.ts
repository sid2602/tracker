import { logger } from "../../../../lib/logger.js";
import { TIME_ZONE } from "../../../../constants.js";
import { getReferenceDate } from "../../../../lib/dates.js";
import { isUserInputError, UserInputError } from "../../../../worker/errors.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../../../worker/types.js";
import { parseModification } from "./parser.js";
import { findMatchingExpenses, deleteExpense, updateExpense } from "./repository.js";
import { categoryExists, normalizeCategoryName } from "../categories/repository.js";
import {
  modificationResultSchema,
  type ModificationResult,
} from "./schema.js";
import { validateModificationAgainstRawText } from "./validation.js";

function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

export async function handleModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const modification = await analyzeModification(deps, context);
    const referenceDate = getReferenceDate(
      TIME_ZONE,
      deps.now?.() ?? new Date(),
    );
    return await deps.db.transaction().execute((trx) =>
      persistModification(trx, context, modification, referenceDate),
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

export async function analyzeModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<ModificationResult> {
  const referenceDate = getReferenceDate(
    TIME_ZONE,
    deps.now?.() ?? new Date(),
  );
  return parseModification(deps.config, context.rawText, referenceDate);
}

export async function persistModification(
  db: QueryCreator<AppDatabase>,
  context: MessageContext,
  modification: ModificationResult,
  referenceDate?: string,
): Promise<HandlerResult> {
  const validatedModification = validateModification(modification);
  validateModificationAgainstRawText(
    context.rawText,
    validatedModification,
    referenceDate,
  );
  logger.info({ modification: validatedModification }, "parsed modification intent");

  if (
    validatedModification.action === "update" &&
    validatedModification.updatePayload?.category !== null &&
    validatedModification.updatePayload?.category !== undefined
  ) {
    const categoryName = normalizeCategoryName(
      validatedModification.updatePayload.category,
    );
    if (!(await categoryExists(db, categoryName))) {
      throw new UserInputError(
        `Category '${categoryName}' does not exist. Please choose an existing category.`,
      );
    }
  }

  const matches = await findMatchingExpenses(
    db,
    context.sourceAuthor,
    validatedModification,
  );

  if (matches.length === 0) {
    return {
      kind: "success",
      message: "Could not find any expense matching this description.",
    };
  }

  if (matches.length === 1) {
    const expense = matches[0];
    if (validatedModification.action === "delete") {
      const deleted = await deleteExpense(
        db,
        context.sourceAuthor,
        expense.id,
      );
      if (!deleted) {
        throw new UserInputError(
          "The expense changed before it could be deleted. Please try again.",
        );
      }
      return {
        kind: "success",
        message: `Deleted expense: ${expense.category} ${formatAmount(expense.amount_cents, expense.currency)} on ${expense.occurred_on}`,
      };
    }

    const updatePayload = validatedModification.updatePayload;
    if (!updatePayload) {
      throw new UserInputError(
        "Please specify what should be changed in the expense.",
      );
    }

    const updated = await updateExpense(
      db,
      context.sourceAuthor,
      expense.id,
      updatePayload,
    );
    if (!updated) {
      throw new UserInputError(
        "The expense could not be updated. Please try again.",
      );
    }

    return {
      kind: "success",
      message: `Updated expense #${expense.id}.`,
    };
  }

  const lines = matches.map(
    (match) =>
      `- #${match.id} ${match.category} ${formatAmount(match.amount_cents, match.currency)} (${match.occurred_on})`,
  );

  return {
    kind: "success",
    message: `Found multiple matching expenses. Please specify which one by its ID (e.g. "delete #${matches[0]?.id}"):\n${lines.join("\n")}`,
  };
}

function validateModification(
  modification: ModificationResult,
): ModificationResult {
  const parsed = modificationResultSchema.safeParse(modification);
  if (!parsed.success) {
    throw new UserInputError(
      "Please identify one expense by ID or provide unambiguous details.",
      parsed.error,
    );
  }

  return parsed.data;
}
