import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";
import { parseEnvelope } from "../signal/index.js";
import type { AppDeps } from "./types.js";
import { processMessage } from "./dispatch.js";
import { sendMessage } from "../signal/index.js";
import { withMessageTrace } from "../tracing.js";

const LEASE_DURATION_MS = 60_000; // 1 minute
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1_000;

export async function saveToInbox(deps: AppDeps, payload: unknown): Promise<void> {
  const context = parseEnvelope(payload);
  if (!context) {
    logger.warn({ payload }, "saveToInbox: parseEnvelope failed to parse payload");
    return;
  }

  const now = deps.now?.() ?? new Date();

  await deps.db
    .insertInto("inbox")
    .ignore()
    .values({
      message_key: context.messageKey,
      raw_envelope: JSON.stringify(context),
      status: "pending",
      attempts: 0,
      received_at: now.getTime(),
    })
    .execute();

  logger.info({ messageKey: context.messageKey, sourceAuthor: context.sourceAuthor, rawText: context.rawText }, "saved to inbox");
}

export async function processNextInboxItem(deps: AppDeps): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const nowMs = now.getTime();

  const leaseToken = randomUUID();
  const leaseUntil = nowMs + LEASE_DURATION_MS;

  // Find one row to lease
  const target = await deps.db
    .selectFrom("inbox")
    .select("message_key")
    .where("status", "in", ["pending", "analyzed"])
    .where((eb) =>
      eb.or([
        eb("lease_until", "is", null),
        eb("lease_until", "<", nowMs),
      ])
    )
    .where((eb) =>
      eb.or([
        eb("next_attempt_at", "is", null),
        eb("next_attempt_at", "<=", nowMs),
      ])
    )
    .where("attempts", "<", MAX_ATTEMPTS)
    .limit(1)
    .executeTakeFirst();

  if (!target) {
    return false; // nothing to do
  }

  const updateResult = await deps.db
    .updateTable("inbox")
    .set({
      lease_token: leaseToken,
      lease_until: leaseUntil,
    })
    .where("message_key", "=", target.message_key)
    .where((eb) =>
      eb.or([
        eb("lease_token", "is", null),
        eb("lease_until", "<", nowMs),
      ])
    )
    .executeTakeFirst();

  if (updateResult.numUpdatedRows === 0n) {
    return false; // lost the race
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

  let context;
  try {
    const parsed = JSON.parse(item.raw_envelope);
    // If it's a slim context (new format) it has rawText, if it's a legacy raw envelope (old format) parseEnvelope handles it.
    if (parsed && typeof parsed.rawText === "string") {
      context = parsed;
    } else {
      context = parseEnvelope(parsed);
    }
  } catch (err) {
    context = null;
  }

  if (!context) {
    await deps.db
      .updateTable("inbox")
      .set({ status: "ignored", lease_token: null, lease_until: null })
      .where("message_key", "=", item.message_key)
      .execute();
    return true;
  }

  try {
    await withMessageTrace(
      { text: context.rawText, sourceTimestamp: context.sourceTimestamp },
      async () => {
        const result = await processMessage(deps, context);

        if (result.kind === "silent") {
          await deps.db
            .updateTable("inbox")
            .set({ status: "ignored", lease_token: null, lease_until: null })
            .where("message_key", "=", item.message_key)
            .where("lease_token", "=", leaseToken)
            .execute();
          logger.info({ rawText: context.rawText }, "ignored");
          return;
        }

        await deps.db
          .updateTable("inbox")
          .set({
            status: "saved",
            response_text: result.message,
          })
          .where("message_key", "=", item.message_key)
          .where("lease_token", "=", leaseToken)
          .execute();

        // Now send response
        await sendMessage(deps.config, context.sourceAuthor, result.message);

        await deps.db
          .updateTable("inbox")
          .set({ status: "confirmed", lease_token: null, lease_until: null })
          .where("message_key", "=", item.message_key)
          .where("lease_token", "=", leaseToken)
          .execute();

        if (result.kind === "success") {
          logger.info({ message: result.message }, "success");
        } else {
          logger.info({ message: result.message }, "failure");
        }
      }
    );
  } catch (error) {
    logger.warn({ error, messageKey: item.message_key }, "Failed to process inbox item");

    const attempts = item.attempts + 1;
    // Increase backoff to avoid hammering the API if 429 occurs (10s, 20s, 40s, 80s)
    const backoffMs = Math.pow(2, attempts) * 5000;

    await deps.db
      .updateTable("inbox")
      .set({
        attempts,
        next_attempt_at: nowMs + backoffMs,
        lease_token: null,
        lease_until: null,
      })
      .where("message_key", "=", item.message_key)
      .where("lease_token", "=", leaseToken)
      .execute();
  }

  return true;
}

export async function runInboxProcessor(
  deps: AppDeps,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    try {
      const didWork = await processNextInboxItem(deps);
      if (didWork && !signal.aborted) {
        // Throttle processing of consecutive messages to prevent 429 Too Many Requests
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } else if (!didWork && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      logger.error({ error }, "Error in inbox processor loop");
      if (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }
}
