import { z } from "zod";

export const baseExpenseItemSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1),
});

export const expenseResultSchema = z.object({
  items: z.array(
    baseExpenseItemSchema.extend({
      category: z.string().min(1),
    }),
  ).min(1),
});

export function buildExpenseResultSchema(
  categories: { name: string; description: string | null }[],
) {
  const categoryNames = categories.map((c) => c.name);

  const categorySchema = z.string().min(1).refine(
    (value) => categoryNames.length === 0 || categoryNames.includes(value),
    "Category must be one of the configured categories",
  );

  const itemSchema = baseExpenseItemSchema.extend({
    category: categorySchema,
  });

  return z.object({
    items: z.array(itemSchema).min(1),
  });
}

export type ExpenseItem = z.infer<typeof baseExpenseItemSchema> & { category: string };
export type ExpenseResult = z.infer<typeof expenseResultSchema>;
