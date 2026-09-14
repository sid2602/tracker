import { z } from "zod";
import { canonicalIntentSchema } from "./intents.js";

/** Live router output uses canonical intents (ADR 0023). Legacy aliases remain for replay only. */
export const routerLlmSchema = z.object({
  intent: canonicalIntentSchema,
});

export type RouterResult = z.infer<typeof routerLlmSchema>;
