import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { UserInputError } from "../../../../worker/errors.js";
import type { CategoryTable } from "../../../../db/schema.js";
import { normalizeCategoryName } from "./repository.js";
import type { CategoryAction } from "./schema.js";

const CATEGORY_INPUT_ERROR =
  "Please provide one clear category action and a valid category name.";
const CATEGORY_REMOVE_ERROR =
  "To remove a category safely, provide its exact canonical name.";

export function validateCategoryAction(
  rawText: string,
  action: CategoryAction,
  categories: readonly CategoryTable[],
): CategoryAction {
  if (containsPromptInjectionMarker(rawText)) {
    throw new UserInputError(CATEGORY_INPUT_ERROR);
  }

  if (action.action === "remove") {
    validateRemoveAction(rawText, action, categories);
  } else if (action.action === "add") {
    validateActionVerb(rawText, "add");
  } else {
    validateListAction(rawText);
  }

  return action;
}

function validateRemoveAction(
  rawText: string,
  action: CategoryAction,
  categories: readonly CategoryTable[],
): void {
  validateActionVerb(rawText, "remove");
  const categoryName = action.categoryName;
  if (categoryName === null) {
    throw new UserInputError(CATEGORY_REMOVE_ERROR);
  }

  const normalizedText = normalizeCategoryText(rawText);
  const matchingCategories = categories.filter((category) =>
    containsCanonicalCategory(normalizedText, category.name),
  );
  const normalizedName = normalizeCategoryName(categoryName);

  if (
    matchingCategories.length !== 1 ||
    normalizeCategoryName(matchingCategories[0]?.name ?? "") !== normalizedName
  ) {
    throw new UserInputError(CATEGORY_REMOVE_ERROR);
  }
}

function validateListAction(rawText: string): void {
  const normalizedText = normalizeCategoryText(rawText);
  const hasMutatingVerb =
    /(?:^|\s)(?:add|create|dodaj|utwórz|utworz|delete|remove|drop|usuń|usun|skasuj)(?=\s|$)/u.test(
      normalizedText,
    );

  if (hasMutatingVerb) {
    throw new UserInputError(CATEGORY_INPUT_ERROR);
  }
}

function validateActionVerb(
  rawText: string,
  action: "add" | "remove" | "list",
): void {
  const normalizedText = normalizeCategoryText(rawText);
  const verbs = {
    add: /(?:^|\s)(?:add|create|dodaj|utwórz|utworz)(?=\s|$)/u,
    remove: /(?:^|\s)(?:delete|remove|drop|usuń|usun|skasuj)(?=\s|$)/u,
    list: /(?:^|\s)(?:list|show|display|pokaż|pokaz|wymień|wymien)(?=\s|$)/u,
  };
  const matchedActions = Object.entries(verbs).filter(([, pattern]) =>
    pattern.test(normalizedText),
  );

  if (
    matchedActions.length !== 1 ||
    matchedActions[0]?.[0] !== action
  ) {
    throw new UserInputError(CATEGORY_INPUT_ERROR);
  }
}

function containsCanonicalCategory(text: string, categoryName: string): boolean {
  const normalizedName = normalizeCategoryText(categoryName);
  if (normalizedName.length === 0) {
    return false;
  }

  return ` ${text} `.includes(` ${normalizedName} `);
}

function normalizeCategoryText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,!?;:()[\]{}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
