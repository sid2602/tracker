import { z } from "zod";

export const routerLlmSchema = z.object({
  intent: z.enum(["expense", "report", "ignore"]),
});

export type RouterLlmResult = z.infer<typeof routerLlmSchema>;

export type RouterResult =
  | { intent: "expense" }
  | { intent: "report" }
  | { intent: "ignore" };

export function toRouterResult(value: RouterLlmResult): RouterResult {
  return { intent: value.intent };
}
