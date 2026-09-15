import { logger } from "../lib/logger.js";
import { UNRECOGNIZED_MESSAGE } from "../lib/messages.js";
import { productRegistry } from "../products/index.js";
import { routeMessage } from "../routing/router.js";
import {
  isCanonicalActionableIntent,
  toCanonicalIntent,
  type CanonicalIntent,
} from "../routing/intents.js";
import { recordMessageTrace } from "../tracing.js";
import type { RouterResult } from "../routing/schema.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "./types.js";
import type { MessageAnalysis } from "./analysis.js";
import { isUserInputError } from "./errors.js";
import { messageAnalysisSchema } from "./analysis.js";

export async function dispatchMessage(
  deps: AppDeps,
  context: MessageContext,
  route: RouterResult,
): Promise<HandlerResult> {
  const intent = toCanonicalIntent(route.intent);
  if (!isCanonicalActionableIntent(intent)) {
    return { kind: "silent" };
  }

  const handle = productRegistry.handleByIntent.get(intent);
  if (handle === undefined) {
    throw new Error(`No handle registered for intent "${intent}"`);
  }
  return handle(deps, context);
}

export async function analyzeMessage(
  deps: AppDeps,
  context: MessageContext,
): Promise<MessageAnalysis> {
  const route = await routeMessage(deps.config, context.rawText);
  logger.info({ route }, "routed message intent");

  const intent = toCanonicalIntent(route.intent);
  if (!isCanonicalActionableIntent(intent)) {
    return { version: 1, intent: "ignore" };
  }

  const analyze = productRegistry.analyzeByIntent.get(intent);
  if (analyze === undefined) {
    throw new Error(`No analyze registered for intent "${intent}"`);
  }

  const parsed = await analyze(deps, context);
  return messageAnalysisSchema.parse({
    version: 1,
    intent,
    parsed,
  });
}

export async function persistAnalyzedMessage(
  deps: AppDeps,
  context: MessageContext,
  analysis: MessageAnalysis,
  db: QueryCreator<AppDatabase> = deps.db,
): Promise<HandlerResult> {
  if (analysis.intent === "ignore") {
    return { kind: "silent" };
  }

  const persist = productRegistry.persistByIntent.get(analysis.intent);
  if (persist === undefined) {
    throw new Error(`No persist registered for intent "${analysis.intent}"`);
  }
  return persist(deps, context, analysis.parsed, db);
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
    metadata: buildTraceMetadata(toCanonicalIntent(route.intent), result),
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
  intent: CanonicalIntent,
  result: HandlerResult,
): Record<string, string | number | boolean | null> {
  const metadata: Record<string, string | number | boolean | null> = {
    intent,
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
