import { z } from "zod";

export const categoryActionSchema = z.object({
  action: z.enum(["add", "remove", "list"]),
  categoryName: z.string().nullable().describe("Required for 'add' or 'remove' actions. Should be lowercase."),
  description: z.string().nullable().optional().describe("Optional context or examples provided by user for this category."),
});

export type CategoryAction = z.output<typeof categoryActionSchema>;
