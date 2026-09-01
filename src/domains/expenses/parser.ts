import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { getExpensesPrompt } from "./prompt.js";
import { expenseResultSchema, type ExpenseResult } from "./schema.js";

export async function parseExpenses(
  config: Config,
  text: string,
  referenceDate: string,
): Promise<ExpenseResult> {
  const result = await generateStructured(
    config,
    expenseResultSchema,
    getExpensesPrompt(text, referenceDate),
  );

  return expenseResultSchema.parse(result);
}
