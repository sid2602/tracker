import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { getExpensesPrompt } from "./prompt.js";
import {
  buildExpenseResultSchema,
  expenseResultSchema,
  type ExpenseResult,
} from "./schema.js";

export async function parseExpenses(
  config: Config,
  text: string,
  referenceDate: string,
  categories: { name: string, description: string | null }[],
): Promise<ExpenseResult> {
  const schema = buildExpenseResultSchema(categories);
  const result = await generateStructured(
    config,
    schema,
    getExpensesPrompt(text, referenceDate, categories),
    "llm.expense",
  );

  return expenseResultSchema.parse(result);
}
