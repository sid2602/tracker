import { handleExpense } from "../domains/expenses/index.js";
import {
  analyzeExpense,
  persistExpense,
} from "../domains/expenses/handler.js";
import { logger } from "../lib/logger.js";
import {
  analyzeReport,
  persistReport,
} from "../domains/reports/handler.js";
import { handleReport } from "../domains/reports/index.js";
import { analyzeCategory, persistCategory } from "../domains/categories/handler.js";
import { handleCategory } from "../domains/categories/index.js";
import {
  analyzeModification,
  persistModification,
} from "../domains/modifications/handler.js";
import { handleModification } from "../domains/modifications/index.js";
import { UNRECOGNIZED_MESSAGE } from "../lib/messages.js";
import { routeMessage } from "../routing/router.js";
import { recordMessageTrace } from "../tracing.js";
import type { RouterResult } from "../routing/schema.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "./types.js";
import type { MessageAnalysis } from "./analysis.js";
import { isUserInputError } from "./errors.js";

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
    case "category":
      return handleCategory(deps, context);
    case "modification":
      return handleModification(deps, context);
    case "ignore":
      return { kind: "silent" };
  }
}

export async function analyzeMessage(
  deps: AppDeps,
  context: MessageContext,
): Promise<MessageAnalysis> {
  const route = await routeMessage(deps.config, context.rawText);
  logger.info({ route }, "routed message intent");

  switch (route.intent) {
    case "expense":
      return {
        version: 1,
        intent: "expense",
        parsed: await analyzeExpense(deps, context),
      };
    case "report":
      return {
        version: 1,
        intent: "report",
        parsed: await analyzeReport(deps, context),
      };
    case "category":
      return {
        version: 1,
        intent: "category",
        parsed: await analyzeCategory(deps, context),
      };
    case "modification":
      return {
        version: 1,
        intent: "modification",
        parsed: await analyzeModification(deps, context),
      };
    case "ignore":
      return { version: 1, intent: "ignore" };
  }
}

export async function persistAnalyzedMessage(
  deps: AppDeps,
  context: MessageContext,
  analysis: MessageAnalysis,
  db: QueryCreator<AppDatabase> = deps.db,
): Promise<HandlerResult> {
  switch (analysis.intent) {
    case "expense":
      return persistExpense(db, context, analysis.parsed);
    case "report":
      return persistReport(db, context.rawText, analysis.parsed);
    case "category":
      return persistCategory(db, context.rawText, analysis.parsed);
    case "modification":
      return persistModification(db, context, analysis.parsed);
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
    const finalResult = normalizeHandlerResult(result);
    recordProcessedMessageTrace(route, finalResult);
    return finalResult;
  } catch (error: unknown) {
    if (isUserInputError(error)) {
      return {
        kind: "success",
        message: error.userMessage,
      };
    }
    throw error;
  }
}

export function normalizeHandlerResult(result: HandlerResult): HandlerResult {
  if (result.kind !== "failure") {
    return result;
  }

  return {
    kind: "failure",
    message: UNRECOGNIZED_MESSAGE,
    errorCode: "unrecognized",
  };
}

export function recordProcessedMessageTrace(
  route: RouterResult,
  result: HandlerResult,
): void {
  recordMessageTrace({
    metadata: buildTraceMetadata(route, result),
    output: buildTraceOutput(result),
  });
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
