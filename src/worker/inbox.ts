import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";
import { parseEnvelope } from "../signal/index.js";
import type { AppDeps, HandlerResult, MessageContext } from "./types.js";
import {
  analyzeMessage,
  normalizeHandlerResult,
  persistAnalyzedMessage,
  recordProcessedMessageTrace,
} from "./dispatch.js";
import {
  parseMessageAnalysis,
  serializeMessageAnalysis,
  type MessageAnalysis,
} from "./analysis.js";
import { sendMessage } from "../signal/index.js";
import { withMessageTrace } from "../tracing.js";
import type { RouterResult } from "../routing/schema.js";
import { isUserInputError } from "./errors.js";

const LEASE_DURATION_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1_000;
const RETRY_BASE_DELAY_MS = 15_000;

export async function saveToInbox(deps: AppDeps, payload: unknown): Promise<void> {
  const context = parseEnvelope(payload);
  if (!context) {
    logger.warn({ payload }, "saveToInbox: parseEnvelope failed to parse payload");
    return;
  }

  const rawEnvelope = JSON.stringify(payload);
  if (!rawEnvelope) {
    throw new Error("Could not serialize Signal payload");
  }

  const now = deps.now?.() ?? new Date();

  await deps.db
    .insertInto("inbox")
    .ignore()
    .values({
      message_key: context.messageKey,
      raw_envelope: rawEnvelope,
      status: "pending",
      attempts: 0,
      received_at: now.getTime(),
    })
    .execute();

  logger.info(
    {
      messageKey: context.messageKey,
      sourceAuthor: context.sourceAuthor,
    },
    "saved to inbox",
  );
}

