import { handleExpense } from "../domains/expenses/index.js";
import { handleReport } from "../domains/reports/index.js";
import { routeMessage } from "../routing/router.js";
import type { RouterResult } from "../routing/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "./types.js";

export async function dispatchMessage(
  deps: AppDeps,
  context: MessageContext,
  route: RouterResult,
): Promise<HandlerResult> {
  switch (route.intent) {
    case "expense":
      return handleExpense(deps, context);
    case "report":
      return handleReport(deps, route);
    case "ignore":
      return { kind: "silent" };
  }
}

export async function processMessage(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  const route = await routeMessage(deps.config, context.rawText);
  return dispatchMessage(deps, context, route);
}
