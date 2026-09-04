import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { getExpensesPrompt } from "./prompt.js";
import { buildExpenseResultSchema, type ExpenseResult } from "./schema.js";

export async function parseExpenses(
  config: Config,
  text: string,
  referenceDate: string,
  categories: string[],
): Promise<ExpenseResult> {
  const schema = buildExpenseResultSchema(categories);
  const result = await generateStructured(
    config,
    schema,
    getExpensesPrompt(text, referenceDate, categories),
    "llm.expense",
  );

  return schema.parse(result) as ExpenseResult;
}
