import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import { parseCategoryAction } from "./parser.js";
import type { CategoryAction } from "./schema.js";
import { addCategory, getAllCategories, removeCategory } from "./repository.js";
import { logger } from "../../lib/logger.js";

export async function handleCategory(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  const parsed = await analyzeCategory(deps, context);
  return persistCategory(deps.db, parsed);
}

export async function analyzeCategory(
  deps: AppDeps,
  context: MessageContext,
): Promise<CategoryAction> {
  return parseCategoryAction(deps.config, context.rawText);
}

export async function persistCategory(
  db: QueryCreator<AppDatabase>,
  parsed: CategoryAction,
): Promise<HandlerResult> {
  logger.info({ parsed }, "category action parsed");

  switch (parsed.action) {
    case "list": {
      const categories = await getAllCategories(db);
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
      if (!parsed.categoryName) {
        return { kind: "failure", message: "No category name provided to add." };
      }
      const name = parsed.categoryName.trim().toLowerCase();
      const inserted = await addCategory(db, name, parsed.description);
      if (inserted) {
        return { kind: "success", message: `Category added: ${name}` };
      }
      return { kind: "success", message: `Category '${name}' already exists.` };
    }

    case "remove": {
      if (!parsed.categoryName) {
        return { kind: "failure", message: "No category name provided to remove." };
      }
      const name = parsed.categoryName.trim().toLowerCase();
      const removed = await removeCategory(db, name);
      if (removed) {
        return { kind: "success", message: `Category removed: ${name}` };
      }
      return { kind: "success", message: `Category '${name}' does not exist.` };
    }
  }
}
