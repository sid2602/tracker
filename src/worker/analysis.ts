import { z } from "zod";
import { categoryActionSchema } from "../products/expenses/domains/categories/schema.js";
import { expenseResultSchema } from "../products/expenses/domains/expenses/schema.js";
import { modificationResultSchema } from "../products/expenses/domains/modifications/schema.js";
import { reportParamsSchema } from "../products/expenses/domains/reports/schema.js";
import { trainingLogResultSchema } from "../products/training/domains/entries/schema.js";
import { trainingReportParamsSchema } from "../products/training/domains/reports/schema.js";
import { toCanonicalIntent } from "../routing/intents.js";

const analysisVersionSchema = z.literal(1);

export const messageAnalysisSchema = z.discriminatedUnion("intent", [
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("expenses.create"),
    parsed: expenseResultSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("expenses.report"),
    parsed: reportParamsSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("expenses.category"),
    parsed: categoryActionSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("expenses.modification"),
    parsed: modificationResultSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("training.log"),
    parsed: trainingLogResultSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("training.report"),
    parsed: trainingReportParamsSchema,
  }),
  z.object({
    version: analysisVersionSchema,
    intent: z.literal("ignore"),
  }),
]);

export type MessageAnalysis = z.infer<typeof messageAnalysisSchema>;

const legacyMessageAnalysisSchema = z.discriminatedUnion("intent", [
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

export function serializeMessageAnalysis(analysis: MessageAnalysis): string {
  return JSON.stringify(analysis);
}

export function parseMessageAnalysis(raw: string): MessageAnalysis {
  const parsed: unknown = JSON.parse(raw);
  const canonical = messageAnalysisSchema.safeParse(parsed);
  if (canonical.success) {
    return canonical.data;
  }

  const legacy = legacyMessageAnalysisSchema.parse(parsed);
  if (legacy.intent === "ignore") {
    return { version: 1, intent: "ignore" };
  }

  return messageAnalysisSchema.parse({
    version: 1,
    intent: toCanonicalIntent(legacy.intent),
    parsed: legacy.parsed,
  });
}
