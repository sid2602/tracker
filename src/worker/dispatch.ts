import { handleExpense } from "../domains/expenses/index.js";
import { handleReport } from "../domains/reports/index.js";
import { UNRECOGNIZED_MESSAGE } from "../lib/messages.js";
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
  try {
    const route = await routeMessage(deps.config, context.rawText);
    console.log(
      `[${new Date().toISOString()}] routed intent=${route.intent}${
        route.intent === "report"
          ? ` period=${route.period} group_by=${route.group_by}`
          : ""
      }`,
    );
    const result = await dispatchMessage(deps, context, route);

    if (result.kind === "failure") {
      return { kind: "failure", message: UNRECOGNIZED_MESSAGE };
    }

    return result;
  } catch (error) {
    console.warn(
      `[${new Date().toISOString()}] Message processing failed`,
      error,
    );
    return { kind: "failure", message: UNRECOGNIZED_MESSAGE };
  }
}
