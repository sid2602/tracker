import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import { parseCategoryAction } from "./parser.js";
import type { CategoryAction } from "./schema.js";
import { addCategory, getAllCategories, removeCategory } from "./repository.js";
import { logger } from "../../lib/logger.js";
import { isUserInputError, UserInputError } from "../../worker/errors.js";
import { categoryActionSchema } from "./schema.js";
import { validateCategoryAction } from "./validation.js";

export async function handleCategory(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const parsed = await analyzeCategory(deps, context);
    return await deps.db.transaction().execute((trx) =>
      persistCategory(trx, context.rawText, parsed),
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

export async function analyzeCategory(
  deps: AppDeps,
  context: MessageContext,
): Promise<CategoryAction> {
  return parseCategoryAction(deps.config, context.rawText);
}

export async function persistCategory(
  db: QueryCreator<AppDatabase>,
  rawText: string,
  parsed: CategoryAction,
): Promise<HandlerResult> {
  const validatedParsed = validateCategorySchema(parsed);
  const categories = await getAllCategories(db);
  const safeParsed = validateCategoryAction(
    rawText,
    validatedParsed,
    categories,
  );
  logger.info({ parsed: safeParsed }, "category action parsed");

  switch (safeParsed.action) {
    case "list": {
      const formatted = categories
        .map((category) =>
          category.description
            ? `- ${category.name} (${category.description})`
            : `- ${category.name}`,
        )
        .join("\n");

      return {
        kind: "success",
        message: categories.length > 0
          ? `Your categories:\n${formatted}`
          : "You don't have any saved categories.",
      };
    }

    case "add": {
      if (!safeParsed.categoryName) {
        throw new UserInputError(
          "Please provide a category name to add.",
        );
      }
      const name = safeParsed.categoryName.trim().toLowerCase();
      const inserted = await addCategory(db, name, safeParsed.description);
      if (inserted) {
        return { kind: "success", message: `Category added: ${name}` };
      }
      return { kind: "success", message: `Category '${name}' already exists.` };
    }

    case "remove": {
      if (!safeParsed.categoryName) {
        throw new UserInputError(
          "Please provide a category name to remove.",
        );
      }
      const name = safeParsed.categoryName.trim().toLowerCase();
      const removed = await removeCategory(db, name);
      if (removed) {
        return { kind: "success", message: `Category removed: ${name}` };
      }
      return { kind: "success", message: `Category '${name}' does not exist.` };
    }
  }
}

function validateCategorySchema(parsed: CategoryAction): CategoryAction {
  const result = categoryActionSchema.safeParse(parsed);
  if (!result.success) {
    throw new UserInputError(
      "Please provide one clear category action and a valid category name.",
      result.error,
    );
  }

  return result.data;
}
