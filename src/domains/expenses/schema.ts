import { z } from "zod";

export const baseExpenseItemSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1),
});

export function buildExpenseResultSchema(categories: { name: string, description: string | null }[]) {
  const categoryNames = categories.map((c) => c.name);
  
  // If there are no categories, provide a fallback or string
  const categorySchema = categoryNames.length > 0 
    ? z.enum([categoryNames[0], ...categoryNames.slice(1)] as any) 
    : z.string();
    
  const itemSchema = baseExpenseItemSchema.extend({
    category: categorySchema,
  });

  return z.object({
    items: z.array(itemSchema).min(1),
  });
}

// We cannot statically infer the exact type including the enum category,
// so we define a base type and category as string for TypeScript.
export type ExpenseItem = z.infer<typeof baseExpenseItemSchema> & { category: string };
export type ExpenseResult = { items: ExpenseItem[] };