export async function processNextInboxItem(deps: AppDeps): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const nowMs = now.getTime();
  const leaseToken = randomUUID();
  const leaseUntil = nowMs + LEASE_DURATION_MS;

  const target = await deps.db
    .selectFrom("inbox")
    .select("message_key")
    .where("status", "in", ["pending", "analyzed", "saved"])
    .where((eb) =>
      eb.or([
        eb("lease_until", "is", null),
        eb("lease_until", "<", nowMs),
      ]),
    )
    .where((eb) =>
      eb.or([
        eb("next_attempt_at", "is", null),
        eb("next_attempt_at", "<=", nowMs),
      ]),
    )
    .where("attempts", "<", MAX_ATTEMPTS)
    .limit(1)
    .executeTakeFirst();

  if (!target) {
    return false;
  }

  const claimed = await deps.db
    .updateTable("inbox")
    .set({
      lease_token: leaseToken,
      lease_until: leaseUntil,
    })
    .where("message_key", "=", target.message_key)
    .where("status", "in", ["pending", "analyzed", "saved"])
    .where("attempts", "<", MAX_ATTEMPTS)
    .where((eb) =>
      eb.or([
        eb("lease_until", "is", null),
        eb("lease_until", "<", nowMs),
      ]),
    )
    .where((eb) =>
      eb.or([
        eb("next_attempt_at", "is", null),
        eb("next_attempt_at", "<=", nowMs),
      ]),
    )
    .executeTakeFirst();

  if (claimed.numUpdatedRows === 0n) {
    return false;
  }

  const item = await deps.db
    .selectFrom("inbox")
    .selectAll()
    .where("message_key", "=", target.message_key)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (!item) {
    return false;
  }

  let processingStatus = item.status;
  let messageContext: MessageContext | null = null;

  try {
    const parsedContext = deserializeMessageContext(item.raw_envelope);
    if (!parsedContext) {
      throw new Error("Could not deserialize stored Signal payload");
    }
    messageContext = parsedContext;

    await withMessageTrace(
      { text: parsedContext.rawText, sourceTimestamp: parsedContext.sourceTimestamp },
      async () => {
        if (processingStatus === "saved") {
          await deliverSavedItem(
            deps,
            item.message_key,
            parsedContext,
            item.response_text,
            leaseToken,
          );
          return;
        }

        let analysis: MessageAnalysis;
        if (processingStatus === "pending") {
          analysis = await analyzeMessage(deps, parsedContext);

          if (analysis.intent === "ignore") {
            await markIgnored(deps, item.message_key, leaseToken, analysis);
            recordProcessedMessageTrace(routeForAnalysis(analysis), { kind: "silent" });
            return;
          }

          const analyzed = await deps.db
            .updateTable("inbox")
            .set({
              status: "analyzed",
              parsed_json: serializeMessageAnalysis(analysis),
              last_error: null,
              next_attempt_at: null,
            })
            .where("message_key", "=", item.message_key)
            .where("status", "=", "pending")
            .where("lease_token", "=", leaseToken)
            .executeTakeFirst();

          if (analyzed.numUpdatedRows === 0n) {
            throw new Error("Inbox lease was lost while storing analysis");
          }

          processingStatus = "analyzed";
        } else {
          if (!item.parsed_json) {
            throw new Error("Analyzed inbox item has no parsed command");
          }
          analysis = parseMessageAnalysis(item.parsed_json);

          if (analysis.intent === "ignore") {
            await markIgnored(deps, item.message_key, leaseToken, analysis);
            recordProcessedMessageTrace(routeForAnalysis(analysis), { kind: "silent" });
            return;
          }
        }

        let result: HandlerResult | undefined;
        await deps.db.transaction().execute(async (trx) => {
          result = normalizeHandlerResult(
            await persistAnalyzedMessage(deps, parsedContext, analysis, trx),
          );
          if (result.kind === "silent") {
            throw new Error("Non-ignored inbox analysis returned no response");
          }

          const saved = await trx
            .updateTable("inbox")
            .set({
              status: "saved",
              response_text: result.message,
              last_error: null,
              next_attempt_at: null,
            })
            .where("message_key", "=", item.message_key)
            .where("status", "=", "analyzed")
            .where("lease_token", "=", leaseToken)
            .executeTakeFirst();

          if (saved.numUpdatedRows === 0n) {
            throw new Error("Inbox lease was lost while saving result");
          }
        });

        if (!result) {
          throw new Error("Inbox persistence returned no result");
        }
        if (result.kind === "silent") {
          throw new Error("Non-ignored inbox analysis returned no response");
        }

        processingStatus = "saved";
        recordProcessedMessageTrace(routeForAnalysis(analysis), result);
        await deliverSavedItem(deps, item.message_key, parsedContext, result.message, leaseToken);
      },
    );
  } catch (error: unknown) {
    logger.warn({ error, messageKey: item.message_key }, "Failed to process inbox item");
    if (messageContext && isUserInputError(error)) {
      const failedStatus = processingStatus;
      try {
        const responseText = await saveUserFailure(
          deps,
          item.message_key,
          leaseToken,
          failedStatus,
          error.userMessage,
        );
        processingStatus = "saved";
        await deliverSavedItem(
          deps,
          item.message_key,
          messageContext,
          responseText,
          leaseToken,
        );
      } catch (saveError: unknown) {
        await scheduleRetry(deps, item, processingStatus, leaseToken, saveError);
      }
    } else {
      await scheduleRetry(deps, item, processingStatus, leaseToken, error);
    }
  }

  return true;
}

async function deliverSavedItem(
  deps: AppDeps,
  messageKey: string,
  context: MessageContext,
  responseText: string | null,
  leaseToken: string,
): Promise<void> {
  if (!responseText) {
    throw new Error("Saved inbox item has no response text");
  }

  await sendMessage(deps.config, context.sourceAuthor, responseText);

  const confirmed = await deps.db
    .updateTable("inbox")
    .set({
      status: "confirmed",
      lease_token: null,
      lease_until: null,
      next_attempt_at: null,
    })
    .where("message_key", "=", messageKey)
    .where("status", "=", "saved")
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (confirmed.numUpdatedRows === 0n) {
    logger.warn({ messageKey }, "Response sent but inbox confirmation lost its lease");
  }
}

