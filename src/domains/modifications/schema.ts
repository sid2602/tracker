import { z } from "zod";

export const modificationSearchSchema = z.object({
  category: z.string().nullish().describe("Category name to filter by"),
  amountCents: z.number().int().positive().nullish().describe("Amount in cents to filter by (e.g. 50 PLN -> 5000)"),
  keyword: z.string().nullish().describe("Keyword to search in notes or raw text"),
});

export const modificationUpdatePayloadSchema = z.object({
  category: z.string().nullish(),
  amountCents: z.number().int().positive().nullish(),
});

export const modificationResultSchema = z.object({
  action: z.enum(["delete", "update"]),
  target: z.enum(["last", "specific", "id"]),
  searchCriteria: modificationSearchSchema.nullish(),
  id: z.number().int().nullish().describe("ID of the expense if target is 'id'"),
  updatePayload: modificationUpdatePayloadSchema.nullish(),
});

export type ModificationResult = z.infer<typeof modificationResultSchema>;
export type ModificationSearch = z.infer<typeof modificationSearchSchema>;
