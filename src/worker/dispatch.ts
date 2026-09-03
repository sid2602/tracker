import { handleExpense } from "../domains/expenses/index.js";
import { logger } from "../lib/logger.js";
import { handleReport } from "../domains/reports/index.js";
import { UNRECOGNIZED_MESSAGE } from "../lib/messages.js";
import { routeMessage } from "../routing/router.js";
import { recordMessageTrace } from "../tracing.js";
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
      return handleReport(deps, context);
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
    logger.info({ route }, "routed message intent");
    const result = await dispatchMessage(deps, context, route);

    const finalResult: HandlerResult =
      result.kind === "failure"
        ? {
            kind: "failure",
            message: UNRECOGNIZED_MESSAGE,
            errorCode: "unrecognized",
          }
        : result;

    recordMessageTrace({
      metadata: buildTraceMetadata(route, finalResult),
      output: buildTraceOutput(finalResult),
    });
    return finalResult;
  } catch (error) {
    logger.warn({ error }, "Message processing failed");
    const failure: HandlerResult = {
      kind: "failure",
      message: UNRECOGNIZED_MESSAGE,
      errorCode: "processing_failed",
    };
    recordMessageTrace({
      metadata: {
        resultKind: "failure",
        errorCode: "processing_failed",
      },
      output: buildTraceOutput(failure),
    });
    return failure;
  }
}

function buildTraceOutput(result: HandlerResult): unknown {
  if (result.kind === "silent") {
    return { kind: "silent" };
  }

  if (result.kind === "success") {
    return {
      kind: "success",
      message: result.message,
      insertedCount: result.insertedCount ?? null,
    };
  }

  return {
    kind: "failure",
    message: result.message,
    errorCode: result.errorCode ?? null,
  };
}

function buildTraceMetadata(
  route: RouterResult,
  result: HandlerResult,
): Record<string, string | number | boolean | null> {
  const metadata: Record<string, string | number | boolean | null> = {
    intent: route.intent,
    resultKind: result.kind,
  };

  if (result.kind === "success" && result.insertedCount !== undefined) {
    metadata.insertedCount = result.insertedCount;
  }

  if (result.kind === "failure") {
    metadata.errorCode = result.errorCode ?? "unrecognized";
  }

  return metadata;
}
