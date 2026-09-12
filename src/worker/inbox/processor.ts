import { logger } from "../../lib/logger.js";
import { withMessageTrace } from "../../tracing.js";
import {
  analyzeMessage,
  normalizeHandlerResult,
  persistAnalyzedMessage,
  recordProcessedMessageTrace,
} from "../dispatch.js";
import {
  parseMessageAnalysis,
  serializeMessageAnalysis,
  type MessageAnalysis,
} from "../analysis.js";
import { isUserInputError } from "../errors.js";
import type { RouterResult } from "../../routing/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../types.js";
import { deliverSavedItem } from "./delivery.js";
import {
  deserializeStoredMessage,
  handleHistoricalSelfEcho,
  handleHistoricalUnauthorized,
  quarantineHistoricalMessage,
} from "./legacy.js";
import {
  claimNextInboxItem,
  markIgnored,
  saveUserFailure,
  scheduleRetry,
  type InboxProcessorOptions,
} from "./policy.js";

export async function processNextInboxItem(
  deps: AppDeps,
  options: InboxProcessorOptions = {},
): Promise<boolean> {
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const claim = await claimNextInboxItem(deps.db, nowMs, options);
  if (claim.kind === "none") {
    return false;
  }
  if (claim.kind === "exhausted") {
    return true;
  }

  const { item, leaseToken } = claim;
  let processingStatus = item.status;
  let messageContext: MessageContext | null = null;

  try {
    const storedMessage = deserializeStoredMessage(item.raw_envelope, {
      selfNumber: deps.config.signalPhoneNumber,
      allowedInputDeviceIds: deps.config.signalAllowedInputDeviceIds,
    });
    if (storedMessage.kind === "self_echo") {
      await handleHistoricalSelfEcho(deps, item, leaseToken);
      return true;
    }
    if (storedMessage.kind === "unauthorized") {
      await handleHistoricalUnauthorized(deps, item, leaseToken);
      return true;
    }
    if (storedMessage.kind === "quarantine") {
      await quarantineHistoricalMessage(deps, item, leaseToken);
      return true;
    }
    if (storedMessage.kind === "invalid") {
      throw new Error("Could not deserialize stored Signal payload");
    }
    const parsedContext = storedMessage.context;
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
            recordProcessedMessageTrace(routeForAnalysis(analysis), {
              kind: "silent",
            });
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
            recordProcessedMessageTrace(routeForAnalysis(analysis), {
              kind: "silent",
            });
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
        await deliverSavedItem(
          deps,
          item.message_key,
          parsedContext,
          result.message,
          leaseToken,
        );
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
        await scheduleRetry(
          deps,
          item,
          processingStatus,
          leaseToken,
          saveError,
        );
      }
    } else {
      await scheduleRetry(deps, item, processingStatus, leaseToken, error);
    }
  }

  return true;
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
