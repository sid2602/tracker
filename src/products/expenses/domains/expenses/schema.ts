import { z } from "zod";
import { isValidCalendarDate } from "../../../../lib/dates.js";

export const MAX_EXPENSE_ITEMS = 20;
export const MAX_EXPENSE_NOTE_LENGTH = 500;
export const MAX_EXPENSE_CATEGORY_LENGTH = 100;

const occurredOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

export const baseExpenseItemSchema = z.object({
  amountCents: z.number().int().positive().safe(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable(),
  occurredOn: occurredOnSchema,
  note: z.string().min(1).max(MAX_EXPENSE_NOTE_LENGTH),
});

export const expenseResultSchema = z.object({
  items: z.array(
    baseExpenseItemSchema.extend({
      category: z
        .string()
        .trim()
        .min(1)
        .max(MAX_EXPENSE_CATEGORY_LENGTH),
    }),
  ).min(1).max(MAX_EXPENSE_ITEMS),
});

export function buildExpenseResultSchema(
  categories: { name: string; description: string | null }[],
) {
  const categoryNames = categories.map((c) => c.name);

  const categorySchema = z
    .string()
    .trim()
    .min(1)
    .max(MAX_EXPENSE_CATEGORY_LENGTH)
    .refine(
      (value) => categoryNames.length === 0 || categoryNames.includes(value),
      "Category must be one of the configured categories",
    );

  const itemSchema = baseExpenseItemSchema.extend({
    category: categorySchema,
  });

  return z.object({
    items: z.array(itemSchema).min(1).max(MAX_EXPENSE_ITEMS),
  });
}

export type ExpenseItem = z.infer<typeof baseExpenseItemSchema> & { category: string };
export type ExpenseResult = z.infer<typeof expenseResultSchema>;
