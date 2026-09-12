import { logger } from "../../lib/logger.js";
import type { AppDeps } from "../types.js";
import type { InboxStatus } from "./storage.js";

export const INBOX_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
export const INBOX_RETENTION_BATCH_SIZE = 100;

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const TERMINAL_INBOX_STATUSES = [
  "confirmed",
  "ignored",
  "failed",
] satisfies readonly InboxStatus[];

export async function cleanupExpiredInbox(
  deps: AppDeps,
  now = deps.now?.() ?? new Date(),
  signal?: AbortSignal,
): Promise<number> {
  const cutoff = now.getTime() - INBOX_RETENTION_MS;
  let deleted = 0;

  while (true) {
    if (signal?.aborted) {
      break;
    }

    const deletedBatch = await deps.db.transaction().execute(async (trx) => {
      const candidates = await trx
        .selectFrom("inbox")
        .select("message_key")
        .where("status", "in", TERMINAL_INBOX_STATUSES)
        .where("received_at", "<", cutoff)
        .orderBy("received_at", "asc")
        .orderBy("message_key", "asc")
        .limit(INBOX_RETENTION_BATCH_SIZE)
        .execute();

      const messageKeys = candidates.map((candidate) => candidate.message_key);
      if (messageKeys.length === 0) {
        return 0;
      }

      const result = await trx
        .deleteFrom("inbox")
        .where("message_key", "in", messageKeys)
        .where("status", "in", TERMINAL_INBOX_STATUSES)
        .executeTakeFirst();

      return Number(result.numDeletedRows);
    });

    deleted += deletedBatch;
    if (deletedBatch === 0 || deletedBatch < INBOX_RETENTION_BATCH_SIZE) {
      break;
    }
  }

  if (deleted > 0) {
    logger.info({ deleted }, "Expired inbox records removed");
  }

  return deleted;
}

export async function runInboxRetention(
  deps: AppDeps,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await cleanupExpiredInbox(deps, undefined, signal);
    } catch (error: unknown) {
      logger.error({ error }, "Inbox retention cleanup failed");
    }

    if (signal.aborted) {
      return;
    }
    await waitForRetentionInterval(signal);
  }
}

function waitForRetentionInterval(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout;
    const onAbort = (): void => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, RETENTION_INTERVAL_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
  });
}
