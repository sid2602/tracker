import type { AppDeps, HandlerResult, MessageContext } from "../../worker/types.js";
import { parseCategoryAction } from "./parser.js";
import { addCategory, getAllCategories, removeCategory } from "./repository.js";
import { logger } from "../../lib/logger.js";

export async function handleCategory(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const parsed = await parseCategoryAction(deps.config, context.rawText);
    logger.info({ parsed }, "category action parsed");

    switch (parsed.action) {
      case "list": {
        const categories = await getAllCategories(deps.db);
        return {
          kind: "success",
          message: categories.length > 0 
            ? `Your categories: ${categories.join(", ")}` 
            : "You don't have any saved categories.",
        };
      }
      
      case "add": {
        if (!parsed.categoryName) {
          return { kind: "failure", message: "No category name provided to add." };
        }
        const name = parsed.categoryName.trim().toLowerCase();
        const inserted = await addCategory(deps.db, name);
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
        const removed = await removeCategory(deps.db, name);
        if (removed) {
          return { kind: "success", message: `Category removed: ${name}` };
        }
        return { kind: "success", message: `Category '${name}' does not exist.` };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process category action";
    return { kind: "failure", message };
  }
}
