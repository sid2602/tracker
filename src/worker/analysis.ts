import { z } from "zod";
import { categoryActionSchema } from "../domains/categories/schema.js";
import { expenseResultSchema } from "../domains/expenses/schema.js";
import { modificationResultSchema } from "../domains/modifications/schema.js";
import { reportParamsSchema } from "../domains/reports/schema.js";

const analysisVersionSchema = z.literal(1);

export const messageAnalysisSchema = z.discriminatedUnion("intent", [
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("expense"),
    parsed: expenseResultSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("report"),
    parsed: reportParamsSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("category"),
    parsed: categoryActionSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("modification"),
    parsed: modificationResultSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("ignore"),
  }),
]);

export type MessageAnalysis = z.infer<typeof messageAnalysisSchema>;

export function serializeMessageAnalysis(analysis: MessageAnalysis): string {
  return JSON.stringify(analysis);
}

export function parseMessageAnalysis(raw: string): MessageAnalysis {
  const parsed: unknown = JSON.parse(raw);
  return messageAnalysisSchema.parse(parsed);
}