async function markIgnored(
  deps: AppDeps,
  messageKey: string,
  leaseToken: string,
  analysis: MessageAnalysis,
): Promise<void> {
  const ignored = await deps.db
    .updateTable("inbox")
    .set({
      status: "ignored",
      parsed_json: serializeMessageAnalysis(analysis),
      lease_token: null,
      lease_until: null,
      next_attempt_at: null,
      last_error: null,
    })
    .where("message_key", "=", messageKey)
    .where("status", "in", ["pending", "analyzed"])
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (ignored.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while ignoring message");
  }
}

async function saveUserFailure(
  deps: AppDeps,
  messageKey: string,
  leaseToken: string,
  status: "pending" | "analyzed" | "saved" | "confirmed" | "ignored" | "failed",
  responseText: string,
): Promise<string> {
  const saved = await deps.db
    .updateTable("inbox")
    .set({
      status: "saved",
      response_text: responseText,
      last_error: null,
      next_attempt_at: null,
    })
    .where("message_key", "=", messageKey)
    .where("status", "=", status)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (saved.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while saving user feedback");
  }

  return responseText;
}

async function scheduleRetry(
  deps: AppDeps,
  item: {
    message_key: string;
    attempts: number;
  },
  processingStatus: "pending" | "analyzed" | "saved" | "confirmed" | "ignored" | "failed",
  leaseToken: string,
  error: unknown,
): Promise<void> {
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const attempts = item.attempts + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const backoffMs = Math.pow(2, attempts) * RETRY_BASE_DELAY_MS;
  const errorMessage = error instanceof Error ? error.message : "Inbox processing failed";

  const updated = await deps.db
    .updateTable("inbox")
    .set({
      status: terminal ? "failed" : processingStatus,
      attempts,
      next_attempt_at: terminal ? null : nowMs + backoffMs,
      lease_token: null,
      lease_until: null,
      last_error: errorMessage,
      failed_at: terminal ? nowMs : null,
    })
    .where("message_key", "=", item.message_key)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (updated.numUpdatedRows === 0n) {
    logger.warn(
      { messageKey: item.message_key },
      "Could not schedule inbox retry because the lease was lost",
    );
    return;
  }

  if (terminal) {
    logger.error(
      { messageKey: item.message_key, attempts, error: errorMessage },
      "Inbox item moved to failed state",
    );
    return;
  }

  logger.info(
    {
      messageKey: item.message_key,
      attempts,
      nextAttemptAt: new Date(nowMs + backoffMs).toISOString(),
      backoffMs,
    },
    "Scheduling retry for inbox item",
  );
}

function deserializeMessageContext(rawEnvelope: string): MessageContext | null {
  try {
    const parsed: unknown = JSON.parse(rawEnvelope);
    const legacyContext = parseLegacyMessageContext(parsed);
    return legacyContext ?? parseEnvelope(parsed);
  } catch {
    return null;
  }
}

function parseLegacyMessageContext(value: unknown): MessageContext | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceAuthor = value.sourceAuthor;
  const sourceTimestamp = value.sourceTimestamp;
  const rawText = value.rawText;
  const messageKey = value.messageKey;

  if (
    typeof sourceAuthor !== "string" ||
    typeof sourceTimestamp !== "number" ||
    typeof rawText !== "string" ||
    typeof messageKey !== "string"
  ) {
    return null;
  }

  return { sourceAuthor, sourceTimestamp, rawText, messageKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routeForAnalysis(analysis: MessageAnalysis): RouterResult {
  switch (analysis.intent) {
    case "expense":
      return { intent: "expense" };
    case "report":
      return { intent: "report" };
    case "category":
      return { intent: "category" };
    case "modification":
      return { intent: "modification" };
    case "ignore":
      return { intent: "ignore" };
  }
}

export async function runInboxProcessor(
  deps: AppDeps,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const didWork = await processNextInboxItem(deps);
      if (didWork && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      } else if (!didWork && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error: unknown) {
      logger.error({ error }, "Error in inbox processor loop");
      if (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }
}
