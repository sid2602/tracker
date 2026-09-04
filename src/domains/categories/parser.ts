import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { getCategoryPrompt } from "./prompt.js";
import { categoryActionSchema, type CategoryAction } from "./schema.js";

export async function parseCategoryAction(
  config: Config,
  text: string,
): Promise<CategoryAction> {
  const result = await generateStructured(
    config,
    categoryActionSchema,
    getCategoryPrompt(text),
    "llm.category",
  );

  return categoryActionSchema.parse(result);
}
