import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "groceries",
  "food",
  "fuel",
  "transport",
  "home",
  "bills",
  "health",
  "entertainment",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const expenseItemSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z
    .string()
    .length(3)
    .optional()
    .transform((value) => (value ? value.toUpperCase() : "PLN")),
  category: z.enum(EXPENSE_CATEGORIES),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1),
});

export const expenseResultSchema = z.object({
  items: z.array(expenseItemSchema).min(1),
});

export type ExpenseItem = z.output<typeof expenseItemSchema>;
export type ExpenseResult = z.output<typeof expenseResultSchema>;
