import { z } from "zod";

export const routerLlmSchema = z.object({
  intent: z.enum(["expense", "report", "category", "modification", "ignore"]),
});

export type RouterLlmResult = z.infer<typeof routerLlmSchema>;

export type RouterResult =
  | { intent: "expense" }
  | { intent: "report" }
  | { intent: "category" }
  | { intent: "modification" }
  | { intent: "ignore" };

export function toRouterResult(value: RouterLlmResult): RouterResult {
  return { intent: value.intent };
}
