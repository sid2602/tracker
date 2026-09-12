import { z } from "zod";

export const routerLlmSchema = z.object({
  intent: z.enum(["expense", "report", "category", "modification", "ignore"]),
});

export type RouterResult = z.infer<typeof routerLlmSchema>;
